import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HostAvatar from '@/components/HostAvatar';
import {
  ChatIcon,
  EmptyStateIcon,
  SportIcon,
} from '@/components/icons';
import { theme } from '@/constants/theme';
import { eventHostUserId, visibleChatMessages } from '@/lib/blocks';
import { useBlocks } from '@/lib/blocksContext';
import { chatRoomHref } from '@/lib/chatNavigation';
import {
  formatChatListTime,
  formatUnreadBadge,
  isThreadHiddenFromList,
  lastMessage,
  previewTextForMessage,
  threadLastActivityAt,
  threadUnreadCount,
  type ChatThread,
} from '@/lib/chats';
import { useChats, dmUserIdFromThreadId } from '@/lib/chatsContext';
import { useEvents } from '@/lib/eventsContext';
import { localizedEventTitle } from '@/lib/eventLocalizedText';
import { isHostedByMe } from '@/lib/organizerProfile';
import type { SportEvent } from '@/lib/events';
import { resolveDisplayImageUrl } from '@/lib/storage';

type ThreadRow = {
  thread: ChatThread;
  event: SportEvent;
  preview: string;
  lastAt: number;
  unread: number;
};

function setKey(ids: Set<string> | string[]) {
  if (ids instanceof Set) {
    return [...ids].sort().join(',');
  }
  return [...ids].sort().join(',');
}

export default function MessagesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { events, joinedIds, hostedIds, currentUserId } = useEvents();
  const {
    threads,
    lastReadAt,
    hiddenAt,
    ensureThread,
    markThreadRead,
    hideThread,
    syncChatsForEvents,
    watchInboxForEvents,
  } = useChats();
  const { hiddenIds, isEventBlocked } = useBlocks();

  // events 配列参照の変化で購読を張り直さない（id 集合が変わったときだけ）
  const inboxEventIdsKey = useMemo(
    () =>
      events
        .filter(
          (event) => joinedIds.has(event.id) || hostedIds.has(event.id),
        )
        .map((event) => event.id)
        .sort()
        .join(','),
    [events, joinedIds, hostedIds],
  );
  const joinedKey = useMemo(() => setKey(joinedIds), [joinedIds]);
  const hostedKey = useMemo(() => setKey(hostedIds), [hostedIds]);

  const eventsRef = useRef(events);
  const joinedRef = useRef(joinedIds);
  const hostedRef = useRef(hostedIds);
  eventsRef.current = events;
  joinedRef.current = joinedIds;
  hostedRef.current = hostedIds;

  // メッセージタブ表示中: DB 同期 + 一覧向け Realtime（離れると購読解除）
  useFocusEffect(
    useCallback(() => {
      if (!currentUserId) return;
      const opts = {
        joinedIds: joinedRef.current,
        hostedIds: hostedRef.current,
        currentUserId,
      };
      void syncChatsForEvents(eventsRef.current, opts);
      const unwatchInbox = watchInboxForEvents(eventsRef.current, opts);
      // Realtime 取りこぼし・新規 DM スレッド用の軽いポーリング
      const pollId = setInterval(() => {
        void syncChatsForEvents(eventsRef.current, {
          joinedIds: joinedRef.current,
          hostedIds: hostedRef.current,
          currentUserId,
        });
      }, 20_000);
      return () => {
        clearInterval(pollId);
        unwatchInbox();
      };
      // sync / watch は module 関数で参照安定。events 本体は ref 経由
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional stable keys
    }, [
      currentUserId,
      inboxEventIdsKey,
      joinedKey,
      hostedKey,
    ]),
  );

  const rows = useMemo(() => {
    const list = threads.reduce<ThreadRow[]>((next, thread) => {
      const event = events.find((item) => item.id === thread.eventId);
      if (!event) return next;
      if (isThreadHiddenFromList(thread, hiddenAt[thread.id])) return next;
      const hosted = isHostedByMe(event, hostedIds, currentUserId);
      const joined = joinedIds.has(event.id);
      if (thread.mode === 'host' && isEventBlocked(event)) return next;
      if (thread.mode === 'group' && !joined && !hosted) return next;
      const visible = visibleChatMessages(
        thread.messages,
        hiddenIds,
        eventHostUserId(event),
      );
      if (visible.length === 0) return next;
      const last = lastMessage({ ...thread, messages: visible });
      next.push({
        thread,
        event,
        preview: previewTextForMessage(last),
        lastAt: last?.at ?? threadLastActivityAt(thread),
        unread: threadUnreadCount(
          { ...thread, messages: visible },
          lastReadAt[thread.id],
        ),
      });
      return next;
    }, []);
    list.sort((a, b) => b.lastAt - a.lastAt);
    return list;
  }, [
    threads,
    events,
    joinedIds,
    hostedIds,
    currentUserId,
    isEventBlocked,
    hiddenIds,
    lastReadAt,
    hiddenAt,
  ]);

  const confirmHideThread = useCallback(
    (thread: ChatThread, displayName: string) => {
      Alert.alert(
        t('messages.deleteChatTitle'),
        t('messages.deleteChatMessage', { name: displayName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('messages.hide'),
            style: 'destructive',
            onPress: () => hideThread(thread.id),
          },
        ],
      );
    },
    [hideThread, t],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('messages.title')}</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.thread.id}
        contentContainerStyle={
          rows.length === 0 ? styles.emptyWrap : styles.list
        }
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <EmptyStateIcon>
              <ChatIcon size={28} color={theme.colors.iconEmpty} />
            </EmptyStateIcon>
            <Text style={styles.emptyTitle}>
              {currentUserId
                ? t('messages.emptyTitleLoggedIn')
                : t('messages.emptyTitleGuest')}
            </Text>
            <Text style={styles.emptyBody}>
              {currentUserId
                ? t('messages.emptyBodyLoggedIn')
                : t('messages.emptyBodyGuest')}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const { thread, event, preview, lastAt, unread } = item;
          const isGroup = thread.mode === 'group';
          const name = isGroup ? localizedEventTitle(event) : event.host;
          const unreadLabel = formatUnreadBadge(unread);
          const hasUnread = unread > 0;
          return (
            <Swipeable
              friction={2}
              rightThreshold={40}
              overshootRight={false}
              renderRightActions={() => (
                <View style={styles.hideActionWrap}>
                  <Pressable
                    onPress={() => confirmHideThread(thread, name)}
                    style={({ pressed }) => [
                      styles.hideAction,
                      pressed && styles.hideActionPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('messages.hideChatA11y')}
                  >
                    <Text style={styles.hideActionText}>{t('common.delete')}</Text>
                  </Pressable>
                </View>
              )}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
                  onPress={() => {
                  const dmUserId = dmUserIdFromThreadId(thread.id);
                  ensureThread(event, thread.mode, dmUserId);
                  markThreadRead(event.id, thread.mode, dmUserId);
                  router.push(chatRoomHref(event.id, thread.mode, dmUserId));
                }}
                onLongPress={() => confirmHideThread(thread, name)}
                delayLongPress={420}
                accessibilityRole="button"
                accessibilityLabel={
                  hasUnread
                    ? t('messages.rowA11yUnread', { name, unread, preview })
                    : t('messages.rowA11y', { name, preview })
                }
                accessibilityHint={t('messages.rowHint')}
              >
                {isGroup ? (
                  <GroupThreadAvatar event={event} />
                ) : (
                  <HostAvatar
                    name={event.host}
                    imageUri={event.hostImageUri}
                    size={56}
                  />
                )}
                <View style={styles.body}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[styles.name, hasUnread && styles.nameUnread]}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    <Text
                      style={[styles.time, hasUnread && styles.timeUnread]}
                    >
                      {formatChatListTime(lastAt)}
                    </Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text
                      style={[
                        styles.preview,
                        hasUnread && styles.previewUnread,
                      ]}
                      numberOfLines={1}
                    >
                      {preview || t('messages.noMessages')}
                    </Text>
                    {unreadLabel != null ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                          {unreadLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            </Swipeable>
          );
        }}
      />
    </View>
  );
}

function GroupThreadAvatar({ event }: { event: SportEvent }) {
  const uri = resolveDisplayImageUrl(event.imageUri);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;

  return (
    <View style={styles.avatar}>
      {showImage ? (
        <Image
          source={{ uri }}
          style={styles.avatarImage}
          onError={() => setFailed(true)}
        />
      ) : (
        <View
          style={[
            styles.avatarFallback,
            {
              backgroundColor: event.accent || theme.colors.iconActiveBg,
            },
          ]}
        >
          <SportIcon
            sport={event.sport}
            size={24}
            color={theme.colors.iconActive}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
  },
  list: {
    paddingBottom: 24,
  },
  emptyWrap: {
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: theme.colors.background,
  },
  rowPressed: {
    backgroundColor: theme.colors.surfaceAlt,
  },
  hideActionWrap: {
    width: 88,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  hideAction: {
    flex: 1,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hideActionPressed: {
    opacity: 0.88,
  },
  hideActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceAlt,
  },
  avatarImage: {
    width: 56,
    height: 56,
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  nameUnread: {
    fontWeight: '800',
  },
  time: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  timeUnread: {
    color: theme.colors.textSecondary,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  preview: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  previewUnread: {
    fontWeight: '700',
    color: theme.colors.text,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 14,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginLeft: 84,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
