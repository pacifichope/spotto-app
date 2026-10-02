import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  loadChatReads,
  saveChatReads,
  type ChatReads,
} from '@/lib/chatReads';
import {
  fetchChatThreadReads,
  mergeChatReads,
  upsertChatThreadRead,
  upsertChatThreadReadsBulk,
} from '@/lib/chatReadsRemote';
import {
  loadChatHides,
  saveChatHides,
  type ChatHides,
} from '@/lib/chatHides';
import {
  deleteChatThreadHide,
  fetchChatThreadHides,
  mergeChatHides,
  upsertChatThreadHide,
} from '@/lib/chatHidesRemote';
import {
  chatThreadId,
  dmUserIdFromThreadId,
  formatChatClock,
  isSeededMessage,
  lastSentMessage,
  parseChatMode,
  seedGroupMessages,
  seedHostMessages,
  totalUnreadCount,
  type ChatMessage,
  type ChatThread,
  type EventChatMode,
} from '@/lib/chats';
import {
  deleteChatMessage,
  fetchChatMessages,
  fetchHostDmPeerIds,
  insertChatMessage,
  isRemoteEventId,
  subscribeChatMessages,
  subscribeEventChatInbox,
  type ChatMessageRow,
} from '@/lib/chatsRemote';
import type { SportEvent } from '@/lib/events';
import { findNgWord, NG_WORD_ERROR_MESSAGE } from '@/lib/ngWords';
import i18n from '@/lib/i18n';
import { resolveAuthUserId } from '@/lib/eventsRemote';
import { notifyChatMessagePush } from '@/lib/pushNotifications';
import { userFacingNetworkError } from '@/lib/safeAsync';
import { resolvePublicImageUrl } from '@/lib/storage';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { getUserProfile, userDisplayName } from '@/lib/userProfile';

type ChatSnapshot = {
  byId: Record<string, ChatThread>;
  lastReadAt: ChatReads;
  /** threadId → hidden_at（ms）。メッセージは残し、自分の一覧だけ隠す */
  hiddenAt: ChatHides;
};

export type SendMessageResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteMessageResult = SendMessageResult;

type ChatsContextValue = {
  threads: ChatThread[];
  lastReadAt: ChatReads;
  hiddenAt: ChatHides;
  unreadCount: number;
  ensureThread: (
    event: SportEvent,
    mode?: EventChatMode,
    dmUserId?: string | null,
  ) => void;
  getMessages: (
    eventId: string,
    mode: EventChatMode,
    dmUserId?: string | null,
  ) => ChatThread['messages'];
  sendMessage: (
    eventId: string,
    mode: EventChatMode,
    text: string,
    options?: {
      dmUserId?: string | null;
      hostUserId?: string | null;
    },
  ) => Promise<SendMessageResult>;
  deleteMessage: (
    eventId: string,
    mode: EventChatMode,
    messageId: string,
    options?: {
      dmUserId?: string | null;
    },
  ) => Promise<DeleteMessageResult>;
  markThreadRead: (
    eventId: string,
    mode?: EventChatMode,
    dmUserId?: string | null,
  ) => void;
  markAllThreadsRead: () => void;
  /** 自分の一覧からルームを非表示（DBのメッセージは消さない） */
  hideThread: (threadId: string) => void;
  /** 非表示を解除 */
  unhideThread: (threadId: string) => void;
  /** チャット画面表示中の Realtime 購読。戻り値で解除 */
  watchThread: (
    event: SportEvent,
    mode?: EventChatMode,
    dmUserId?: string | null,
  ) => () => void;
  /**
   * 履歴一覧向け: 参加／主催イベントの chat_messages をイベント単位で購読。
   * プレビュー・未読・並び順が Realtime で更新される。戻り値で一括解除。
   */
  watchInboxForEvents: (
    events: SportEvent[],
    options: {
      joinedIds: Set<string> | string[];
      hostedIds: Set<string> | string[];
      currentUserId: string | null;
    },
  ) => () => void;
  /** 最新メッセージを再取得してローカルに反映 */
  refreshThread: (
    event: SportEvent,
    mode?: EventChatMode,
    dmUserId?: string | null,
  ) => Promise<void>;
  /**
   * 参加／主催イベントのチャットを DB から一括再取得。
   * 再ログイン・再起動後に履歴を復元する。
   */
  syncChatsForEvents: (
    events: SportEvent[],
    options: {
      joinedIds: Set<string> | string[];
      hostedIds: Set<string> | string[];
      currentUserId: string | null;
    },
  ) => Promise<void>;
};

const ChatsContext = createContext<ChatsContextValue | null>(null);

let snapshot: ChatSnapshot = { byId: {}, lastReadAt: {}, hiddenAt: {} };
const listeners = new Set<() => void>();
const hydratedThreads = new Set<string>();
/** threadId → 進行中 hydrate の世代（古いレスポンスを捨てる） */
const hydrateGenerations = new Map<string, number>();
const realtimeUnsubscribers = new Map<string, () => void>();
/** threadId → 画面ウォッチ数（0 で購読解除） */
const realtimeWatchers = new Map<string, number>();
const realtimeRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** threadId / eventId → 連続リトライ回数（上限で停止） */
const realtimeRetryAttempts = new Map<string, number>();
const inboxRetryAttempts = new Map<string, number>();
const MAX_REALTIME_RETRIES = 8;
const realtimeAttachArgs = new Map<
  string,
  {
    threadId: string;
    eventId: string;
    mode: EventChatMode;
    dmUserId?: string | null;
    hostUserId?: string | null;
  }
>();
/** eventId → 一覧 inbox ウォッチ数（0 で購読解除） */
const inboxWatchers = new Map<string, number>();
const inboxUnsubscribers = new Map<string, () => void>();
const inboxRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const inboxAttachArgs = new Map<
  string,
  {
    eventId: string;
    hostUserId?: string | null;
    isHost: boolean;
  }
>();
let authUserId: string | null = null;
/** 認証の一瞬 null で履歴を消さないための遅延クリア */
let pendingLogoutClearTimer: ReturnType<typeof setTimeout> | null = null;
let authFlickerPending = false;
let syncInFlight: Promise<void> | null = null;

function cancelPendingLogoutClear() {
  if (pendingLogoutClearTimer) {
    clearTimeout(pendingLogoutClearTimer);
    pendingLogoutClearTimer = null;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

function setSnapshot(
  updater: (prev: ChatSnapshot) => ChatSnapshot,
  options?: { persistReads?: boolean; persistHides?: boolean },
) {
  const next = updater(snapshot);
  if (next === snapshot) return;
  const readsChanged = next.lastReadAt !== snapshot.lastReadAt;
  const hidesChanged = next.hiddenAt !== snapshot.hiddenAt;
  snapshot = next;
  emit();
  if (readsChanged && options?.persistReads !== false) {
    void saveChatReads(next.lastReadAt, authUserId);
  }
  if (hidesChanged && options?.persistHides !== false) {
    void saveChatHides(next.hiddenAt, authUserId);
  }
}

function setById(
  updater: (prev: Record<string, ChatThread>) => Record<string, ChatThread>,
) {
  setSnapshot((prev) => {
    const byId = updater(prev.byId);
    if (byId === prev.byId) return prev;
    return { ...prev, byId };
  });
}

async function hydrateChatReadsForUser(userId: string | null) {
  const local = await loadChatReads(userId);
  const remote = userId ? await fetchChatThreadReads() : {};
  const merged = mergeChatReads(local, remote);
  setSnapshot((prev) => {
    const nextReads = mergeChatReads(merged, prev.lastReadAt);
    if (
      Object.keys(nextReads).length === Object.keys(prev.lastReadAt).length &&
      Object.entries(nextReads).every(([id, at]) => prev.lastReadAt[id] === at)
    ) {
      return prev;
    }
    return { ...prev, lastReadAt: nextReads };
  });
  // ローカルが進んでいる分をサーバーへ押し上げ
  if (userId && Object.keys(merged).length > 0) {
    void upsertChatThreadReadsBulk(merged);
  }

  const localHides = await loadChatHides(userId);
  const remoteHides = userId ? await fetchChatThreadHides() : {};
  const mergedHides = mergeChatHides(localHides, remoteHides);
  setSnapshot((prev) => {
    const nextHides = mergeChatHides(mergedHides, prev.hiddenAt);
    if (
      Object.keys(nextHides).length === Object.keys(prev.hiddenAt).length &&
      Object.entries(nextHides).every(([id, at]) => prev.hiddenAt[id] === at)
    ) {
      return prev;
    }
    return { ...prev, hiddenAt: nextHides };
  });
}

function resolveDmUserId(
  mode: EventChatMode,
  event: SportEvent,
  explicit?: string | null,
): string | null {
  if (parseChatMode(mode) !== 'host') return null;
  if (explicit?.trim()) return explicit.trim();
  const hostId = event.hostId?.trim();
  // 参加者→主催者 DM: スレッドキーは参加者 UID
  if (authUserId && hostId && authUserId !== hostId) {
    return authUserId;
  }
  // 主催者側は peer（参加者）UID の明示が必須
  return null;
}

function upsertMessage(threadId: string, message: ChatMessage) {
  setById((prev) => {
    const thread = prev[threadId];
    if (!thread) {
      const [eventId, modePart] = threadId.split(':');
      const mode = parseChatMode(modePart === 'host' ? 'host' : 'group');
      return {
        ...prev,
        [threadId]: {
          id: threadId,
          eventId,
          mode,
          messages: [message],
        },
      };
    }
    const existingIndex = thread.messages.findIndex(
      (item) => item.id === message.id,
    );
    if (existingIndex >= 0) {
      const existing = thread.messages[existingIndex];
      if (
        existing.name === message.name &&
        existing.imageUri === message.imageUri &&
        existing.role === message.role &&
        existing.text === message.text
      ) {
        return prev;
      }
      const messages = thread.messages.slice();
      messages[existingIndex] = { ...existing, ...message };
      return {
        ...prev,
        [threadId]: { ...thread, messages },
      };
    }
    // 楽観送信の仮 ID を実 ID で置換（自分のエコーのときだけ）
    const isOwnEcho =
      message.role === 'me' ||
      Boolean(authUserId && message.senderId === authUserId);
    const withoutTemp = isOwnEcho
      ? thread.messages.filter(
          (item) =>
            !(
              item.role === 'me' &&
              item.text === message.text &&
              item.id.startsWith('local-') &&
              Math.abs(item.at - message.at) < 60_000
            ),
        )
      : thread.messages;
    return {
      ...prev,
      [threadId]: {
        ...thread,
        messages: [...withoutTemp, message].sort((a, b) => a.at - b.at),
      },
    };
  });
}

function removeMessage(threadId: string, messageId: string) {
  setById((prev) => {
    const thread = prev[threadId];
    if (!thread) return prev;
    if (!thread.messages.some((item) => item.id === messageId)) return prev;
    return {
      ...prev,
      [threadId]: {
        ...thread,
        messages: thread.messages.filter((item) => item.id !== messageId),
      },
    };
  });
}

function clearRealtimeRetry(threadId: string) {
  const timer = realtimeRetryTimers.get(threadId);
  if (timer) {
    clearTimeout(timer);
    realtimeRetryTimers.delete(threadId);
  }
}

function detachRealtime(threadId: string) {
  clearRealtimeRetry(threadId);
  const unsub = realtimeUnsubscribers.get(threadId);
  if (!unsub) return;
  // removeChannel → CLOSED 再入前に Map から外す
  realtimeUnsubscribers.delete(threadId);
  try {
    unsub();
  } catch {
    // ignore
  }
}

function scheduleRealtimeRetry(threadId: string, delayMs = 1600) {
  if ((realtimeWatchers.get(threadId) ?? 0) <= 0) return;
  if (realtimeRetryTimers.has(threadId)) return;
  const attempts = (realtimeRetryAttempts.get(threadId) ?? 0) + 1;
  if (attempts > MAX_REALTIME_RETRIES) {
    if (__DEV__) {
      console.warn('[chats] realtime retry exhausted', { threadId, attempts });
    }
    return;
  }
  realtimeRetryAttempts.set(threadId, attempts);
  const backoff = Math.min(delayMs * attempts, 15_000);
  const timer = setTimeout(() => {
    realtimeRetryTimers.delete(threadId);
    const args = realtimeAttachArgs.get(threadId);
    if (!args) return;
    if ((realtimeWatchers.get(threadId) ?? 0) <= 0) return;
    // 既に生きていれば張り直さない
    if (realtimeUnsubscribers.has(threadId)) return;
    attachRealtime(args);
  }, backoff);
  realtimeRetryTimers.set(threadId, timer);
}

function attachRealtime(input: {
  threadId: string;
  eventId: string;
  mode: EventChatMode;
  dmUserId?: string | null;
  hostUserId?: string | null;
}) {
  realtimeAttachArgs.set(input.threadId, input);
  if ((realtimeWatchers.get(input.threadId) ?? 0) <= 0) return;
  if (realtimeUnsubscribers.has(input.threadId)) return;

  const unsub = subscribeChatMessages({
    eventId: input.eventId,
    mode: input.mode,
    dmUserId: input.dmUserId,
    // 購読時点の UID を固定せず、到着時の auth で role を再判定する
    currentUserId: null,
    hostUserId: input.hostUserId,
    handlers: {
      onInsert: (message) => {
        const uid = authUserId?.trim();
        const next =
          uid && message.senderId === uid && message.role !== 'me'
            ? { ...message, role: 'me' as const }
            : message;
        upsertMessage(input.threadId, next);
      },
      onDelete: (messageId) => {
        removeMessage(input.threadId, messageId);
      },
      onStatus: (status) => {
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          // subscribe 側で既に removed。Map 掃除のみ（unsub 再呼ぶと危険なので has チェック）
          if (realtimeUnsubscribers.has(input.threadId)) {
            detachRealtime(input.threadId);
          } else {
            clearRealtimeRetry(input.threadId);
          }
          scheduleRealtimeRetry(input.threadId);
          return;
        }
        if (status === 'SUBSCRIBED') {
          realtimeRetryAttempts.delete(input.threadId);
          clearRealtimeRetry(input.threadId);
          // 購読確立までの取りこぼしを1回取りにいく（連打防止）
          const catchUpKey = `${input.threadId}:catchup`;
          if (realtimeRetryTimers.has(catchUpKey)) return;
          const timer = setTimeout(() => {
            realtimeRetryTimers.delete(catchUpKey);
          }, 2500);
          realtimeRetryTimers.set(catchUpKey, timer);
          const args = realtimeAttachArgs.get(input.threadId);
          if (!args) return;
          const eventLike = {
            id: args.eventId,
            hostId: args.hostUserId ?? undefined,
          } as SportEvent;
          void hydrateRemoteThread(eventLike, args.mode, args.dmUserId, {
            force: true,
          });
        }
      },
    },
  });
  if (unsub) {
    realtimeUnsubscribers.set(input.threadId, unsub);
  } else {
    scheduleRealtimeRetry(input.threadId, 2500);
  }
}

async function hydrateRemoteThread(
  event: SportEvent,
  mode: EventChatMode,
  dmUserId?: string | null,
  options?: { force?: boolean },
) {
  if (!isSupabaseConfigured() || !isRemoteEventId(event.id)) return;
  if (!authUserId) {
    authUserId = await resolveAuthUserId();
  }
  const room = parseChatMode(mode);
  const dm = resolveDmUserId(room, event, dmUserId);
  if (room === 'host' && !dm) return;

  const threadId = chatThreadId(event.id, room, dm);
  const existing = snapshot.byId[threadId];
  const hasRealMessages = existing?.messages.some(
    (item) => !isSeededMessage(item) && !item.id.startsWith('local-'),
  );
  // 実メッセージが無い／強制時は必ず DB から取り直す
  const shouldFetch =
    Boolean(options?.force) ||
    !hydratedThreads.has(threadId) ||
    !hasRealMessages;

  if (!shouldFetch) {
    attachRealtime({
      threadId,
      eventId: event.id,
      mode: room,
      dmUserId: dm,
      hostUserId: event.hostId,
    });
    return;
  }

  const generation = (hydrateGenerations.get(threadId) ?? 0) + 1;
  hydrateGenerations.set(threadId, generation);
  // 取り直し前に hydrated フラグを外し、失敗時に再試行できるようにする
  hydratedThreads.delete(threadId);

  const remote = await fetchChatMessages({
    eventId: event.id,
    mode: room,
    dmUserId: dm,
    currentUserId: authUserId,
    hostUserId: event.hostId,
  }).catch((error) => {
    console.error('[chats] fetch threw', {
      error,
      eventId: event.id,
      mode: room,
      dmUserId: dm,
    });
    return { ok: false as const, error: i18n.t('chat.fetchFailed') };
  });

  const isLatestGeneration =
    hydrateGenerations.get(threadId) === generation;

  if (!remote.ok) {
    console.error('[chats] fetch failed', {
      error: remote.error,
      eventId: event.id,
      mode: room,
      dmUserId: dm,
      authUserId,
    });
    // 新しい世代が失敗したあと、進行中の古い成功レスポンスを捨てない
    if (isLatestGeneration) {
      hydrateGenerations.set(threadId, Math.max(0, generation - 1));
    }
    // 失敗時は既存メッセージを消さない（楽観送信・Realtime 分を守る）
    attachRealtime({
      threadId,
      eventId: event.id,
      mode: room,
      dmUserId: dm,
      hostUserId: event.hostId,
    });
    return;
  }

  if (!isLatestGeneration) {
    // より新しい hydrate が走っていても、成功分は merge して取りこぼしを防ぐ
    for (const message of remote.data) {
      upsertMessage(threadId, message);
    }
    return;
  }

  hydratedThreads.add(threadId);
  setById((prev) => {
    const current = prev[threadId];
    const remoteIds = new Set(remote.data.map((item) => item.id));
    // Realtime / 楽観送信で先に届いた分を hydrate で消さない（時間制限なし）
    const extras =
      current?.messages.filter(
        (item) => !isSeededMessage(item) && !remoteIds.has(item.id),
      ) ?? [];
    return {
      ...prev,
      [threadId]: {
        id: threadId,
        eventId: event.id,
        mode: room,
        hostUserId: event.hostId ?? null,
        dmUserId: dm,
        messages: [...remote.data, ...extras].sort((a, b) => a.at - b.at),
      },
    };
  });

  attachRealtime({
    threadId,
    eventId: event.id,
    mode: room,
    dmUserId: dm,
    hostUserId: event.hostId,
  });
}

function ensureThread(
  event: SportEvent,
  mode: EventChatMode = 'group',
  dmUserId?: string | null,
) {
  const room = parseChatMode(mode);
  const dm = resolveDmUserId(room, event, dmUserId);
  const id = chatThreadId(event.id, room, dm);
  const remoteReady =
    isSupabaseConfigured() && isRemoteEventId(event.id);
  setById((prev) => {
    if (prev[id]) {
      const thread = prev[id];
      if (
        thread.hostUserId === (event.hostId ?? null) &&
        thread.dmUserId === dm
      ) {
        return prev;
      }
      return {
        ...prev,
        [id]: {
          ...thread,
          hostUserId: event.hostId ?? null,
          dmUserId: dm,
        },
      };
    }
    return {
      ...prev,
      [id]: {
        id,
        eventId: event.id,
        mode: room,
        hostUserId: event.hostId ?? null,
        dmUserId: dm,
        // リモート同期できるイベントは空から始め、DB 履歴を正とする（偽シードで上書きしない）
        messages: remoteReady
          ? []
          : room === 'host'
            ? seedHostMessages(event)
            : seedGroupMessages(event),
      },
    };
  });
  // 常時 force しない（watchThread / refreshThread が明示 force する）
  void hydrateRemoteThread(event, room, dm);
}

function watchThread(
  event: SportEvent,
  mode: EventChatMode = 'group',
  dmUserId?: string | null,
): () => void {
  const room = parseChatMode(mode);
  const dm = resolveDmUserId(room, event, dmUserId);
  // host DM で peer 未確定なら購読・誤スレッドを作らない
  if (room === 'host' && !dm) {
    return () => {};
  }
  const threadId = chatThreadId(event.id, room, dm);
  realtimeWatchers.set(threadId, (realtimeWatchers.get(threadId) ?? 0) + 1);

  ensureThread(event, room, dm);
  attachRealtime({
    threadId,
    eventId: event.id,
    mode: room,
    dmUserId: dm,
    hostUserId: event.hostId,
  });
  void hydrateRemoteThread(event, room, dm, { force: true });

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = (realtimeWatchers.get(threadId) ?? 1) - 1;
    if (next <= 0) {
      realtimeWatchers.delete(threadId);
      detachRealtime(threadId);
    } else {
      realtimeWatchers.set(threadId, next);
    }
  };
}

function inboxRowVisible(
  row: ChatMessageRow,
  options: { currentUserId: string; isHost: boolean },
): boolean {
  const mode = parseChatMode(row.mode);
  if (mode === 'group') {
    return !String(row.dm_user_id ?? '').trim();
  }
  const dm = String(row.dm_user_id ?? '').trim();
  if (!dm) return false;
  // 主催者は全 DM、参加者は自分宛のみ
  if (options.isHost) return true;
  return dm === options.currentUserId;
}

function clearInboxRetry(eventId: string) {
  const timer = inboxRetryTimers.get(eventId);
  if (timer) {
    clearTimeout(timer);
    inboxRetryTimers.delete(eventId);
  }
}

function detachInbox(eventId: string) {
  clearInboxRetry(eventId);
  const unsub = inboxUnsubscribers.get(eventId);
  if (!unsub) return;
  // removeChannel → CLOSED 再入前に Map から外す
  inboxUnsubscribers.delete(eventId);
  try {
    unsub();
  } catch {
    // ignore
  }
}

function scheduleInboxRetry(eventId: string, delayMs = 1600) {
  if ((inboxWatchers.get(eventId) ?? 0) <= 0) return;
  if (inboxRetryTimers.has(eventId)) return;
  const attempts = (inboxRetryAttempts.get(eventId) ?? 0) + 1;
  if (attempts > MAX_REALTIME_RETRIES) {
    if (__DEV__) {
      console.warn('[chats] inbox retry exhausted', { eventId, attempts });
    }
    return;
  }
  inboxRetryAttempts.set(eventId, attempts);
  const backoff = Math.min(delayMs * attempts, 15_000);
  const timer = setTimeout(() => {
    inboxRetryTimers.delete(eventId);
    const args = inboxAttachArgs.get(eventId);
    if (!args) return;
    if ((inboxWatchers.get(eventId) ?? 0) <= 0) return;
    if (inboxUnsubscribers.has(eventId)) return;
    attachInbox(args);
  }, backoff);
  inboxRetryTimers.set(eventId, timer);
}

function attachInbox(input: {
  eventId: string;
  hostUserId?: string | null;
  isHost: boolean;
}) {
  inboxAttachArgs.set(input.eventId, input);
  if ((inboxWatchers.get(input.eventId) ?? 0) <= 0) return;
  if (inboxUnsubscribers.has(input.eventId)) return;

  const unsub = subscribeEventChatInbox({
    eventId: input.eventId,
    currentUserId: authUserId,
    hostUserId: input.hostUserId,
    handlers: {
      onInsert: (message, row) => {
        const uid = authUserId?.trim();
        if (!uid) return;
        if (!inboxRowVisible(row, { currentUserId: uid, isHost: input.isHost })) {
          return;
        }
        const room = parseChatMode(row.mode);
        const dm =
          room === 'host' ? String(row.dm_user_id ?? '').trim() || null : null;
        if (room === 'host' && !dm) return;
        const threadId = chatThreadId(input.eventId, room, dm);
        // 一覧に無い新規 DM もスレッドを起こしてプレビューを即反映
        setById((prev) => {
          const existing = prev[threadId];
          if (existing) {
            if (
              existing.hostUserId === (input.hostUserId ?? null) &&
              existing.dmUserId === dm
            ) {
              return prev;
            }
            return {
              ...prev,
              [threadId]: {
                ...existing,
                hostUserId: input.hostUserId ?? null,
                dmUserId: dm,
              },
            };
          }
          return {
            ...prev,
            [threadId]: {
              id: threadId,
              eventId: input.eventId,
              mode: room,
              hostUserId: input.hostUserId ?? null,
              dmUserId: dm,
              messages: [],
            },
          };
        });
        upsertMessage(
          threadId,
          uid && message.senderId === uid && message.role !== 'me'
            ? { ...message, role: 'me' as const }
            : message,
        );
      },
      onDelete: (messageId) => {
        // どのスレッドか不明なため、当該イベントの全スレッドから除去
        setById((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [id, thread] of Object.entries(prev)) {
            if (thread.eventId !== input.eventId) continue;
            if (!thread.messages.some((item) => item.id === messageId)) continue;
            changed = true;
            next[id] = {
              ...thread,
              messages: thread.messages.filter((item) => item.id !== messageId),
            };
          }
          return changed ? next : prev;
        });
      },
      onStatus: (status) => {
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          if (inboxUnsubscribers.has(input.eventId)) {
            detachInbox(input.eventId);
          } else {
            clearInboxRetry(input.eventId);
          }
          scheduleInboxRetry(input.eventId);
          return;
        }
        if (status === 'SUBSCRIBED') {
          inboxRetryAttempts.delete(input.eventId);
          clearInboxRetry(input.eventId);
        }
      },
    },
  });

  if (unsub) {
    inboxUnsubscribers.set(input.eventId, unsub);
  } else {
    scheduleInboxRetry(input.eventId, 2500);
  }
}

/**
 * 履歴一覧フォーカス中に、参加／主催イベントの新着をリアルタイム反映する。
 * 個別ルームの watchThread とは独立した refcount（inboxWatchers）。
 */
function watchInboxForEvents(
  events: SportEvent[],
  options: {
    joinedIds: Set<string> | string[];
    hostedIds: Set<string> | string[];
    currentUserId: string | null;
  },
): () => void {
  const userId = options.currentUserId?.trim() || authUserId;
  if (!userId || !isSupabaseConfigured()) {
    return () => {};
  }
  authUserId = userId;
  const joined = toIdSet(options.joinedIds);
  const hosted = toIdSet(options.hostedIds);
  const targets = events.filter(
    (event) =>
      isRemoteEventId(event.id) &&
      (joined.has(event.id) || hosted.has(event.id)),
  );

  const watchedIds: string[] = [];
  for (const event of targets) {
    const eventId = event.id;
    watchedIds.push(eventId);
    inboxWatchers.set(eventId, (inboxWatchers.get(eventId) ?? 0) + 1);
    attachInbox({
      eventId,
      hostUserId: event.hostId ?? null,
      isHost: hosted.has(eventId),
    });
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const eventId of watchedIds) {
      const next = (inboxWatchers.get(eventId) ?? 1) - 1;
      if (next <= 0) {
        inboxWatchers.delete(eventId);
        detachInbox(eventId);
      } else {
        inboxWatchers.set(eventId, next);
      }
    }
  };
}

async function refreshThread(
  event: SportEvent,
  mode: EventChatMode = 'group',
  dmUserId?: string | null,
) {
  await hydrateRemoteThread(event, parseChatMode(mode), dmUserId, {
    force: true,
  });
}

/** メモリ上の全スレッドを DB から再取得（認証復帰後） */
async function rehydrateAllKnownThreads() {
  const threads = Object.values(snapshot.byId);
  if (threads.length === 0) return;
  // 認証 UID が変わった／復帰したので Realtime を張り直す（role 判定・JWT 更新）
  for (const threadId of [...realtimeUnsubscribers.keys()]) {
    detachRealtime(threadId);
  }
  for (const eventId of [...inboxUnsubscribers.keys()]) {
    detachInbox(eventId);
  }
  await Promise.all(
    threads.map(async (thread) => {
      const eventLike: SportEvent = {
        id: thread.eventId,
        hostId: thread.hostUserId ?? undefined,
      } as SportEvent;
      await hydrateRemoteThread(eventLike, thread.mode, thread.dmUserId, {
        force: true,
      });
    }),
  );
  // 画面が開いているスレッドは attachRealtime を再実行
  for (const [threadId, args] of realtimeAttachArgs.entries()) {
    if ((realtimeWatchers.get(threadId) ?? 0) > 0) {
      attachRealtime(args);
    }
  }
  for (const [eventId, args] of inboxAttachArgs.entries()) {
    if ((inboxWatchers.get(eventId) ?? 0) > 0) {
      attachInbox(args);
    }
  }
}

function toIdSet(value: Set<string> | string[] | undefined): Set<string> {
  if (!value) return new Set();
  return value instanceof Set ? value : new Set(value);
}

/**
 * 参加・主催イベントのグループ／DM チャットを DB から一括ロード。
 * 再起動後もメッセージ一覧とルーム履歴を復元する。
 */
async function syncChatsForEvents(
  events: SportEvent[],
  options: {
    joinedIds: Set<string> | string[];
    hostedIds: Set<string> | string[];
    currentUserId: string | null;
  },
): Promise<void> {
  const userId = options.currentUserId?.trim() || authUserId;
  if (!userId) return;
  if (!isSupabaseConfigured()) return;

  if (syncInFlight) {
    await syncInFlight;
  }

  const run = (async () => {
    authUserId = userId;
    const joined = toIdSet(options.joinedIds);
    const hosted = toIdSet(options.hostedIds);
    const targets = events.filter(
      (event) =>
        isRemoteEventId(event.id) &&
        (joined.has(event.id) || hosted.has(event.id)),
    );
    if (targets.length === 0) return;

    await Promise.all(
      targets.map(async (event) => {
        const isHost = hosted.has(event.id);
        // グループチャット（参加者・主催者とも）
        ensureThread(event, 'group');
        await hydrateRemoteThread(event, 'group', null, { force: true });

        if (isHost) {
          // 主催者: DB 上の DM 相手ごとに履歴を復元
          const peers = await fetchHostDmPeerIds(event.id);
          await Promise.all(
            peers.map(async (peerId) => {
              if (!peerId || peerId === userId) return;
              ensureThread(event, 'host', peerId);
              await hydrateRemoteThread(event, 'host', peerId, {
                force: true,
              });
            }),
          );
        } else {
          // 参加者: 主催者 DM
          ensureThread(event, 'host', userId);
          await hydrateRemoteThread(event, 'host', userId, { force: true });
        }
      }),
    );
  })();

  syncInFlight = run.finally(() => {
    if (syncInFlight === run) syncInFlight = null;
  });
  await syncInFlight;
}

async function sendMessage(
  eventId: string,
  mode: EventChatMode,
  text: string,
  options?: {
    dmUserId?: string | null;
    hostUserId?: string | null;
  },
): Promise<SendMessageResult> {
  const room = parseChatMode(mode);
  const body = text.trim();
  if (!body) return { ok: false, error: i18n.t('chat.emptyMessage') };
  if (findNgWord(body)) {
    return { ok: false, error: NG_WORD_ERROR_MESSAGE };
  }

  // 楽観更新を最優先（await 前に一覧へ載せる）
  const cachedAuth = authUserId;
  const dm =
    room === 'host'
      ? options?.dmUserId?.trim() ||
        (cachedAuth &&
        options?.hostUserId &&
        cachedAuth !== options.hostUserId
          ? cachedAuth
          : null)
      : null;
  if (room === 'host' && !dm) {
    return { ok: false, error: i18n.t('chat.dmPeerUnknown') };
  }

  const id = chatThreadId(eventId, room, dm);
  const at = Date.now();
  const me = getUserProfile();
  const myRemoteAvatar = resolvePublicImageUrl(me.imageUri);
  const localId = `local-${at}`;
  const optimistic: ChatMessage = {
    id: localId,
    role: 'me',
    name: userDisplayName(me),
    imageUri: myRemoteAvatar || me.imageUri,
    senderId: cachedAuth || 'me',
    text: body,
    time: formatChatClock(at),
    at,
    seeded: false,
  };

  setById((prev) => {
    const thread = prev[id];
    if (!thread) {
      return {
        ...prev,
        [id]: {
          id,
          eventId,
          mode: room,
          hostUserId: options?.hostUserId ?? null,
          dmUserId: dm,
          messages: [optimistic],
        },
      };
    }
    return {
      ...prev,
      [id]: {
        ...thread,
        hostUserId: options?.hostUserId ?? thread.hostUserId ?? null,
        dmUserId: dm ?? thread.dmUserId ?? null,
        messages: [...thread.messages, optimistic],
      },
    };
  });

  if (!authUserId) {
    authUserId = await resolveAuthUserId();
  }

  if (!isSupabaseConfigured() || !isRemoteEventId(eventId)) {
    console.error('[chats] send skipped: remote unavailable', {
      configured: isSupabaseConfigured(),
      eventId,
      isRemote: isRemoteEventId(eventId),
    });
    setById((prev) => {
      const thread = prev[id];
      if (!thread) return prev;
      return {
        ...prev,
        [id]: {
          ...thread,
          messages: thread.messages.filter((item) => item.id !== localId),
        },
      };
    });
    return {
      ok: false,
      error: i18n.t('chat.cloudSyncUnavailable'),
    };
  }

  if (!authUserId) {
    console.error('[chats] send skipped: no auth user id', { eventId, mode: room });
    setById((prev) => {
      const thread = prev[id];
      if (!thread) return prev;
      return {
        ...prev,
        [id]: {
          ...thread,
          messages: thread.messages.filter((item) => item.id !== localId),
        },
      };
    });
    return {
      ok: false,
      error: i18n.t('chat.sessionLost'),
    };
  }

  // 楽観更新時の senderId を確定 UID に揃える
  if (cachedAuth !== authUserId) {
    upsertMessage(id, { ...optimistic, senderId: authUserId });
  }

  const remote = await insertChatMessage({
    eventId,
    mode: room,
    dmUserId: dm,
    body,
    senderName: userDisplayName(me),
    senderImageUri: myRemoteAvatar,
    hostUserId: options?.hostUserId,
  });

  if (!remote.ok) {
    console.error('[chats] send failed', {
      error: remote.error,
      eventId,
      mode: room,
      dmUserId: dm,
      authUserId,
      senderName: userDisplayName(me),
    });
    setById((prev) => {
      const thread = prev[id];
      if (!thread) return prev;
      return {
        ...prev,
        [id]: {
          ...thread,
          messages: thread.messages.filter((item) => item.id !== localId),
        },
      };
    });
    return {
      ok: false,
      error: userFacingNetworkError(remote.error, i18n.t('chat.sendFailed')),
    };
  }

  upsertMessage(id, remote.data);

  void (async () => {
    try {
      const recipientIds: string[] = [];
      if (room === 'host') {
        const hostId = options?.hostUserId?.trim() || '';
        const other =
          dm && dm !== authUserId
            ? dm
            : hostId && hostId !== authUserId
              ? hostId
              : '';
        if (other) recipientIds.push(other);
      } else {
        const client = getSupabaseClient();
        if (client) {
          const { data } = await client
            .from('event_participants')
            .select('user_id')
            .eq('event_id', eventId);
          for (const row of data ?? []) {
            const uid = String(
              (row as { user_id?: string }).user_id ?? '',
            ).trim();
            if (uid && uid !== authUserId) recipientIds.push(uid);
          }
        }
      }
      if (recipientIds.length === 0) return;
      await notifyChatMessagePush({
        recipientUserIds: recipientIds,
        senderName: userDisplayName(me),
        preview: body,
        eventId,
        mode: room,
      });
    } catch {
      // プッシュ失敗は送信成功を阻害しない
    }
  })();

  return { ok: true };
}

async function deleteMessage(
  eventId: string,
  mode: EventChatMode,
  messageId: string,
  options?: {
    dmUserId?: string | null;
  },
): Promise<DeleteMessageResult> {
  const room = parseChatMode(mode);
  const dm = options?.dmUserId?.trim() || null;
  const threadId = chatThreadId(eventId, room, dm);
  const thread =
    snapshot.byId[threadId] ??
    (dm ? undefined : snapshot.byId[chatThreadId(eventId, room)]);
  const targetId = String(messageId || '').trim();
  if (!targetId) {
    return { ok: false, error: i18n.t('chat.noMessageId') };
  }

  const message = thread?.messages.find((item) => item.id === targetId);
  if (!message) {
    return { ok: false, error: i18n.t('chat.messageNotFound') };
  }
  if (isSeededMessage(message)) {
    return { ok: false, error: i18n.t('chat.cannotDelete') };
  }
  if (message.role !== 'me') {
    return { ok: false, error: i18n.t('chat.deleteOwnOnly') };
  }
  if (
    authUserId &&
    message.senderId &&
    message.senderId !== 'me' &&
    message.senderId !== authUserId
  ) {
    return { ok: false, error: i18n.t('chat.deleteOwnOnly') };
  }

  const resolvedThreadId = thread?.id ?? threadId;
  const remote = await deleteChatMessage(targetId);
  if (!remote.ok) {
    return {
      ok: false,
      error: userFacingNetworkError(
        remote.error,
        i18n.t('chat.deleteFailed'),
      ),
    };
  }

  removeMessage(resolvedThreadId, targetId);
  return { ok: true };
}

function markThreadRead(
  eventId: string,
  mode: EventChatMode = 'group',
  dmUserId?: string | null,
) {
  const id = chatThreadId(eventId, parseChatMode(mode), dmUserId);
  const at = Date.now();
  const prevAt = snapshot.lastReadAt[id] ?? 0;
  const wasHidden = Boolean(snapshot.hiddenAt[id]);
  if (prevAt >= at && !wasHidden) return;
  setSnapshot((prev) => {
    const nextReads =
      prevAt >= at
        ? prev.lastReadAt
        : { ...prev.lastReadAt, [id]: at };
    let nextHides = prev.hiddenAt;
    if (prev.hiddenAt[id]) {
      nextHides = { ...prev.hiddenAt };
      delete nextHides[id];
    }
    if (nextReads === prev.lastReadAt && nextHides === prev.hiddenAt) {
      return prev;
    }
    return { ...prev, lastReadAt: nextReads, hiddenAt: nextHides };
  });
  if (prevAt < at) {
    void upsertChatThreadRead(id, at);
  }
  if (wasHidden) {
    void deleteChatThreadHide(id);
  }
}

function hideThread(threadId: string) {
  const id = String(threadId || '').trim();
  if (!id) return;
  const thread = snapshot.byId[id];
  const last = thread ? lastSentMessage(thread) : undefined;
  const at = Math.max(Date.now(), last?.at ?? 0);
  setSnapshot((prev) => {
    if (prev.hiddenAt[id] === at) return prev;
    return {
      ...prev,
      hiddenAt: { ...prev.hiddenAt, [id]: at },
    };
  });
  void upsertChatThreadHide(id, at);
}

function unhideThread(threadId: string) {
  const id = String(threadId || '').trim();
  if (!id) return;
  if (!snapshot.hiddenAt[id]) return;
  setSnapshot((prev) => {
    if (!prev.hiddenAt[id]) return prev;
    const nextHides = { ...prev.hiddenAt };
    delete nextHides[id];
    return { ...prev, hiddenAt: nextHides };
  });
  void deleteChatThreadHide(id);
}

function markAllThreadsRead() {
  const at = Date.now();
  const ids = Object.keys(snapshot.byId);
  if (ids.length === 0) return;
  const patch: ChatReads = {};
  let changed = false;
  for (const id of ids) {
    if ((snapshot.lastReadAt[id] ?? 0) >= at) continue;
    patch[id] = at;
    changed = true;
  }
  if (!changed) return;
  setSnapshot((prev) => ({
    ...prev,
    lastReadAt: { ...prev.lastReadAt, ...patch },
  }));
  void upsertChatThreadReadsBulk(patch);
}

export function clearAllChatThreads() {
  cancelPendingLogoutClear();
  for (const timer of realtimeRetryTimers.values()) {
    clearTimeout(timer);
  }
  realtimeRetryTimers.clear();
  for (const unsub of realtimeUnsubscribers.values()) {
    try {
      unsub();
    } catch {
      // ignore
    }
  }
  realtimeUnsubscribers.clear();
  realtimeWatchers.clear();
  realtimeAttachArgs.clear();
  realtimeRetryAttempts.clear();
  for (const timer of inboxRetryTimers.values()) {
    clearTimeout(timer);
  }
  inboxRetryTimers.clear();
  for (const unsub of inboxUnsubscribers.values()) {
    try {
      unsub();
    } catch {
      // ignore
    }
  }
  inboxUnsubscribers.clear();
  inboxWatchers.clear();
  inboxAttachArgs.clear();
  inboxRetryAttempts.clear();
  hydratedThreads.clear();
  hydrateGenerations.clear();
  setSnapshot((prev) => {
    const emptyThreads = Object.keys(prev.byId).length === 0;
    const emptyReads = Object.keys(prev.lastReadAt).length === 0;
    const emptyHides = Object.keys(prev.hiddenAt).length === 0;
    if (emptyThreads && emptyReads && emptyHides) return prev;
    return { byId: {}, lastReadAt: {}, hiddenAt: {} };
  }, { persistReads: false, persistHides: false });
}

export function renameMyChatIdentity(name: string, imageUri?: string) {
  setById((prev) => {
    let changed = false;
    const next: Record<string, ChatThread> = {};
    for (const [id, thread] of Object.entries(prev)) {
      let threadChanged = false;
      const messages = thread.messages.map((message) => {
        if (message.role !== 'me') return message;
        if (message.name === name && message.imageUri === imageUri) {
          return message;
        }
        threadChanged = true;
        changed = true;
        return { ...message, name, imageUri };
      });
      next[id] = threadChanged ? { ...thread, messages } : thread;
    }
    return changed ? next : prev;
  });
}

function useChatsValue(): ChatsContextValue {
  const store = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    void (async () => {
      const {
        loadFirebaseAuthUser,
        subscribeFirebaseAuth,
        waitForInitialFirebaseAuthUser,
      } = await import('@/lib/firebaseAuthSession');
      if (cancelled) return;
      // 起動直後の null 取りこぼしを避け、復元完了を待つ
      const initial =
        (await waitForInitialFirebaseAuthUser(8_000)) ??
        (await loadFirebaseAuthUser());
      if (cancelled) return;
      authUserId = initial?.id ?? null;
      await hydrateChatReadsForUser(authUserId);
      unsub = subscribeFirebaseAuth((user) => {
        const nextId = user?.id ?? null;
        const prevId = authUserId;

        if (!user) {
          // トークン更新の一瞬 null では authUserId を即消ししない（送信・購読キーを守る）
          if (prevId) {
            authFlickerPending = true;
            cancelPendingLogoutClear();
            pendingLogoutClearTimer = setTimeout(() => {
              pendingLogoutClearTimer = null;
              if (!authFlickerPending) return;
              authFlickerPending = false;
              // チャット画面ウォッチ中は履歴を落とさない（復帰 hydrate に任せる）
              if (realtimeWatchers.size > 0) {
                return;
              }
              authUserId = null;
              clearAllChatThreads();
            }, 800);
          }
          return;
        }

        const recoveredFromFlicker = authFlickerPending;
        cancelPendingLogoutClear();
        authFlickerPending = false;
        authUserId = nextId;

        if (nextId && nextId !== prevId && !recoveredFromFlicker) {
          // 別アカウントへ切替（または初回ログインで prev が null 以外の別人）
          if (prevId && prevId !== nextId) {
            clearAllChatThreads();
          }
          void hydrateChatReadsForUser(nextId);
          return;
        }

        if (nextId && recoveredFromFlicker) {
          // 同一セッションの一瞬切断から復帰 → DB から既知スレッドを再取得
          void rehydrateAllKnownThreads();
          return;
        }

        if (nextId && !prevId) {
          void hydrateChatReadsForUser(nextId);
        }
      });
    })();
    return () => {
      cancelled = true;
      cancelPendingLogoutClear();
      unsub?.();
    };
  }, []);

  const threads = useMemo(
    () =>
      Object.values(store.byId).sort((a, b) => {
        const aAt = a.messages[a.messages.length - 1]?.at ?? 0;
        const bAt = b.messages[b.messages.length - 1]?.at ?? 0;
        return bAt - aAt;
      }),
    [store.byId],
  );
  const unreadCount = useMemo(
    () => totalUnreadCount(threads, store.lastReadAt, store.hiddenAt),
    [threads, store.lastReadAt, store.hiddenAt],
  );

  return useMemo(
    () => ({
      threads,
      lastReadAt: store.lastReadAt,
      hiddenAt: store.hiddenAt,
      unreadCount,
      ensureThread,
      getMessages: (
        eventId: string,
        mode: EventChatMode,
        dmUserId?: string | null,
      ) => {
        const room = parseChatMode(mode);
        const exactId = chatThreadId(eventId, room, dmUserId);
        const exact = store.byId[exactId]?.messages;
        if (exact) return exact;
        // host DM で相手指定があるときは、dm 無しスレッドへフォールバックしない
        if (room === 'host' && dmUserId?.trim()) return [];
        return store.byId[chatThreadId(eventId, room)]?.messages ?? [];
      },
      sendMessage,
      deleteMessage,
      markThreadRead,
      markAllThreadsRead,
      hideThread,
      unhideThread,
      watchThread,
      watchInboxForEvents,
      refreshThread,
      syncChatsForEvents,
    }),
    [threads, store, unreadCount],
  );
}

export function ChatsProvider({ children }: { children: ReactNode }) {
  const value = useChatsValue();
  return (
    <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>
  );
}

export function useChats(): ChatsContextValue {
  const ctx = useContext(ChatsContext);
  if (!ctx) {
    throw new Error('useChats must be used within ChatsProvider');
  }
  return ctx;
}

export { dmUserIdFromThreadId, syncChatsForEvents };
