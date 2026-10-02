import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
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
import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import { clubHref } from '@/lib/clubNavigation';
import {
  clubIdFromEvent,
  clubMembersForDisplay,
  clubViewerFromUser,
  resolveClub,
  type Club,
} from '@/lib/clubs';
import {
  clubStubFromSportEvent,
  resolveClubsFromIds,
} from '@/lib/clubsRemote';
import { useAuth } from '@/lib/authContext';
import { useClubs } from '@/lib/clubsContext';
import { useEvents } from '@/lib/eventsContext';
import { resolveDisplayImageUrl as resolveDisplayImageUrlImpl } from '@/lib/imageUrls';
import { isQaMockClubId } from '@/lib/qaMock';
import { fetchPublicProfileByUserId } from '@/lib/userProfileRemote';
import { useUserProfile } from '@/lib/userProfileContext';

const COVER_SCRIM =
  'linear-gradient(to top, rgba(11, 18, 32, 0.78) 0%, rgba(11, 18, 32, 0.28) 38%, rgba(11, 18, 32, 0.04) 62%, transparent 82%)';

function looksLikeFirebaseUid(id: string) {
  return /^[A-Za-z0-9]{20,}$/.test(id);
}

/** 未ロード・例外でも落ちない表示用 URL 解決 */
function resolveDisplayImageUrl(
  uri: string | null | undefined,
): string | undefined {
  try {
    if (typeof resolveDisplayImageUrlImpl === 'function') {
      return resolveDisplayImageUrlImpl(uri);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[clubs] resolveDisplayImageUrl failed', error);
    }
  }
  const raw = String(uri || '').trim();
  return raw || undefined;
}

/** Set / 配列 / Iterable / undefined を安全に string[] へ */
function toJoinedClubIdList(raw: unknown): string[] {
  if (raw == null) return [];
  let values: unknown[] = [];
  if (Array.isArray(raw)) {
    values = raw;
  } else {
    try {
      values = Array.from(raw as Iterable<unknown>);
    } catch {
      return [];
    }
  }
  return values.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0,
  );
}

export default function JoinedClubsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const eventsCtx = useEvents();
  const clubsCtx = useClubs();
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  /** 名前など最低限のフォールバック（個人アバターはクラブ画像に使わない） */
  const [nameOverrides, setNameOverrides] = useState<
    Record<string, { name: string }>
  >({});

  const events = Array.isArray(eventsCtx.events) ? eventsCtx.events : [];
  const organizerProfile = eventsCtx.organizerProfile;
  const currentUserId = eventsCtx.currentUserId ?? null;
  const joinedIds =
    eventsCtx.joinedIds instanceof Set
      ? eventsCtx.joinedIds
      : new Set<string>();
  const joinedClubIdList = useMemo(
    () => toJoinedClubIdList(clubsCtx?.joinedClubIds),
    [clubsCtx?.joinedClubIds],
  );

  useEffect(() => {
    void clubsCtx?.refreshJoinedClubs?.();
  }, [clubsCtx?.refreshJoinedClubs, currentUserId]);

  // 参加済みクラブのみ（QAモックや未参加ホストは混ぜない）
  const clubIdList = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    const push = (raw: string) => {
      const id = String(raw || '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    };
    for (const id of joinedClubIdList) push(id);
    for (const event of events) {
      if (!joinedIds.has(event.id)) continue;
      const clubId = clubIdFromEvent(event);
      if (clubId) push(clubId);
    }
    return ids;
  }, [joinedClubIdList, events, joinedIds]);

  const eventStubs = useMemo(
    () =>
      events
        .filter((event) => joinedIds.has(event.id))
        .map((event) => clubStubFromSportEvent(event))
        .filter((stub): stub is NonNullable<typeof stub> => stub != null),
    [events, joinedIds],
  );

  const joinedClubs = useMemo(() => {
    const resolved: Club[] = [];
    const seen = new Set<string>();
    let fromResolver: Club[] = [];
    try {
      fromResolver = resolveClubsFromIds(
        clubIdList,
        events,
        organizerProfile,
        currentUserId,
        eventStubs,
      );
    } catch (error) {
      console.warn('[clubs] resolveClubsFromIds failed', error);
    }

    for (const club of fromResolver) {
      const id = String(club?.id || '').trim();
      if (!id || seen.has(id)) continue;
      // clubIdList 由来のみ（スタブの余分な id は落とす）
      const inJoined =
        clubIdList.includes(id) ||
        clubIdList.some((joinedId) => {
          try {
            const r = resolveClub?.(
              joinedId,
              events,
              organizerProfile,
              currentUserId,
            );
            return r?.id === id;
          } catch {
            return false;
          }
        });
      if (!inJoined) continue;
      seen.add(id);
      const nameOverride = nameOverrides[id];
      const coverUri =
        resolveDisplayImageUrl(club.coverUri) ||
        resolveDisplayImageUrl(club.imageUri) ||
        club.coverUri ||
        club.imageUri ||
        '';
      const members = Array.isArray(club.members) ? club.members : [];
      resolved.push({
        ...club,
        name:
          club.name !== 'クラブを表示'
            ? club.name
            : nameOverride?.name || club.name,
        imageUri: coverUri || club.imageUri,
        coverUri,
        members,
        tag: club.tag,
      });
    }

    return resolved;
  }, [
    clubIdList,
    events,
    organizerProfile,
    currentUserId,
    nameOverrides,
    eventStubs,
  ]);

  // 未解決クラブは名前だけ profiles から補完（avatar はクラブ画像に使わない）
  useEffect(() => {
    let cancelled = false;
    const missing = clubIdList.filter((id) => {
      try {
        const club = resolveClub?.(id, events, organizerProfile, currentUserId);
        if (club && club.name && club.name !== 'クラブを表示') return false;
        return (
          looksLikeFirebaseUid(id) ||
          isQaMockClubId(id) ||
          !club
        );
      } catch {
        return looksLikeFirebaseUid(id) || isQaMockClubId(id);
      }
    });
    if (missing.length === 0) return;

    void (async () => {
      const next: Record<string, { name: string }> = {};
      await Promise.all(
        missing.map(async (id) => {
          try {
            const result = await fetchPublicProfileByUserId?.(id);
            if (!result?.ok || !result.data?.name?.trim()) return;
            next[id] = { name: result.data.name.trim() };
          } catch (error) {
            console.warn('[clubs] profile name fetch failed', { id, error });
          }
        }),
      );
      if (cancelled || Object.keys(next).length === 0) return;
      setNameOverrides((prev) => {
        let changed = false;
        const merged = { ...prev };
        for (const [id, row] of Object.entries(next)) {
          if (prev[id]?.name === row.name) continue;
          merged[id] = row;
          changed = true;
        }
        return changed ? merged : prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [clubIdList, events, organizerProfile, currentUserId]);

  const openClub = (clubId: string) => {
    const href = clubHref?.(clubId);
    if (!href) return;
    router.push?.(href);
  };

  return (
    <View style={styles.root}>
      <SettingsHeader title={t('club.listTitle')} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 28) },
        ]}
      >
        {joinedClubs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('club.listEmptyTitle')}</Text>
            <Text style={styles.emptyBody}>
              {t('club.listEmptyBody')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {joinedClubs.map((club) => {
              const memberCount = clubMembersForDisplay(
                club,
                clubViewerFromUser?.(user, userProfile) ?? null,
                true,
              ).length;
              // カードの背景・アバターともクラブ cover（イベント画像）のみ
              const coverUri =
                resolveDisplayImageUrl(club.coverUri) ||
                club.coverUri ||
                resolveDisplayImageUrl(club.imageUri) ||
                club.imageUri;
              return (
                <Pressable
                  key={club.id}
                  style={styles.card}
                  onPress={() => openClub(club.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('club.profileLabel', { name: club.name })}
                >
                  {coverUri && Platform.OS !== 'web' ? (
                    <View style={styles.coverWrap} pointerEvents="none">
                      <Image
                        source={{ uri: coverUri }}
                        style={styles.cover}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.coverWrap,
                        coverUri
                          ? {
                              backgroundImage: `url("${coverUri}")`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              backgroundRepeat: 'no-repeat',
                            }
                          : styles.coverFallback,
                      ]}
                    />
                  )}
                  <View pointerEvents="none" style={styles.scrim} />
                  <View pointerEvents="none" style={styles.scrimBottom} />
                  <View style={styles.caption} pointerEvents="none">
                    <View style={styles.captionTop}>
                      <HostAvatar
                        name={club.name || t('club.fallbackName')}
                        imageUri={coverUri}
                        size={40}
                        borderWidth={2}
                      />
                      {club.tag ? (
                        <View style={styles.sportChip}>
                          <Text style={styles.sportChipText}>{club.tag}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.clubName} numberOfLines={2}>
                      {club.name}
                    </Text>
                    <Text style={styles.clubMeta} numberOfLines={1}>
                      {t('club.memberCount', { count: memberCount })}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  list: {
    gap: 16,
  },
  card: {
    height: 210,
    borderRadius: theme.radius.xxl,
    overflow: 'hidden',
    backgroundColor: '#111',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 6,
  },
  coverWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111',
  },
  cover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1F2937',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    ...Platform.select({
      web: { backgroundImage: COVER_SCRIM },
      default: { experimental_backgroundImage: COVER_SCRIM },
    }),
  },
  scrimBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '58%',
    ...Platform.select({
      web: { display: 'none' as const },
      default: { backgroundColor: 'rgba(11, 18, 32, 0.42)' },
    }),
  },
  caption: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
  },
  captionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sportChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  sportChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  clubName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    lineHeight: 26,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  clubMeta: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.86)',
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },
});
