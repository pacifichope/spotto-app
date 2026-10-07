import { createAuthedSupabase } from '@/lib/supabase';
import { eventColumns, mapEventRow, type EventRow, type PublicEvent } from '@/lib/types';

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
  sender_image_uri: string | null;
  body: string;
  created_at: string;
};

const READS_KEY = 'spotto_web_chat_reads_v1';

function threadId(eventId: string, mode: ChatMode, dmUserId?: string | null) {
  if (mode === 'host' && dmUserId?.trim()) {
    return `${eventId}:host:${dmUserId.trim()}`;
  }
  return `${eventId}:group`;
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

export function formatBubbleTime(at: number) {
  return formatChatListTime(at);
}

function loadReads(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(READS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveReads(next: Record<string, number>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(READS_KEY, JSON.stringify(next));
}

export function markThreadRead(threadKey: string, at = Date.now()) {
  const reads = loadReads();
  reads[threadKey] = Math.max(reads[threadKey] || 0, at);
  saveReads(reads);
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
    senderImageUri: row.sender_image_uri,
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
      .eq('user_id', input.userId),
    supabase
      .from('events')
      .select(eventColumns())
      .eq('host_id', input.userId)
      .is('cancelled_at', null),
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

  const eventIds = [...new Set([...joinedIds, ...hostedEvents.map((e) => e.id)])];
  const eventsById = new Map<string, PublicEvent>();
  for (const event of hostedEvents) eventsById.set(event.id, event);

  const missing = joinedIds.filter((id) => !eventsById.has(id));
  if (missing.length > 0) {
    const { data, error } = await supabase
      .from('events')
      .select(eventColumns())
      .in('id', missing)
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
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .in('event_id', eventIds)
    .order('created_at', { ascending: false })
    .limit(800);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ChatMessageRow[];
  const reads = loadReads();
  const byThread = new Map<
    string,
    { messages: WebChatMessage[]; event: PublicEvent; mode: ChatMode; dm: string | null }
  >();

  for (const row of rows) {
    const event = eventsById.get(row.event_id);
    if (!event) continue;
    const mode = parseChatMode(row.mode);
    const dm = mode === 'host' ? row.dm_user_id : null;
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
    const cutoff = reads[key] || 0;
    const unread = sorted.filter((m) => !m.mine && m.at > cutoff).length;
    threads.push({
      threadId: key,
      eventId: bucket.event.id,
      mode: bucket.mode,
      dmUserId: bucket.dm,
      eventTitle: bucket.event.title,
      eventSport: bucket.event.sport,
      eventImageUri: bucket.event.imageUri,
      preview: last.body.trim() || 'メッセージ',
      lastAt: last.at,
      unread,
    });
  }

  threads.sort((a, b) => b.lastAt - a.lastAt);
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

  let dm = input.dmUserId?.trim() || null;
  if (input.mode === 'host' && !dm) {
    // 参加者側: 相手は主催者。主催者側は ?dm= 必須
    if (event?.hostId && event.hostId !== input.userId) {
      dm = event.hostId;
    }
  }
  if (input.mode === 'host' && !dm) {
    throw new Error('主催者チャットの相手が指定されていません');
  }

  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('event_id', eventId)
    .eq('mode', input.mode)
    .order('created_at', { ascending: true })
    .limit(300);
  if (input.mode === 'host') {
    query = query.eq('dm_user_id', dm);
  } else {
    query = query.is('dm_user_id', null);
  }

  const msgQuery = await query;
  if (msgQuery.error) throw new Error(msgQuery.error.message);

  const messages = ((msgQuery.data ?? []) as ChatMessageRow[]).map((row) =>
    rowToMessage(row, input.userId),
  );

  const key = threadId(eventId, input.mode, dm);
  const lastAt = messages[messages.length - 1]?.at ?? Date.now();
  markThreadRead(key, lastAt);

  return { event, messages, dmUserId: dm };
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
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || '送信に失敗しました');

  const message = rowToMessage(data as ChatMessageRow, input.userId);
  markThreadRead(threadId(input.eventId, mode, dmUserId), message.at);
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
