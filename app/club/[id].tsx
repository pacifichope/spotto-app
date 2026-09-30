import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HostAvatar from '@/components/HostAvatar';
import CoverPhoto from '@/components/CoverPhoto';
import SafetyActionsSheet from '@/components/SafetyActionsSheet';
import SnsLinksRow from '@/components/SnsLinksRow';
import { theme } from '@/constants/theme';
import {
  applyClubRowToClub,
  clubFromPublicProfile,
  eventsForClub,
  clubMembersForDisplay,
  clubViewerFromUser,
  normalizeClubId,
  resolveClub,
  type Club,
  type ClubMember,
} from '@/lib/clubs';
import { fetchClubMembersWithAvatars } from '@/lib/clubMembersRemote';
import { fetchClubRow } from '@/lib/clubsTableRemote';
import { useClubs } from '@/lib/clubsContext';
import { useAuth } from '@/lib/authContext';
import {
  confirmBlockUser,
  confirmUnblockUser,
  eventHostUserId,
} from '@/lib/blocks';
import { useBlocks } from '@/lib/blocksContext';
import { formatEventSchedule, isEventCancelled, isEventPast } from '@/lib/events';
import { useEvents } from '@/lib/eventsContext';
import { MY_ORGANIZER_ID } from '@/lib/organizerProfile';
import { useOrganizerEditor } from '@/lib/createEventAccessContext';
import { safeResolveDisplayImageUrl } from '@/lib/imageUrls';
import { fetchPublicProfileByUserId } from '@/lib/userProfileRemote';
import { useUserProfile } from '@/lib/userProfileContext';

type ActivityFilter = 'all' | 'upcoming' | 'past' | `date:${string}`;

function clubDateChipLabel(isoDate: string) {
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][parsed.getDay()];
  return `${parsed.getMonth() + 1}/${parsed.getDate()}（${weekday}）`;
}

export default function ClubProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const clubId = normalizeClubId(params.id);
  const { events, organizerProfile, currentUserId, eventsLoading } =
    useEvents();
  const { isClubJoined, joinClub, leaveClub } = useClubs();
  const { requireAuth, requireCompleteProfile, user } = useAuth();
  const { userProfile } = useUserProfile();
  const openOrganizerEditor = useOrganizerEditor();
  const {
    blockUser,
    unblockUser,
    isBlocked,
    isHidden,
    filterEvents,
  } = useBlocks();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [remoteClub, setRemoteClub] = useState<Club | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [clubRowOverlay, setClubRowOverlay] = useState<Club | null>(null);
  const [enrichedMembers, setEnrichedMembers] = useState<ClubMember[] | null>(
    null,
  );

  const resolved = useMemo(
    () =>
      clubId
        ? resolveClub(clubId, events, organizerProfile, currentUserId)
        : null,
    [clubId, events, organizerProfile, currentUserId],
  );

  const clubBase = clubRowOverlay ?? resolved ?? remoteClub;
  // クラブブランド画像は clubBase の cover / image（イベント・サークル画像）。
  // メンバー enrichment の個人アバターで上書きしない。
  const club = useMemo(() => {
    if (!clubBase) return null;
    return {
      ...clubBase,
      members: enrichedMembers ?? clubBase.members,
    };
  }, [clubBase, enrichedMembers]);

  // clubs テーブルのカバー／アイコンをマージ
  useEffect(() => {
    let cancelled = false;
    if (!clubId) {
      setClubRowOverlay(null);
      return;
    }
    void (async () => {
      const result = await fetchClubRow(clubId);
      if (cancelled) return;
      if (!result.ok || !result.data) {
        setClubRowOverlay(null);
        return;
      }
      const base =
        resolveClub(clubId, events, organizerProfile, currentUserId) ??
        clubFromPublicProfile(clubId, {
          name: result.data.name,
          imageUri: result.data.image_url,
          coverUri: result.data.cover_image_url,
          bio: result.data.bio,
        });
      setClubRowOverlay(applyClubRowToClub(base, result.data));
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, events, organizerProfile, currentUserId]);

  // ローカル解決できない場合は profiles からフォールバック取得
  useEffect(() => {
    let cancelled = false;
    if (!clubId) {
      setRemoteClub(null);
      setRemoteError('クラブ ID が指定されていません。');
      return;
    }
    if (resolved) {
      setRemoteClub(null);
      setRemoteError(null);
      setRemoteLoading(false);
      return;
    }
    // イベント一覧の初回ロード中は待つ
    if (eventsLoading) {
      setRemoteLoading(true);
      return;
    }

    // サンプル／hostId 形式でないと profiles 取得は無意味な場合があるが、
    // Firebase UID なら公開プロフィールで最低限表示できる
    setRemoteLoading(true);
    setRemoteError(null);
    void (async () => {
      try {
        const result = await fetchPublicProfileByUserId(clubId);
        if (cancelled) return;
        if (!result.ok) {
          setRemoteClub(null);
          setRemoteError(
            result.error ||
              'クラブ情報を取得できませんでした。時間をおいて再度お試しください。',
          );
          return;
        }
        if (!result.data.name.trim()) {
          setRemoteClub(null);
          setRemoteError(
            'このクラブは削除されたか、現在表示できません。',
          );
          return;
        }
        setRemoteClub(
          clubFromPublicProfile(clubId, {
            name: result.data.name,
            // 個人 avatar はクラブ画像に使わない（clubFromPublicProfile 側でも無視）
            imageUri: undefined,
          }),
        );
        setRemoteError(null);
      } catch (error) {
        if (cancelled) return;
        console.warn('[club] remote resolve failed', error);
        setRemoteClub(null);
        setRemoteError(
          'クラブ情報を取得できませんでした。時間をおいて再度お試しください。',
        );
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clubId, resolved, eventsLoading]);

  // メンバー一覧: event_participants + profiles.avatar_url を結合（個人アバターはメンバー行のみ）
  useEffect(() => {
    let cancelled = false;
    const base = resolved ?? remoteClub;
    if (!base) {
      setEnrichedMembers(null);
      return;
    }
    setEnrichedMembers(null);
    void (async () => {
      try {
        const nextMembers = await fetchClubMembersWithAvatars({
          club: base,
          events,
          currentUserId,
        });
        if (cancelled) return;
        setEnrichedMembers(nextMembers);
      } catch (error) {
        if (cancelled) return;
        console.warn('[club] member avatar enrich failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolved, remoteClub, events, currentUserId]);

  const activities = useMemo(
    () => (club ? filterEvents(eventsForClub(club.id, events)) : []),
    [club, events, filterEvents],
  );
  // club.id とルート id が違う場合でも、ルート id 側のイベントも拾う
  const activitiesWithRoute = useMemo(() => {
    if (!clubId || !club) return activities;
    if (club.id === clubId) return activities;
    const extra = filterEvents(eventsForClub(clubId, events));
    const byId = new Map(activities.map((e) => [e.id, e]));
    for (const event of extra) byId.set(event.id, event);
    return [...byId.values()];
  }, [activities, club, clubId, events, filterEvents]);

  const upcomingCount = activitiesWithRoute.filter(
    (event) => !isEventPast(event) && !isEventCancelled(event),
  ).length;
  const activityDates = useMemo(() => {
    const seen = new Set<string>();
    return [...activitiesWithRoute]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((event) => {
        if (seen.has(event.date)) return false;
        seen.add(event.date);
        return true;
      })
      .map((event) => event.date);
  }, [activitiesWithRoute]);
  const visibleActivities = useMemo(() => {
    const list = filter.startsWith('date:')
      ? activitiesWithRoute.filter((event) => event.date === filter.slice(5))
      : filter === 'upcoming'
        ? activitiesWithRoute.filter(
            (event) => !isEventPast(event) && !isEventCancelled(event),
          )
        : filter === 'past'
          ? activitiesWithRoute.filter(
              (event) => isEventPast(event) || isEventCancelled(event),
            )
          : activitiesWithRoute;
    return [...list].sort((a, b) => a.date.localeCompare(b.date));
  }, [activitiesWithRoute, filter]);

  const joined = club
    ? isClubJoined(club.id) || (clubId ? isClubJoined(clubId) : false)
    : false;
  const isOwnClub = Boolean(
    club &&
      (club.id === MY_ORGANIZER_ID ||
        club.id === 'me' ||
        (currentUserId && club.id === currentUserId) ||
        (currentUserId && clubId === currentUserId)),
  );
  const viewer = clubViewerFromUser(user, userProfile);
  const members = (club
    ? clubMembersForDisplay(club, isOwnClub ? null : viewer, joined)
    : []
  ).filter((member) => member.self || !isHidden(member.id));
  const hostId = club
    ? isOwnClub
      ? currentUserId || MY_ORGANIZER_ID
      : eventHostUserId({ host: club.hostName, hostId: club.id })
    : '';
  const hostBlocked = isBlocked(hostId);

  const back = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/mypage');
  };

  const handleJoinRef = useRef<() => void>(() => undefined);
  const performJoin = () => {
    if (!club || isOwnClub) return;
    const joinId = clubId || club.id;
    if (isClubJoined(club.id) || (clubId && isClubJoined(clubId))) {
      const leave = () => {
        leaveClub(club.id);
        if (clubId && clubId !== club.id) leaveClub(clubId);
      };
      if (Platform.OS === 'web') {
        const ok =
          typeof window !== 'undefined' &&
          window.confirm(`${club.name} から退会しますか？`);
        if (ok) leave();
        return;
      }
      Alert.alert('クラブを退会しますか？', `${club.name} から退会します。`, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '退会する',
          style: 'destructive',
          onPress: leave,
        },
      ]);
      return;
    }
    joinClub(joinId);
  };
  const handleJoin = () => {
    if (!club || isOwnClub) return;
    if (!requireAuth(() => handleJoinRef.current(), 'join-club')) return;
    if (!requireCompleteProfile(() => handleJoinRef.current())) return;
    performJoin();
  };
  handleJoinRef.current = performJoin;

  if (!clubId) {
    return (
      <View style={[styles.missing, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.missingTitle}>クラブが見つかりません</Text>
        <Text style={styles.missingBody}>
          リンクが正しくないか、古いリンクの可能性があります。
        </Text>
        <Pressable style={styles.homeBtn} onPress={back}>
          <Text style={styles.homeBtnText}>戻る</Text>
        </Pressable>
      </View>
    );
  }

  if (!club && (eventsLoading || remoteLoading)) {
    return (
      <View style={[styles.missing, { paddingTop: insets.top + 24 }]}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <Text style={[styles.missingBody, { marginTop: 16 }]}>
          クラブ情報を読み込み中…
        </Text>
      </View>
    );
  }

  if (!club) {
    return (
      <View style={[styles.missing, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.missingTitle}>クラブが見つかりません</Text>
        <Text style={styles.missingBody}>
          {remoteError ||
            'このクラブは削除されたか、現在表示できません。参加一覧から再度お試しください。'}
        </Text>
        <Pressable style={styles.homeBtn} onPress={back}>
          <Text style={styles.homeBtnText}>戻る</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 108 + insets.bottom }}
      >
        <View style={styles.coverWrap}>
          <CoverPhoto
            uri={club.coverUri}
            fallbackUri={club.imageUri}
            style={styles.cover}
          />
          <View style={styles.coverShade} />
          <Pressable
            onPress={back}
            style={[styles.navBtn, { top: Math.max(insets.top, 10) }]}
            accessibilityRole="button"
            accessibilityLabel="戻る"
          >
            <SymbolView
              name={{
                ios: 'chevron.left',
                android: 'chevron_left',
                web: 'chevron_left',
              }}
              tintColor="#FFFFFF"
              size={22}
              fallback={<Text style={styles.navFallback}>‹</Text>}
            />
          </Pressable>
          {!isOwnClub ? (
            <Pressable
              onPress={() => setSafetyOpen(true)}
              style={[styles.menuBtn, { top: Math.max(insets.top, 10) }]}
              accessibilityRole="button"
              accessibilityLabel="メニュー"
            >
              <Text style={styles.menuMark}>⋯</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={openOrganizerEditor}
              style={[styles.menuBtn, styles.editCoverBtn, { top: Math.max(insets.top, 10) }]}
              accessibilityRole="button"
              accessibilityLabel="クラブを編集"
            >
              <Text style={styles.editCoverText}>編集</Text>
            </Pressable>
          )}
        </View>

          <View style={styles.identity}>
          <View style={styles.avatarWrap}>
            <HostAvatar
              name={club.name}
              imageUri={
                // アイコン優先（カバーと分離）
                safeResolveDisplayImageUrl(club.imageUri) ||
                club.imageUri ||
                safeResolveDisplayImageUrl(club.coverUri) ||
                club.coverUri
              }
              size={72}
            />
          </View>
          <View style={styles.identityBody}>
            <Text style={styles.name}>{club.name}</Text>
            <Text style={styles.hostLine}>主催 {club.hostName}</Text>
            <Text style={styles.statsLine}>
              主催イベント {activitiesWithRoute.length}件 · メンバー {members.length}人
              {club.tag ? ` · ${club.tag}` : ''}
            </Text>
            {club.bio?.trim() ? (
              <Text style={styles.bio}>{club.bio}</Text>
            ) : null}
            {club.snsLinks && club.snsLinks.length > 0 ? (
              <View style={styles.snsBlock}>
                <Text style={styles.snsTitle}>SNS / Web</Text>
                <SnsLinksRow links={club.snsLinks} />
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.memberCard}>
          <Text style={styles.memberTitle}>
            メンバー · {members.length}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.memberRow}
          >
            {members.map((member, index) => (
              <View
                key={member.id ?? `${member.name}-${index}`}
                style={styles.memberItem}
              >
                <HostAvatar
                  name={member.name}
                  imageUri={member.imageUri}
                  size={44}
                />
                {member.role === 'host' ? (
                  <View style={styles.bossTag}>
                    <Text style={styles.bossTagText}>主催</Text>
                  </View>
                ) : member.self ? (
                  <View style={styles.selfTag}>
                    <Text style={styles.selfTagText}>自分</Text>
                  </View>
                ) : null}
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.self ? `${member.name}` : member.name}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.activityHead}>
          <Text style={styles.sectionTitle}>Club activities</Text>
          <Text style={styles.sectionHint}>このクラブのイベント</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(
            [
              ['all', 'すべて'],
              ['upcoming', `開催予定 · ${upcomingCount}`],
              ['past', '終了'],
              ...activityDates.map(
                (date) =>
                  [`date:${date}`, clubDateChipLabel(date)] as const,
              ),
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[
                styles.filterChip,
                filter === key && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === key && styles.filterTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.activityList}>
          {visibleActivities.length === 0 ? (
            <Text style={styles.emptyActivity}>該当するイベントはありません</Text>
          ) : (
            visibleActivities.map((event) => {
              const ended = isEventPast(event);
              const cancelled = isEventCancelled(event);
              const { monthDay, time } = formatEventSchedule(event);
              return (
                <Pressable
                  key={event.id}
                  style={styles.activityCard}
                  onPress={() => router.push(`/event/${event.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={event.title}
                >
                  <Image
                    source={{ uri: event.imageUri }}
                    style={styles.activityThumb}
                  />
                  <View style={styles.activityBody}>
                    <View style={styles.activityTop}>
                      <Text
                        style={[
                          styles.activityBadge,
                          (ended || cancelled) && styles.activityBadgeEnded,
                        ]}
                      >
                        {cancelled ? '中止' : ended ? '開催終了' : '募集中'}
                      </Text>
                      <Text style={styles.activityWhen}>
                        {monthDay} {time}
                      </Text>
                    </View>
                    <Text style={styles.activityTitle} numberOfLines={2}>
                      {event.title}
                    </Text>
                    <Text style={styles.activityMeta} numberOfLines={1}>
                      {event.sport} · {event.joinedCount}人参加
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        {isOwnClub ? (
          <View style={styles.ownClubNote}>
            <Text style={styles.ownClubText}>あなたのクラブです</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.joinBtn, joined && styles.joinBtnOn]}
            onPress={handleJoin}
            accessibilityRole="button"
            accessibilityLabel={
              joined ? '参加済み。タップするとクラブから退出します' : 'クラブに参加'
            }
          >
            <Text style={[styles.joinBtnText, joined && styles.joinBtnTextOn]}>
              {joined ? '参加済み（Joined）' : 'Join in  クラブに参加'}
            </Text>
          </Pressable>
        )}
      </View>
      {!isOwnClub ? (
        <SafetyActionsSheet
          visible={safetyOpen}
          name={club.hostName}
          targetId={hostId}
          targetType="user"
          isBlocked={hostBlocked}
          onClose={() => setSafetyOpen(false)}
          onBlock={() =>
            confirmBlockUser(club.hostName, () => {
              const hostMember = members.find((m) => m.role === 'host');
              void blockUser({
                id: hostId,
                name: club.hostName,
                // ブロック対象は主催者個人。クラブカバーではなくメンバー側アバター
                imageUri: hostMember?.imageUri,
                bio: club.bio,
              });
            })
          }
          onUnblock={() =>
            confirmUnblockUser(club.hostName, () => {
              void unblockUser(hostId);
            })
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    position: 'relative',
  },
  coverWrap: {
    position: 'relative',
    height: 220,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  navBtn: {
    position: 'absolute',
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtn: {
    position: 'absolute',
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCoverBtn: {
    width: 'auto',
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  editCoverText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  menuMark: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: -6,
  },
  navFallback: {
    color: '#FFF',
    fontSize: 22,
    marginTop: -2,
  },
  identity: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  avatarWrap: {
    marginTop: -36,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: theme.colors.surfaceAlt,
    borderRadius: 40,
  },
  identityBody: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 8,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
  },
  hostLine: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primaryDark,
    textAlign: 'center',
  },
  statsLine: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  bio: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  snsBlock: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  snsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    letterSpacing: 0.3,
  },
  memberCard: {
    marginTop: 18,
    marginHorizontal: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  memberTitle: {
    marginHorizontal: 16,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
  memberRow: {
    paddingHorizontal: 14,
    gap: 12,
  },
  memberItem: {
    width: 64,
    alignItems: 'center',
    gap: 4,
  },
  bossTag: {
    position: 'absolute',
    top: 32,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  bossTagText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '800',
  },
  selfTag: {
    position: 'absolute',
    top: 32,
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  selfTagText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '800',
  },
  memberName: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    maxWidth: 64,
    textAlign: 'center',
  },
  activityHead: {
    marginTop: 22,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  sectionHint: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  filterTextActive: {
    color: theme.colors.onPrimary,
  },
  activityList: {
    marginTop: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  emptyActivity: {
    paddingVertical: 24,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  activityCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  activityThumb: {
    width: 92,
    height: 92,
  },
  activityBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 0,
  },
  activityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  activityBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.onPrimary,
    backgroundColor: theme.colors.primary,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  activityBadgeEnded: {
    backgroundColor: '#9CA3AF',
  },
  activityWhen: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
  activityMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  joinBtn: {
    minHeight: 52,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnOn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  joinBtnText: {
    color: theme.colors.onPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  joinBtnTextOn: {
    color: theme.colors.textSecondary,
  },
  ownClubNote: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownClubText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    paddingHorizontal: 28,
  },
  missingTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  missingBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  homeBtn: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  homeBtnText: {
    color: '#FFF',
    fontWeight: '800',
  },
});
