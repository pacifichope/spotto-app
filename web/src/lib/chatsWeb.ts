import { createAuthedSupabase } from '@/lib/supabase';
import {
  eventColumns,
  eventInboxColumns,
  mapEventRow,
  type EventRow,
  type PublicEvent,
} from '@/lib/types';
import {
  chatRoomCacheKey,
  inboxCacheKey,
  isQueryCacheFresh,
  peekQueryCache,
  QUERY_STALE_MS,
  setQueryCache,
} from '@/lib/queryCache';

/** ナビ hover などから呼ぶ。新鮮なら何もしない */
export function prefetchInboxThreads(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): void {
  const key = inboxCacheKey(input.userId);
  if (isQueryCacheFresh(key)) return;
  void fetchInboxThreads(input).catch(() => {
    /* prefetch 失敗は無視 */
  });
}

/** インボックス用メッセージ（画像カラムは不要） */
const CHAT_INBOX_COLUMNS =
  'id, event_id, mode, dm_user_id, sender_id, sender_name, body, created_at';

/** ルーム表示用 */
const CHAT_ROOM_COLUMNS =
  'id, event_id, mode, dm_user_id, sender_id, sender_name, sender_image_uri, body, created_at';

const INBOX_MESSAGE_LIMIT = 240;
const ROOM_MESSAGE_LIMIT = 120;
const ACCESSIBLE_EVENTS_LIMIT = 200;

export type ChatMode = 'group' | 'host';

export type WebChatMessage = {
  id: string;
  eventId: string;
  mode: ChatMode;
  dmUserId: string | null;
  senderId: string;
  senderName: string;
  senderImageUri: string | null;
  body: string;
  at: number;
  mine: boolean;
};

export type InboxThread = {
  threadId: string;
  eventId: string;
  mode: ChatMode;
  dmUserId: string | null;
  /** イベント主催者 ID（ブロックフィルタ用） */
  hostId: string;
  eventTitle: string;
  eventSport: string;
  eventImageUri: string | null;
  preview: string;
  lastAt: number;
  unread: number;
};

type ChatMessageRow = {
  id: string;
  event_id: string;
  mode: string;
  dm_user_id: string | null;
  sender_id: string;
  sender_name: string;
  sender_image_uri?: string | null;
  body: string;
  created_at: string;
};

const READS_KEY = 'spotto_web_chat_reads_v1';
const HIDES_KEY = 'spotto_web_chat_hides_v1';

/** threadId → hidden_at（ms） */
type ChatHides = Record<string, number>;

function threadId(eventId: string, mode: ChatMode, dmUserId?: string | null) {
  if (mode === 'host' && dmUserId?.trim()) {
    return `${eventId}:host:${dmUserId.trim()}`;
  }
  return `${eventId}:group`;
}

/**
 * host DM の thread_id は常に「参加者 UID」を末尾に置く（DB の dm_user_id と同じ）。
 * 参加者側で誤って hostId を渡した場合も正規化する。
 */
export function canonicalHostDmUserId(input: {
  userId: string;
  hostId?: string | null;
  dmUserId?: string | null;
}): string | null {
  const userId = input.userId.trim();
  const hostId = input.hostId?.trim() || '';
  let dm = input.dmUserId?.trim() || null;
  if (dm && hostId && dm === hostId && userId && userId !== hostId) {
    dm = userId;
  }
  if (!dm && hostId && userId && userId !== hostId) {
    dm = userId;
  }
  return dm;
}

export function canonicalThreadId(input: {
  eventId: string;
  mode: ChatMode;
  userId: string;
  hostId?: string | null;
  dmUserId?: string | null;
}) {
  if (input.mode !== 'host') {
    return threadId(input.eventId, 'group');
  }
  const dm = canonicalHostDmUserId(input);
  return threadId(input.eventId, 'host', dm);
}

function loadLocalHides(): ChatHides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(HIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const next: ChatHides = {};
    for (const [id, value] of Object.entries(parsed)) {
      const key = id.trim();
      const at = typeof value === 'number' ? value : Number(value);
      if (!key || !Number.isFinite(at) || at <= 0) continue;
      next[key] = at;
    }
    return next;
  } catch {
    return {};
  }
}

function saveLocalHides(hides: ChatHides) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HIDES_KEY, JSON.stringify(hides));
}

function mergeHides(local: ChatHides, remote: ChatHides): ChatHides {
  const next: ChatHides = { ...local };
  for (const [id, at] of Object.entries(remote)) {
    const key = id.trim();
    if (!key || !(at > 0)) continue;
    next[key] = Math.max(next[key] ?? 0, at);
  }
  return next;
}

/** 自分の一覧から隠す（メッセージ本体は残す）。hidden_at 以降の新着があれば再表示 */
function isThreadHiddenFromList(lastAt: number, hiddenAtMs: number | undefined) {
  const hiddenAt = Number(hiddenAtMs) || 0;
  if (hiddenAt <= 0) return false;
  if (!lastAt) return true;
  return lastAt <= hiddenAt;
}

async function fetchRemoteHides(
  getIdToken: () => Promise<string | null>,
  userId: string,
): Promise<ChatHides> {
  const supabase = createAuthedSupabase(getIdToken);
  const { data, error } = await supabase
    .from('chat_thread_hides')
    .select('thread_id, hidden_at')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);

  const next: ChatHides = {};
  for (const row of data ?? []) {
    const id = String((row as { thread_id?: string }).thread_id || '').trim();
    const iso = String((row as { hidden_at?: string }).hidden_at || '');
    const at = Date.parse(iso);
    if (!id || !Number.isFinite(at) || at <= 0) continue;
    next[id] = at;
  }
  return next;
}

/** チャットを自分の一覧から削除（非表示）。他ユーザーの履歴は消えない */
export async function hideInboxThread(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
  threadId: string;
  lastAt?: number;
}): Promise<void> {
  const id = input.threadId.trim();
  if (!id) throw new Error('チャットが指定されていません');

  const at = Math.max(Date.now(), Math.floor(Number(input.lastAt) || 0));
  const local = loadLocalHides();
  local[id] = Math.max(local[id] ?? 0, at);
  saveLocalHides(local);

  const supabase = createAuthedSupabase(input.getIdToken);
  const iso = new Date(at).toISOString();
  const { error } = await supabase.from('chat_thread_hides').upsert(
    {
      user_id: input.userId,
      thread_id: id,
      hidden_at: iso,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,thread_id' },
  );
  if (error) throw new Error(error.message);
}

export function parseChatMode(value: string | null | undefined): ChatMode {
  return value === 'host' ? 'host' : 'group';
}

function formatClock(at: number) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatChatListTime(at: number, now = Date.now()) {
  if (!at) return '';
  const date = new Date(at);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();
  if (at >= todayStart) return formatClock(at);
  if (at >= todayStart - 86_400_000) return '昨日';
  if (at >= todayStart - 6 * 86_400_000) {
    return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()] ?? '';
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 吹き出し横の時刻。
 * - 当日: "14:30"
 * - 別日（同年）: "9/23 14:30"
 * - 別年: "2025/9/23 14:30"
 */
export function formatBubbleTime(at: number, now = Date.now()) {
  if (!at || !Number.isFinite(at)) return '';
  const date = new Date(at);
  const clock = formatClock(at);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (at >= startOfToday.getTime()) return clock;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  if (year !== new Date(now).getFullYear()) {
    return `${year}/${month}/${day} ${clock}`;
  }
  return `${month}/${day} ${clock}`;
}

type ChatReads = Record<string, number>;

function loadReads(): ChatReads {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(READS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const next: ChatReads = {};
    for (const [id, value] of Object.entries(parsed)) {
      const key = id.trim();
      const at = typeof value === 'number' ? value : Number(value);
      if (!key || !Number.isFinite(at) || at <= 0) continue;
      next[key] = at;
    }
    return next;
  } catch {
    return {};
  }
}

function saveReads(next: ChatReads) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(READS_KEY, JSON.stringify(next));
}

function mergeReads(local: ChatReads, remote: ChatReads): ChatReads {
  const next: ChatReads = { ...local };
  for (const [id, at] of Object.entries(remote)) {
    const key = id.trim();
    if (!key || !(at > 0)) continue;
    next[key] = Math.max(next[key] ?? 0, at);
  }
  return next;
}

async function fetchRemoteReads(
  getIdToken: () => Promise<string | null>,
  userId: string,
): Promise<ChatReads> {
  const supabase = createAuthedSupabase(getIdToken);
  const { data, error } = await supabase
    .from('chat_thread_reads')
    .select('thread_id, last_read_at')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  const next: ChatReads = {};
  for (const row of data ?? []) {
    const id = String((row as { thread_id?: string }).thread_id || '').trim();
    const iso = String((row as { last_read_at?: string }).last_read_at || '');
    const at = Date.parse(iso);
    if (!id || !Number.isFinite(at) || at <= 0) continue;
    next[id] = at;
  }
  return next;
}

async function upsertRemoteRead(
  getIdToken: () => Promise<string | null>,
  userId: string,
  threadKey: string,
  atMs: number,
) {
  const id = threadKey.trim();
  const at = Math.floor(atMs);
  if (!id || at <= 0) return;
  const supabase = createAuthedSupabase(getIdToken);
  const iso = new Date(at).toISOString();
  const { error } = await supabase.from('chat_thread_reads').upsert(
    {
      user_id: userId,
      thread_id: id,
      last_read_at: iso,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,thread_id' },
  );
  if (error) throw new Error(error.message);
}

/** キャッシュ済みインボックスの未読数をローカル既読に合わせて補正 */
export function applyReadsToInboxThreads(
  threads: InboxThread[],
  reads: ChatReads = loadReads(),
): InboxThread[] {
  return threads.map((thread) => {
    const cutoff = reads[thread.threadId] ?? 0;
    if (cutoff >= thread.lastAt && thread.unread !== 0) {
      return { ...thread, unread: 0 };
    }
    return thread;
  });
}

function patchInboxCacheUnread(userId: string, threadKey: string, atMs: number) {
  const key = inboxCacheKey(userId);
  const cached = peekQueryCache<InboxThread[]>(key, QUERY_STALE_MS);
  if (!cached) return;
  const next = cached.map((thread) => {
    if (thread.threadId !== threadKey) return thread;
    if (atMs >= thread.lastAt) {
      return thread.unread === 0 ? thread : { ...thread, unread: 0 };
    }
    return thread;
  });
  setQueryCache(key, next);
}

/**
 * スレッドを既読にする（localStorage + インボックスキャッシュ + Supabase）。
 */
export function markThreadRead(
  threadKey: string,
  at = Date.now(),
  options?: {
    userId?: string;
    getIdToken?: () => Promise<string | null>;
  },
) {
  const id = threadKey.trim();
  if (!id) return;
  const atMs = Math.max(0, Math.floor(at));
  const reads = loadReads();
  reads[id] = Math.max(reads[id] || 0, atMs);
  saveReads(reads);

  const userId = options?.userId?.trim();
  if (userId) {
    patchInboxCacheUnread(userId, id, reads[id]!);
  }

  if (userId && options?.getIdToken) {
    void upsertRemoteRead(options.getIdToken, userId, id, reads[id]!).catch(
      () => {
        /* 既読同期失敗はローカルを優先 */
      },
    );
  }
}

function rowToMessage(row: ChatMessageRow, currentUserId: string): WebChatMessage {
  const at = new Date(row.created_at).getTime();
  return {
    id: row.id,
    eventId: row.event_id,
    mode: parseChatMode(row.mode),
    dmUserId: row.dm_user_id,
    senderId: row.sender_id,
    senderName: row.sender_name || '参加者',
    senderImageUri: row.sender_image_uri ?? null,
    body: row.body || '',
    at: Number.isFinite(at) ? at : Date.now(),
    mine: row.sender_id === currentUserId,
  };
}

async function accessibleEventIds(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<{ eventIds: string[]; eventsById: Map<string, PublicEvent> }> {
  const supabase = createAuthedSupabase(input.getIdToken);
  const [joinedRes, hostedRes] = await Promise.all([
    supabase
      .from('event_participants')
      .select('event_id, status')
      .eq('user_id', input.userId)
      .limit(ACCESSIBLE_EVENTS_LIMIT),
    supabase
      .from('events')
      .select(eventInboxColumns())
      .eq('host_id', input.userId)
      .is('cancelled_at', null)
      .order('event_date', { ascending: false })
      .limit(120),
  ]);
  if (joinedRes.error) throw new Error(joinedRes.error.message);
  if (hostedRes.error) throw new Error(hostedRes.error.message);

  const joinedIds = (joinedRes.data ?? [])
    .filter((row) => {
      const status = String((row as { status?: string }).status ?? '').toLowerCase();
      return !status || status === 'joined' || status === 'confirmed';
    })
    .map((row) => String((row as { event_id?: string }).event_id ?? '').trim())
    .filter(Boolean);

  const hostedRows = (hostedRes.data ?? []) as unknown as EventRow[];
  const hostedEvents = hostedRows.flatMap((row) => {
    const event = mapEventRow(row);
    return event ? [event] : [];
  });

  const eventIds = [...new Set([...joinedIds, ...hostedEvents.map((e) => e.id)])].slice(
    0,
    ACCESSIBLE_EVENTS_LIMIT,
  );
  const eventsById = new Map<string, PublicEvent>();
  for (const event of hostedEvents) eventsById.set(event.id, event);

  const missing = joinedIds.filter((id) => !eventsById.has(id));
  // .in() はチャンクして負荷を抑える
  const chunkSize = 80;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('events')
      .select(eventInboxColumns())
      .in('id', chunk)
      .is('cancelled_at', null);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as EventRow[]) {
      const event = mapEventRow(row);
      if (event) eventsById.set(event.id, event);
    }
  }

  return { eventIds, eventsById };
}

export async function fetchInboxThreads(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<InboxThread[]> {
  const { eventIds, eventsById } = await accessibleEventIds(input);
  if (eventIds.length === 0) return [];

  const supabase = createAuthedSupabase(input.getIdToken);
  // event_id の .in() が大きいと重いのでチャンクして最新順をマージ
  const eventChunks: string[][] = [];
  for (let i = 0; i < eventIds.length; i += 60) {
    eventChunks.push(eventIds.slice(i, i + 60));
  }
  const perChunkLimit = Math.max(
    40,
    Math.ceil(INBOX_MESSAGE_LIMIT / Math.max(1, eventChunks.length)),
  );

  const [messageChunks, remoteHides, remoteReads] = await Promise.all([
    Promise.all(
      eventChunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from('chat_messages')
          .select(CHAT_INBOX_COLUMNS)
          .in('event_id', chunk)
          .order('created_at', { ascending: false })
          .limit(perChunkLimit);
        if (error) throw new Error(error.message);
        return (data ?? []) as ChatMessageRow[];
      }),
    ),
    fetchRemoteHides(input.getIdToken, input.userId).catch(() => ({}) as ChatHides),
    fetchRemoteReads(input.getIdToken, input.userId).catch(() => ({}) as ChatReads),
  ]);
  const messagesRes = {
    data: messageChunks
      .flat()
      .sort(
        (a, b) =>
          Date.parse(b.created_at) - Date.parse(a.created_at),
      )
      .slice(0, INBOX_MESSAGE_LIMIT),
    error: null as null,
  };

  const hides = mergeHides(loadLocalHides(), remoteHides);
  saveLocalHides(hides);
  const reads = mergeReads(loadReads(), remoteReads);
  saveReads(reads);

  const rows = (messagesRes.data ?? []) as ChatMessageRow[];
  const byThread = new Map<
    string,
    { messages: WebChatMessage[]; event: PublicEvent; mode: ChatMode; dm: string | null }
  >();

  for (const row of rows) {
    const event = eventsById.get(row.event_id);
    if (!event) continue;
    const mode = parseChatMode(row.mode);
    const dm =
      mode === 'host'
        ? canonicalHostDmUserId({
            userId: input.userId,
            hostId: event.hostId,
            dmUserId: row.dm_user_id,
          })
        : null;
    // host DM: 自分関連のみ（相手 or 主催）
    if (mode === 'host') {
      const related =
        dm === input.userId ||
        row.sender_id === input.userId ||
        event.hostId === input.userId;
      if (!related) continue;
    }
    const key = threadId(row.event_id, mode, dm);
    const message = rowToMessage(row, input.userId);
    const bucket = byThread.get(key);
    if (!bucket) {
      byThread.set(key, {
        messages: [message],
        event,
        mode,
        dm,
      });
    } else if (bucket.messages.length < 40) {
      bucket.messages.push(message);
    }
  }

  const threads: InboxThread[] = [];
  for (const [key, bucket] of byThread) {
    const sorted = [...bucket.messages].sort((a, b) => a.at - b.at);
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    if (isThreadHiddenFromList(last.at, hides[key])) continue;
    const cutoff = reads[key] || 0;
    const unread = sorted.filter((m) => !m.mine && m.at > cutoff).length;
    threads.push({
      threadId: key,
      eventId: bucket.event.id,
      mode: bucket.mode,
      dmUserId: bucket.dm,
      hostId: bucket.event.hostId,
      eventTitle: bucket.event.title,
      eventSport: bucket.event.sport,
      eventImageUri: bucket.event.imageUri,
      preview: last.body.trim() || 'メッセージ',
      lastAt: last.at,
      unread,
    });
  }

  threads.sort((a, b) => b.lastAt - a.lastAt);
  setQueryCache(inboxCacheKey(input.userId), threads);
  return threads;
}

export async function fetchRoomMessages(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
  eventId: string;
  mode: ChatMode;
  dmUserId?: string | null;
}): Promise<{ event: PublicEvent | null; messages: WebChatMessage[]; dmUserId: string | null }> {
  const supabase = createAuthedSupabase(input.getIdToken);
  const eventId = input.eventId.trim();

  const { data: eventRow, error: eventError } = await supabase
    .from('events')
    .select(eventColumns())
    .eq('id', eventId)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message);
  const event = eventRow
    ? mapEventRow(eventRow as unknown as EventRow)
    : null;

  // クエリ用: 参加者は自分の UID、主催者は ?dm=参加者。表示上の「相手」は別途 UI 側。
  let queryDm = input.dmUserId?.trim() || null;
  if (input.mode === 'host') {
    queryDm = canonicalHostDmUserId({
      userId: input.userId,
      hostId: event?.hostId,
      dmUserId: queryDm,
    });
  }
  if (input.mode === 'host' && !queryDm) {
    throw new Error('主催者チャットの相手が指定されていません');
  }

  let query = supabase
    .from('chat_messages')
    .select(CHAT_ROOM_COLUMNS)
    .eq('event_id', eventId)
    .eq('mode', input.mode)
    .order('created_at', { ascending: false })
    .limit(ROOM_MESSAGE_LIMIT);
  if (input.mode === 'host') {
    query = query.eq('dm_user_id', queryDm);
  } else {
    query = query.is('dm_user_id', null);
  }

  const msgQuery = await query;
  if (msgQuery.error) throw new Error(msgQuery.error.message);

  // 新しい順で取って表示用に古い→新しいへ
  const messages = ((msgQuery.data ?? []) as ChatMessageRow[])
    .map((row) => rowToMessage(row, input.userId))
    .reverse();

  const key = canonicalThreadId({
    eventId,
    mode: input.mode,
    userId: input.userId,
    hostId: event?.hostId,
    dmUserId: queryDm,
  });
  const lastAt = messages[messages.length - 1]?.at ?? Date.now();
  markThreadRead(key, lastAt, {
    userId: input.userId,
    getIdToken: input.getIdToken,
  });

  const result = { event, messages, dmUserId: queryDm };
  setQueryCache(
    chatRoomCacheKey(eventId, input.mode, input.dmUserId ?? queryDm),
    result,
  );
  return result;
}

export async function sendRoomMessage(input: {
  userId: string;
  displayName: string;
  photoURL?: string | null;
  getIdToken: () => Promise<string | null>;
  eventId: string;
  mode: ChatMode;
  dmUserId?: string | null;
  body: string;
  hostUserId?: string | null;
}): Promise<WebChatMessage> {
  const body = input.body.trim();
  if (!body) throw new Error('メッセージを入力してください');

  const mode = input.mode;
  const dmUserId =
    mode === 'host'
      ? input.dmUserId?.trim() ||
        (input.hostUserId && input.hostUserId !== input.userId
          ? input.hostUserId
          : null)
      : null;
  if (mode === 'host' && !dmUserId) {
    throw new Error('主催者チャットの相手が不明です');
  }

  const supabase = createAuthedSupabase(input.getIdToken);
  const payload = {
    event_id: input.eventId.trim(),
    mode,
    dm_user_id: dmUserId,
    sender_id: input.userId,
    sender_name: input.displayName.trim() || 'ユーザー',
    sender_image_uri: input.photoURL?.trim() || null,
    body,
  };
  const { data, error } = await supabase
    .from('chat_messages')
    .insert(payload)
    .select(CHAT_ROOM_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message || '送信に失敗しました');

  const message = rowToMessage(data as ChatMessageRow, input.userId);
  const key = canonicalThreadId({
    eventId: input.eventId,
    mode,
    userId: input.userId,
    hostId: input.hostUserId,
    dmUserId,
  });
  markThreadRead(key, message.at, {
    userId: input.userId,
    getIdToken: input.getIdToken,
  });
  return message;
}

export function chatHref(
  eventId: string,
  mode: ChatMode = 'group',
  dmUserId?: string | null,
) {
  if (mode === 'host' && dmUserId?.trim()) {
    return `/chat/${eventId}/host?dm=${encodeURIComponent(dmUserId.trim())}`;
  }
  return `/chat/${eventId}/group`;
}
