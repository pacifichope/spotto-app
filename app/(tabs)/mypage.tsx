import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CreateEventButton from '@/components/CreateEventButton';
import CreateEventModal from '@/components/CreateEventModal';
import type { CreateEventPayload } from '@/components/createEventSheetTypes';
import EventList from '@/components/EventList';
import HostAvatar from '@/components/HostAvatar';
import PersonalProfileModal from '@/components/PersonalProfileModal';
import SaveToast, { useTimedToast } from '@/components/SaveToast';
import {
  CalendarEmptyIcon,
  EditEmptyIcon,
  EmptyStateIcon,
  HeartEmptyIcon,
  PackageEmptyIcon,
  SparklesEmptyIcon,
  SportIcon,
  UsersEmptyIcon,
} from '@/components/icons';
import { theme } from '@/constants/theme';
import { resolveClub, type Club } from '@/lib/clubs';
import { ticketHref } from '@/lib/ticketNavigation';
import {
  clubStubFromSportEvent,
  resolveClubsFromIds,
} from '@/lib/clubsRemote';
import { useClubs } from '@/lib/clubsContext';
import { localizedEventTitle } from '@/lib/eventLocalizedText';
import {
  useCreateEventAccess,
  useOrganizerEditor,
} from '@/lib/createEventAccessContext';
import {
  hasOrganizerProfileReady,
  organizerDisplayName,
} from '@/lib/organizerProfile';
import {
  formatDraftMeta,
  formatDraftSportLabel,
  formatDraftTitle,
  type EventDraft,
} from '@/lib/eventDrafts';
import { useEvents } from '@/lib/eventsContext';
import { useAuth } from '@/lib/authContext';
import { useBlocks } from '@/lib/blocksContext';
import {
  loadMyPageMode,
  saveMyPageMode,
  type MyPageMode,
} from '@/lib/mypageMode';
import { useUserProfile } from '@/lib/userProfileContext';
import { setActiveProfileUserId } from '@/lib/userProfile';
import { pushProfileToRemote } from '@/lib/userProfileRemote';

type Segment = 'joined' | 'past' | 'favorites' | 'hosted' | 'drafts';

export default function MyPageScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    events,
    joinedIds,
    upcomingJoinedEvents,
    upcomingHostedEvents,
    pastJoinedEvents,
    pastHostedEvents,
    favoriteEvents,
    drafts,
    createEvent,
    saveEventDraft,
    deleteEventDraft,
    organizerProfile,
    currentUserId,
  } = useEvents();
  const { joinedClubIds, refreshJoinedClubs } = useClubs();
  const { userProfile, displayName, updateUserProfile } = useUserProfile();
  const { isLoggedIn, openLogin, user, isReady: authReady, accountDataReady } =
    useAuth();
  const requestCreateAccess = useCreateEventAccess();
  const openOrganizerEditor = useOrganizerEditor();
  const { filterEvents } = useBlocks();
  const [mode, setMode] = useState<MyPageMode>('participant');
  const [segment, setSegment] = useState<Segment>('joined');
  const [creating, setCreating] = useState(false);
  const [editingDraft, setEditingDraft] = useState<EventDraft | null>(null);
  const [toast, setToast] = useTimedToast();
  const [personalEditorVisible, setPersonalEditorVisible] = useState(false);

  // 未ログインでマイページを開いたらログインを促す（ゲストはホーム閲覧のみ）
  useFocusEffect(
    useCallback(() => {
      if (!authReady || isLoggedIn) return;
      openLogin('mypage');
    }, [authReady, isLoggedIn, openLogin]),
  );

  useEffect(() => {
    let cancelled = false;
    loadMyPageMode().then((loaded) => {
      if (cancelled) return;
      setMode(loaded);
      setSegment(loaded === 'organizer' ? 'hosted' : 'joined');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const switchMode = (next: MyPageMode) => {
    setMode(next);
    setSegment(next === 'organizer' ? 'hosted' : 'joined');
    void saveMyPageMode(next);
  };

  const enterOrganizer = (nextSegment: Segment) => {
    setMode('organizer');
    setSegment(nextSegment);
    void saveMyPageMode('organizer');
  };

  const isOrganizer = mode === 'organizer';

  /** 認証確定後かつ、今のユーザーのプロフィールが載ってからリストを出す */
  const showAccountIdentity = isLoggedIn && accountDataReady;
  const canShowAccountLists =
    authReady && showAccountIdentity && Boolean(user?.id);
  const showParticipantLists = canShowAccountLists;
  const visibleUpcomingJoined = showParticipantLists
    ? upcomingJoinedEvents
    : [];
  const visiblePastJoined = showParticipantLists ? pastJoinedEvents : [];
  const visibleFavorites = showParticipantLists ? favoriteEvents : [];
  const visibleUpcomingHosted = canShowAccountLists
    ? upcomingHostedEvents
    : [];
  const visiblePastHosted = canShowAccountLists ? pastHostedEvents : [];
  const visibleDrafts = canShowAccountLists ? drafts : [];

  const list = filterEvents(
    segment === 'joined'
      ? visibleUpcomingJoined
      : segment === 'past'
        ? isOrganizer
          ? visiblePastHosted
          : visiblePastJoined
        : segment === 'favorites'
          ? visibleFavorites
          : segment === 'hosted'
            ? visibleUpcomingHosted
            : [],
  );
  const joinedClubs = useMemo(() => {
    const ids = [...(joinedClubIds ?? new Set<string>())];
    const stubs = (Array.isArray(events) ? events : [])
      .filter((event) => joinedIds?.has?.(event.id))
      .map((event) => clubStubFromSportEvent(event))
      .filter((stub): stub is NonNullable<typeof stub> => stub != null);
    try {
      return resolveClubsFromIds(
        ids,
        Array.isArray(events) ? events : [],
        organizerProfile,
        currentUserId,
        stubs,
      ).filter((club): club is Club => {
        if (!club?.id) return false;
        // joinedClubIds に無いスタブだけの余分な行は出さない
        return ids.includes(club.id) || ids.some((id) => {
          try {
            return resolveClub(id, events, organizerProfile, currentUserId)?.id === club.id;
          } catch {
            return false;
          }
        });
      });
    } catch {
      return ids
        .map((id) => {
          try {
            return resolveClub(id, events, organizerProfile, currentUserId);
          } catch {
            return null;
          }
        })
        .filter((club): club is Club => club != null);
    }
  }, [joinedClubIds, joinedIds, events, organizerProfile, currentUserId]);

  useEffect(() => {
    if (!isLoggedIn) return;
    void refreshJoinedClubs();
  }, [isLoggedIn, refreshJoinedClubs]);

  const switchSegment = (next: Segment) => {
    setSegment(next);
  };

  const openCreate = () => {
    requestCreateAccess(() => {
      setEditingDraft(null);
      setCreating(true);
    });
  };

  const openDraft = (next: EventDraft) => {
    requestCreateAccess(() => {
      setEditingDraft(next);
      setCreating(true);
    });
  };

  const confirmDeleteDraft = (next: EventDraft) => {
    Alert.alert(
      t('mypage.deleteDraftTitle'),
      formatDraftTitle(next),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteEventDraft(next.id),
        },
      ],
    );
  };

  const closeCreate = () => {
    setCreating(false);
    setEditingDraft(null);
  };

  const handleCreate = async (payload: CreateEventPayload) => {
    const result = await createEvent(payload);
    if (!result.ok) {
      Alert.alert(t('common.saveFailed'), result.error);
      return;
    }
    if (editingDraft) deleteEventDraft(editingDraft.id);
    closeCreate();
    enterOrganizer('hosted');
    router.push(`/event/${result.event.id}`);
    const count = result.events.length;
    Alert.alert(
      t('common.eventPublishedTitle'),
      count > 1
        ? t('common.eventPublishedMultiple', {
            title: localizedEventTitle(result.event),
            count,
          })
        : localizedEventTitle(result.event),
    );
  };

  const organizerNameReady = hasOrganizerProfileReady(organizerProfile);
  const organizerName = organizerNameReady
    ? organizerDisplayName(organizerProfile)
    : '';
  const accountTitle = showAccountIdentity
    ? displayName
    : isLoggedIn
      ? t('common.loading')
      : t('mypage.loginSignup');
  const hostedActiveCount = visibleUpcomingHosted.length;
  const hostedPastCount = visiblePastHosted.length;
  /** 主催イベントが1件以上あるとき、右下 FAB で追加作成できるようにする */
  const showCreateFab =
    isOrganizer &&
    canShowAccountLists &&
    hostedActiveCount + hostedPastCount > 0;
  const bottomPad =
    Math.max(insets.bottom, 16) + 24 + (showCreateFab ? 72 : 0);
  const segmentItems: { id: Segment; label: string; count: number }[] =
    isOrganizer
      ? [
          { id: 'hosted', label: t('mypage.segmentHosted'), count: hostedActiveCount },
          { id: 'past', label: t('mypage.segmentHistory'), count: hostedPastCount },
          { id: 'drafts', label: t('mypage.segmentDrafts'), count: visibleDrafts.length },
        ]
      : [
          {
            id: 'joined',
            label: t('mypage.segmentJoined'),
            count: visibleUpcomingJoined.length,
          },
          { id: 'past', label: t('mypage.segmentHistory'), count: visiblePastJoined.length },
          {
            id: 'favorites',
            label: t('mypage.segmentFavorites'),
            count: visibleFavorites.length,
          },
        ];

  const pageHeader = (
    <View style={styles.listHeaderWrap}>
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>{t('mypage.title')}</Text>
        <Pressable
          onPress={() => router.push('/settings')}
          hitSlop={8}
          style={styles.settingsBtn}
          accessibilityRole="button"
          accessibilityLabel={t('mypage.settings')}
        >
          <SymbolView
            name={{
              ios: 'gearshape',
              android: 'settings',
              web: 'settings',
            }}
            tintColor={theme.colors.text}
            size={24}
            fallback={<Text style={styles.settingsFallback}>⚙</Text>}
          />
        </Pressable>
      </View>

      <View style={styles.modeSwitch} accessibilityRole="tablist">
        <Pressable
          style={[
            styles.modeChip,
            !isOrganizer && styles.modeChipActive,
          ]}
          onPress={() => switchMode('participant')}
          accessibilityRole="tab"
          accessibilityState={{ selected: !isOrganizer }}
          accessibilityLabel={t('mypage.participantMode')}
        >
          <Text
            style={[
              styles.modeChipText,
              !isOrganizer && styles.modeChipTextActive,
            ]}
          >
            {t('mypage.participantMode')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, isOrganizer && styles.modeChipActive]}
          onPress={() => switchMode('organizer')}
          accessibilityRole="tab"
          accessibilityState={{ selected: isOrganizer }}
          accessibilityLabel={t('mypage.organizerMode')}
        >
          <Text
            style={[
              styles.modeChipText,
              isOrganizer && styles.modeChipTextActive,
            ]}
          >
            {t('mypage.organizerMode')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.heroStack}>
        {isOrganizer ? (
          <Pressable
            style={({ pressed }) => [
              styles.heroCard,
              pressed && styles.heroCardPressed,
            ]}
            onPress={openOrganizerEditor}
            accessibilityRole="button"
            accessibilityLabel={t('mypage.editOrganizerProfileA11y')}
          >
            {showAccountIdentity &&
            (organizerName || organizerProfile.imageUri) ? (
              <HostAvatar
                name={organizerName || t('mypage.organizerDefaultName')}
                imageUri={organizerProfile.imageUri}
                size={44}
              />
            ) : (
              <View style={styles.organizerGlyph}>
                <SymbolView
                  name={{
                    ios: 'person.2.fill',
                    android: 'group',
                    web: 'group',
                  }}
                  tintColor={theme.colors.textSecondary}
                  size={20}
                  fallback={
                    <UsersEmptyIcon
                      size={20}
                      color={theme.colors.textSecondary}
                    />
                  }
                />
              </View>
            )}
            <View style={styles.heroBody}>
              <Text style={styles.heroNameSm} numberOfLines={1}>
                {organizerName || t('mypage.organizerProfile')}
              </Text>
              <Text style={styles.heroMeta} numberOfLines={1}>
                {organizerName
                  ? t('mypage.editCircleInfo')
                  : t('mypage.setCircleName')}
              </Text>
            </View>
            <View style={styles.chevronWrap}>
              <Text style={styles.chevronMark}>›</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.heroCard,
              pressed && styles.heroCardPressed,
            ]}
            onPress={() => {
              if (!isLoggedIn) {
                openLogin('mypage');
                return;
              }
              setPersonalEditorVisible(true);
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={
              isLoggedIn
                ? t('mypage.editPersonalProfile')
                : t('mypage.loginSignup')
            }
          >
            {showAccountIdentity ? (
              <View style={styles.avatarRing}>
                <HostAvatar
                  name={displayName}
                  imageUri={userProfile.imageUri}
                  gender={userProfile.gender}
                  size={64}
                />
              </View>
            ) : (
              <View style={styles.guestAvatar}>
                <SymbolView
                  name={{
                    ios: 'person.fill',
                    android: 'person',
                    web: 'person',
                  }}
                  tintColor={theme.colors.primaryDark}
                  size={32}
                  fallback={
                    <Text style={styles.guestAvatarFallback}>👤</Text>
                  }
                />
              </View>
            )}
            <View style={styles.heroBody}>
              <Text style={styles.heroName} numberOfLines={1}>
                {accountTitle}
              </Text>
              {showAccountIdentity ? (
                <Text style={styles.heroMeta}>
                  {t('mypage.editPersonalProfile')}
                </Text>
              ) : null}
            </View>
            <View style={styles.chevronWrap}>
              <Text style={styles.chevronMark}>›</Text>
            </View>
          </Pressable>
        )}
      </View>

      {isOrganizer ? (
        <View style={styles.organizerLinks}>
          <Pressable
            style={styles.organizerLinkRow}
            onPress={() => {
              if (!isLoggedIn) {
                openLogin('mypage');
                return;
              }
              router.push('/settings/sales');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('mypage.sales')}
          >
            <Text style={styles.organizerLinkLabel}>{t('mypage.sales')}</Text>
            <Text style={styles.chevronMark}>›</Text>
          </Pressable>
          <Pressable
            style={[styles.organizerLinkRow, styles.organizerLinkBorder]}
            onPress={() => {
              if (!isLoggedIn) {
                openLogin('mypage');
                return;
              }
              router.push('/settings/bank-account');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('mypage.bankAccount')}
          >
            <Text style={styles.organizerLinkLabel}>
              {t('mypage.bankAccount')}
            </Text>
            <Text style={styles.chevronMark}>›</Text>
          </Pressable>
          <Pressable
            style={[styles.organizerLinkRow, styles.organizerLinkBorder]}
            onPress={() => router.push('/settings/organizer-guidelines')}
            accessibilityRole="button"
            accessibilityLabel={t('mypage.organizerGuidelines')}
          >
            <Text style={styles.organizerLinkLabel}>
              {t('mypage.organizerGuidelines')}
            </Text>
            <Text style={styles.chevronMark}>›</Text>
          </Pressable>
        </View>
      ) : null}

      {isOrganizer ? null : (
        <Pressable
          style={styles.clubsBanner}
          onPress={() => router.push('/clubs')}
          accessibilityRole="button"
          accessibilityLabel={t('mypage.joinedClubsA11y', {
            count: joinedClubs.length,
          })}
        >
          <Text style={styles.clubsBannerLabel}>
            {t('mypage.joinedClubs')}
          </Text>
          <Text style={styles.clubsBannerDot}>·</Text>
          <Text style={styles.clubsBannerCount}>{joinedClubs.length}</Text>
          <View style={styles.chevronWrap}>
            <Text style={styles.chevronMark}>›</Text>
          </View>
        </Pressable>
      )}

      <View style={styles.segmentRow}>
        {segmentItems.map((item) => {
          const active = segment === item.id;
          return (
            <Pressable
              key={item.id}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => switchSegment(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
            >
              <Text
                style={[
                  styles.segmentText,
                  active && styles.segmentTextActive,
                ]}
              >
                {item.label}
              </Text>
              <View
                style={[styles.countBadge, active && styles.countBadgeActive]}
              >
                <Text
                  style={[
                    styles.countBadgeText,
                    active && styles.countBadgeTextActive,
                  ]}
                >
                  {item.count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const needsLoginEmpty =
    !canShowAccountLists &&
    (segment === 'joined' ||
      segment === 'past' ||
      segment === 'favorites' ||
      segment === 'hosted' ||
      segment === 'drafts');

  const loginEmptyCopy = {
    joined: {
      title: t('mypage.loginEmpty.joined.title'),
      body: t('mypage.loginEmpty.joined.body'),
    },
    past: {
      title: t('mypage.loginEmpty.past.title'),
      body: t('mypage.loginEmpty.past.body'),
    },
    favorites: {
      title: t('mypage.loginEmpty.favorites.title'),
      body: t('mypage.loginEmpty.favorites.body'),
    },
    hosted: {
      title: t('mypage.loginEmpty.hosted.title'),
      body: t('mypage.loginEmpty.hosted.body'),
    },
    drafts: {
      title: t('mypage.loginEmpty.drafts.title'),
      body: t('mypage.loginEmpty.drafts.body'),
    },
  }[segment];

  const emptyCopy = needsLoginEmpty
    ? {
        Icon: CalendarEmptyIcon,
        title: loginEmptyCopy.title,
        body: loginEmptyCopy.body,
      }
    : {
        joined: {
          Icon: CalendarEmptyIcon,
          title: t('mypage.empty.joined.title'),
          body: t('mypage.empty.joined.body'),
        },
        past: {
          Icon: PackageEmptyIcon,
          title: isOrganizer
            ? t('mypage.empty.pastOrganizer.title')
            : t('mypage.empty.pastParticipant.title'),
          body: isOrganizer
            ? t('mypage.empty.pastOrganizer.body')
            : t('mypage.empty.pastParticipant.body'),
        },
        favorites: {
          Icon: HeartEmptyIcon,
          title: t('mypage.empty.favorites.title'),
          body: t('mypage.empty.favorites.body'),
        },
        hosted: {
          Icon: SparklesEmptyIcon,
          title: t('mypage.empty.hosted.title'),
          body: t('mypage.empty.hosted.body'),
        },
        drafts: {
          Icon: EditEmptyIcon,
          title: t('mypage.empty.drafts.title'),
          body: t('mypage.empty.drafts.body'),
        },
      }[segment];

  const EmptyIcon = emptyCopy.Icon;

  const emptyState = (
    <View style={styles.emptyCard}>
      <EmptyStateIcon style={{ marginBottom: 12 }}>
        <EmptyIcon size={28} />
      </EmptyStateIcon>
      <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
      <Text style={styles.emptyBody}>{emptyCopy.body}</Text>
      {needsLoginEmpty ? (
        <Pressable
          style={styles.emptyCreateBtn}
          onPress={() => openLogin('mypage')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.login')}
        >
          <Text style={styles.emptyCreateText}>{t('common.login')}</Text>
        </Pressable>
      ) : segment === 'hosted' || segment === 'drafts' ? (
        <Pressable
          style={styles.emptyCreateBtn}
          onPress={openCreate}
          accessibilityRole="button"
          accessibilityLabel={t('mypage.createEventA11y')}
        >
          <Text style={styles.emptyCreatePlus}>＋</Text>
          <Text style={styles.emptyCreateText}>
            {t('mypage.createEvent')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  const customList = segment === 'drafts';
  /** FlatList の空表示に頼らず、未ログイン時はリスト自体をマウントしない */
  const forceLoginEmpty = !canShowAccountLists;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      {customList || forceLoginEmpty ? (
        <ScrollView
          style={styles.draftList}
          contentContainerStyle={[
            styles.draftListContent,
            { paddingBottom: bottomPad },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {pageHeader}
          {forceLoginEmpty
            ? emptyState
            : visibleDrafts.length === 0
              ? emptyState
              : visibleDrafts.map((item) => (
                <View key={item.id} style={styles.draftCard}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.draftMain,
                      pressed && styles.draftCardPressed,
                    ]}
                    onPress={() => openDraft(item)}
                    accessibilityRole="button"
                    accessibilityLabel={t('mypage.editDraftA11y', {
                      title: formatDraftTitle(item),
                    })}
                  >
                    {item.imageUris[0] ? (
                      <Image
                        source={{ uri: item.imageUris[0] }}
                        style={styles.draftThumb}
                      />
                    ) : (
                      <View style={styles.draftThumbFallback}>
                        <SportIcon
                          sport={formatDraftSportLabel(item)}
                          size={22}
                          color={theme.colors.iconActive}
                        />
                      </View>
                    )}
                    <View style={styles.draftBody}>
                      <Text style={styles.draftTitle} numberOfLines={1}>
                        {formatDraftTitle(item)}
                      </Text>
                      <Text style={styles.draftMeta} numberOfLines={1}>
                        {formatDraftMeta(item)}
                      </Text>
                      <Text style={styles.draftHint}>
                        {t('mypage.continueEditing')}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDeleteDraft(item)}
                    hitSlop={8}
                    style={styles.draftDeleteBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('mypage.deleteDraftA11y', {
                      title: formatDraftTitle(item),
                    })}
                  >
                    <Text style={styles.draftDeleteText}>
                      {t('common.delete')}
                    </Text>
                  </Pressable>
                </View>
              ))}
        </ScrollView>
      ) : (
        <EventList
          key={`${mode}-${segment}-${user?.id ?? 'guest'}`}
          events={list}
          selectedId={null}
          joinedIds={joinedIds}
          requirePhotos={false}
          ListHeaderComponent={pageHeader}
          ListEmptyComponent={emptyState}
          contentPaddingBottom={bottomPad}
          onOpenEvent={(event) => {
            // 参加／履歴はチケット画面へ。主催・お気に入りは従来どおり詳細へ
            if (
              !isOrganizer &&
              (segment === 'joined' || segment === 'past')
            ) {
              router.push(ticketHref(event.id));
              return;
            }
            router.push(`/event/${event.id}`);
          }}
        />
      )}

      {showCreateFab ? (
        <View
          style={[
            styles.fabOverlay,
            { paddingBottom: Math.max(insets.bottom, 16) + 12 },
          ]}
          pointerEvents="box-none"
        >
          <CreateEventButton onPress={openCreate} />
        </View>
      ) : null}

      <CreateEventModal
        visible={creating}
        draft={editingDraft}
        onClose={closeCreate}
        onSubmit={handleCreate}
        onSaveDraft={(snapshot) => {
          saveEventDraft(snapshot, editingDraft?.id);
          enterOrganizer('drafts');
          setToast(t('common.draftSaved'));
        }}
      />

      <PersonalProfileModal
        visible={personalEditorVisible}
        profile={userProfile}
        onClose={() => setPersonalEditorVisible(false)}
        onSave={(next) => {
          if (user?.id) {
            setActiveProfileUserId(user.id);
          }
          updateUserProfile(next);
          setPersonalEditorVisible(false);
          if (user?.id) {
            void (async () => {
              const result = await pushProfileToRemote(user.id, next);
              if (!result.ok) {
                Alert.alert(
                  t('common.saveFailedShort'),
                  result.error || t('common.profileSaveFailedBody'),
                );
              }
            })();
          }
        }}
      />

      <SaveToast
        message={toast}
        bottomOffset={Math.max(insets.bottom, 12) + (showCreateFab ? 88 : 24)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
  },
  fabOverlay: {
    position: 'absolute',
    right: 18,
    bottom: 0,
    zIndex: 30,
  },
  listHeaderWrap: {
    marginHorizontal: -16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: 40,
  },
  pageTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsFallback: {
    fontSize: 20,
    color: theme.colors.text,
  },
  modeSwitch: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 4,
  },
  modeChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  modeChipActive: {
    backgroundColor: theme.colors.primary,
  },
  modeChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  modeChipTextActive: {
    color: theme.colors.onPrimary,
  },
  heroStack: {
    marginHorizontal: 16,
    marginBottom: 14,
    gap: 10,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
  heroCardPressed: {
    opacity: 0.96,
  },
  avatarRing: {
    borderRadius: 34,
  },
  guestAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestAvatarFallback: {
    fontSize: 28,
  },
  heroBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 3,
  },
  heroName: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.4,
  },
  heroNameSm: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.2,
  },
  heroMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronMark: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginTop: -1,
  },
  organizerGlyph: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizerLinks: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  organizerLinkRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  organizerLinkBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  organizerLinkLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
  clubsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
  clubsBannerLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
  clubsBannerDot: {
    marginHorizontal: 8,
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.textMuted,
  },
  clubsBannerCount: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 8,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  segmentActive: {
    backgroundColor: theme.colors.primary,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    flexShrink: 1,
  },
  segmentTextActive: {
    color: theme.colors.onPrimary,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  countBadgeTextActive: {
    color: theme.colors.onPrimary,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xxl,
    paddingHorizontal: 24,
    paddingVertical: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  emptyCreateBtn: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  emptyCreatePlus: {
    color: theme.colors.onPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: -1,
  },
  emptyCreateText: {
    color: theme.colors.onPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  draftList: {
    flex: 1,
  },
  draftListContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  draftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
  draftMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  draftCardPressed: {
    opacity: 0.94,
  },
  draftThumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceAlt,
  },
  draftThumbFallback: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: theme.colors.iconActiveBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  draftTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  draftMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  draftHint: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  draftDeleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  draftDeleteText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
});
