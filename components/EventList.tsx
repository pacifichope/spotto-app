import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import BrandGradient from '@/components/BrandGradient';
import HostAvatar from '@/components/HostAvatar';
import { EmptyStateIcon, MapPinIcon, SearchIcon } from '@/components/icons';
import { theme } from '@/constants/theme';
import {
  attendeesForDisplay,
  type EventAttendee,
} from '@/lib/attendees';
import { useBlocks } from '@/lib/blocksContext';
import { isRemoteEventId } from '@/lib/chatsRemote';
import {
  eventPreviewUris,
  eventSpotsLeft,
  eventLifecycleLabel,
  formatEventWhenCompact,
  formatLocationLabel,
  getEventLifecycleStatus,
  hasEventPhotos,
  sportFallbackUri,
  type SportEvent,
} from '@/lib/events';
import { eventPriceYen, formatYenAmount, isPaidEvent } from '@/lib/payments';
import { useEvents } from '@/lib/eventsContext';

const PHOTO_MAX = 3;
const PHOTO_GAP = 6;
const PHOTO_HEIGHT = 108;
/** リストカードに並べるアバター最大数（超過は +N） */
const MAX_FACE_SLOTS = 4;

type EventListProps = {
  events: SportEvent[];
  selectedId: string | null;
  joinedIds: Set<string>;
  onSelect?: (event: SportEvent) => void;
  /** 指定時はデフォルトの /event/[id] 遷移の代わりに使う */
  onOpenEvent?: (event: SportEvent) => void;
  ListHeaderComponent?: ReactElement | null;
  ListEmptyComponent?: ReactElement | null;
  ListFooterComponent?: ReactElement | null;
  contentPaddingBottom?: number;
  /** false にすると写真なしイベントも表示（マイページのお気に入り等） */
  requirePhotos?: boolean;
};

function resolveCardAttendees(
  event: SportEvent,
  joined: boolean,
  remoteAttendees: EventAttendee[],
  hasLoaded: boolean,
): EventAttendee[] {
  // クラウドイベントは実参加者のみ（シードの Mika/Ken 等は使わない）
  if (isRemoteEventId(event.id)) {
    if (hasLoaded) return remoteAttendees;
    if (Array.isArray(event.attendees)) return event.attendees;
    return [];
  }
  return attendeesForDisplay(
    { ...event, host: String(event.host || '').trim() || '主催者' },
    null,
    joined,
  );
}

function TimelineCard({
  event,
  selected,
  joined,
  now,
  attendees,
  onPress,
}: {
  event: SportEvent;
  selected: boolean;
  joined: boolean;
  now: Date;
  attendees: EventAttendee[];
  onPress: () => void;
}) {
  const { filterAttendees } = useBlocks();
  if (!event?.id) return null;

  const hostName = String(event.host || '').trim() || '主催者';
  const title = String(event.title || '').trim() || '無題のイベント';
  const sport = String(event.sport || '').trim() || 'その他';
  const level = String(event.level || '').trim() || '誰でも歓迎';
  const joinedCount = Math.max(
    0,
    Math.floor(
      Number(
        Array.isArray(event.attendees) && event.attendees.length > 0
          ? Math.max(event.joinedCount || 0, event.attendees.length)
          : event.joinedCount,
      ) || 0,
    ),
  );

  let lifecycle: ReturnType<typeof getEventLifecycleStatus> = 'upcoming';
  try {
    lifecycle = getEventLifecycleStatus(event, now);
  } catch {
    lifecycle = 'upcoming';
  }
  const ended = lifecycle === 'ended';
  const cancelled = lifecycle === 'cancelled';

  let faces: EventAttendee[] = [];
  try {
    faces = filterAttendees(attendees);
  } catch {
    faces = [];
  }
  const overflow =
    faces.length > MAX_FACE_SLOTS
      ? faces.length - (MAX_FACE_SLOTS - 1)
      : 0;
  const visibleFaces =
    overflow > 0 ? faces.slice(0, MAX_FACE_SLOTS - 1) : faces;

  const spots = eventSpotsLeft({
    capacity: Math.max(1, Math.floor(Number(event.capacity) || 1)),
    joinedCount,
  });
  const statusLabel = cancelled || ended
    ? eventLifecycleLabel(lifecycle)
    : joined
      ? '参加中'
      : spots > 0
        ? '募集中'
        : '受付終了';
  const statusLive = statusLabel === '募集中' || statusLabel === '参加中';
  const ctaLabel = cancelled
    ? '中止'
    : ended
      ? '開催終了'
      : joined
        ? '参加済み'
        : isPaidEvent(event)
          ? formatYenAmount(eventPriceYen(event))
          : 'Join';

  let whenLabel = '';
  let whereLabel = '';
  try {
    whenLabel = formatEventWhenCompact(event, now);
    whereLabel =
      formatLocationLabel(event.location, event.locationNote) || '場所未設定';
  } catch {
    whenLabel = '日程未定';
    whereLabel = '場所未設定';
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}の詳細`}
      accessibilityHint="イベント詳細を開きます"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        (ended || cancelled) && styles.cardEnded,
        pressed && styles.cardPressed,
      ]}
    >
      <View pointerEvents="none" collapsable={false} style={styles.body}>
        <Text
          style={[styles.title, (ended || cancelled) && styles.titleEnded]}
          numberOfLines={2}
        >
          {title}
        </Text>

        <View style={styles.hostLine}>
          <HostAvatar
            name={hostName}
            imageUri={event.hostImageUri}
            size={20}
          />
          <Text
            style={[
              styles.hostName,
              (ended || cancelled) && styles.hostNameEnded,
            ]}
            numberOfLines={1}
          >
            {hostName}
          </Text>
          <Text
            style={[styles.hash, (ended || cancelled) && styles.hashEnded]}
          >
            #{sport}
          </Text>
          <Text style={styles.hashMuted}>#{level}</Text>
        </View>

        <View style={styles.metaRow}>
          {statusLive ? (
            <BrandGradient style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{statusLabel}</Text>
            </BrandGradient>
          ) : ended ? (
            <View style={[styles.statusBadge, styles.statusBadgeEnded]}>
              <Text style={styles.statusBadgeEndedText}>{statusLabel}</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, styles.statusBadgeMuted]}>
              <Text
                style={[styles.statusBadgeText, styles.statusBadgeTextMuted]}
              >
                {statusLabel}
              </Text>
            </View>
          )}
          <Text
            style={[
              styles.metaText,
              (ended || cancelled) && styles.metaTextEnded,
            ]}
            numberOfLines={1}
          >
            {whenLabel}
            {whereLabel ? ` · ${whereLabel}` : ''}
          </Text>
        </View>

        <View style={(ended || cancelled) ? styles.galleryDimmed : undefined}>
          <EventPhotoRow event={event} />
        </View>

        <View style={styles.footerRow}>
          <View style={styles.socialLeft}>
            {visibleFaces.length > 0 ? (
              <View style={styles.faces}>
                {visibleFaces.map((person, index) => (
                  <View
                    key={person.id || `face-${index}`}
                    style={[
                      styles.face,
                      { marginLeft: index === 0 ? 0 : -8, zIndex: index + 1 },
                    ]}
                  >
                    <HostAvatar
                      name={person.name || '参加者'}
                      imageUri={person.imageUri}
                      gender={person.gender}
                      size={24}
                    />
                  </View>
                ))}
                {overflow > 0 ? (
                  <View
                    style={[
                      styles.face,
                      styles.faceOverflow,
                      {
                        marginLeft: -8,
                        zIndex: visibleFaces.length + 1,
                      },
                    ]}
                  >
                    <Text style={styles.faceOverflowText}>+{overflow}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <MapPinIcon size={14} color={theme.colors.textMuted} />
            )}
            <Text
              style={[
                styles.socialText,
                (ended || cancelled) && styles.socialTextEnded,
              ]}
              numberOfLines={1}
            >
              {joinedCount > 0
                ? `${joinedCount}人が参加中`
                : 'まだ参加者はいません'}
            </Text>
          </View>

          {joined || ended || cancelled ? (
            <View
              style={[
                styles.joinBtn,
                joined && !ended && !cancelled && styles.joinBtnJoined,
                (ended || cancelled) && styles.joinBtnEnded,
              ]}
            >
              <Text
                style={[
                  styles.joinText,
                  joined && !ended && !cancelled && styles.joinTextJoined,
                  (ended || cancelled) && styles.joinTextEnded,
                ]}
              >
                {ctaLabel}
              </Text>
            </View>
          ) : (
            <BrandGradient style={styles.joinBtn}>
              <Text style={styles.joinText}>{ctaLabel}</Text>
            </BrandGradient>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function EventPhotoRow({ event }: { event: SportEvent }) {
  const registered = eventPreviewUris(event, PHOTO_MAX);
  const fallback = sportFallbackUri(event.sport);
  const [failed, setFailed] = useState<Record<string, true>>({});
  const loaded = registered.filter((uri) => !failed[uri]);
  const photos = loaded.length > 0 ? loaded : fallback ? [fallback] : [];
  if (photos.length === 0) return null;

  const hideIfBroken = (uri: string) => {
    setFailed((prev) => {
      if (prev[uri]) return prev;
      const next = { ...prev, [uri]: true as const };
      const remaining = registered.filter((item) => !next[item]);
      if (remaining.length === 0 && uri === fallback) return prev;
      return next;
    });
  };

  return (
    <View style={styles.gallery}>
      {photos.map((uri, index) => (
        <View key={`${event.id}-${uri}-${index}`} style={styles.galleryTile}>
          {Platform.OS === 'web' ? (
            <img
              src={uri}
              alt=""
              onError={() => hideIfBroken(uri)}
              style={webGalleryImg}
            />
          ) : (
            <Image
              source={{ uri }}
              style={styles.galleryImage}
              resizeMode="cover"
              onError={() => hideIfBroken(uri)}
            />
          )}
        </View>
      ))}
    </View>
  );
}

export default function EventList({
  events,
  selectedId,
  joinedIds,
  onSelect,
  onOpenEvent,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  contentPaddingBottom = 120,
  requirePhotos = true,
}: EventListProps) {
  const router = useRouter();
  const {
    now,
    preloadEventParticipants,
    participantsForEvent,
    hasParticipantsLoaded,
  } = useEvents();
  const safeJoinedIds =
    joinedIds instanceof Set ? joinedIds : new Set<string>();
  const safeNow = now instanceof Date && Number.isFinite(now.getTime())
    ? now
    : new Date();
  const source = Array.isArray(events) ? events.filter((item) => item?.id) : [];
  const visibleEvents = requirePhotos
    ? source.filter((item) => {
        try {
          return hasEventPhotos(item);
        } catch {
          return false;
        }
      })
    : source;

  const visibleIdsKey = useMemo(
    () =>
      visibleEvents
        .map((item) => item.id)
        .filter((id) => isRemoteEventId(id))
        .sort()
        .join(','),
    [visibleEvents],
  );

  useEffect(() => {
    if (!visibleIdsKey) return;
    const ids = visibleIdsKey.split(',').filter(Boolean);
    void preloadEventParticipants(ids);
  }, [visibleIdsKey, preloadEventParticipants]);

  // participants 更新でカードを再描画
  const participantsEpoch = useMemo(() => {
    return visibleEvents.reduce((sum, item) => {
      const list = participantsForEvent(item.id);
      return sum + list.length + (hasParticipantsLoaded(item.id) ? 1 : 0);
    }, 0);
  }, [visibleEvents, participantsForEvent, hasParticipantsLoaded]);

  return (
    <FlatList
      data={visibleEvents}
      extraData={`${safeJoinedIds.size}-${safeNow.getTime()}-${participantsEpoch}`}
      keyExtractor={(item, index) => item?.id || `event-${index}`}
      style={styles.list}
      showsVerticalScrollIndicator={false}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews
      updateCellsBatchingPeriod={50}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: contentPaddingBottom },
        visibleEvents.length === 0 && styles.contentGrow,
      ]}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      renderItem={({ item }) => {
        if (!item?.id) return null;
        const attendees = resolveCardAttendees(
          item,
          safeJoinedIds.has(item.id),
          participantsForEvent(item.id),
          hasParticipantsLoaded(item.id),
        );
        return (
          <TimelineCard
            event={item}
            selected={item.id === selectedId}
            joined={safeJoinedIds.has(item.id)}
            now={safeNow}
            attendees={attendees}
            onPress={() => {
              onSelect?.(item);
              if (onOpenEvent) {
                onOpenEvent(item);
                return;
              }
              router.push(`/event/${item.id}`);
            }}
          />
        );
      }}
      ListEmptyComponent={
        ListEmptyComponent ?? (
          <View style={styles.empty}>
            <EmptyStateIcon size={64} style={{ marginBottom: 12 }}>
              <SearchIcon size={26} color={theme.colors.iconEmpty} />
            </EmptyStateIcon>
            <Text style={styles.emptyTitle}>該当するイベントがありません</Text>
            <Text style={styles.emptyText}>
              カテゴリや絞り込み条件を変えてみてください
            </Text>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: 16,
  },
  contentGrow: {
    flexGrow: 1,
  },
  sep: {
    height: 14,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
    cursor: 'pointer',
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  cardEnded: {
    opacity: 0.78,
    backgroundColor: theme.colors.surfaceAlt,
    shadowOpacity: 0.04,
  },
  cardPressed: {
    opacity: 0.97,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.4,
    lineHeight: 24,
    marginBottom: 8,
  },
  titleEnded: {
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  hostLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  hostName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
  },
  hostNameEnded: {
    color: theme.colors.textMuted,
  },
  hash: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  hashEnded: {
    color: theme.colors.textMuted,
  },
  hashMuted: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  statusBadgeMuted: {
    backgroundColor: theme.colors.border,
  },
  statusBadgeEnded: {
    backgroundColor: '#8A9199',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.onPrimary,
  },
  statusBadgeTextMuted: {
    color: theme.colors.textSecondary,
  },
  statusBadgeEndedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  metaText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  metaTextEnded: {
    color: theme.colors.textMuted,
  },
  galleryDimmed: {
    opacity: 0.55,
  },
  gallery: {
    width: '100%',
    flexDirection: 'row',
    gap: PHOTO_GAP,
    marginBottom: 12,
  },
  galleryTile: {
    flex: 1,
    height: PHOTO_HEIGHT,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceAlt,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  socialLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  face: {
    borderWidth: 2,
    borderColor: theme.colors.surface,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
  },
  faceOverflow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.border,
  },
  faceOverflowText: {
    fontSize: 9,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  socialText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  socialTextEnded: {
    color: theme.colors.textMuted,
  },
  joinBtn: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
    overflow: 'hidden',
  },
  joinBtnJoined: {
    backgroundColor: theme.colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.primary,
  },
  joinBtnEnded: {
    backgroundColor: theme.colors.border,
  },
  joinText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.onPrimary,
    letterSpacing: 0.2,
  },
  joinTextJoined: {
    color: theme.colors.primaryDark,
  },
  joinTextEnded: {
    color: theme.colors.textSecondary,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});

const webGalleryImg = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  pointerEvents: 'none',
} as const;
