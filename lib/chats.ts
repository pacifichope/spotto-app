import { hostUserIdFromName, seedAttendees } from '@/lib/attendees';
import type { SportEvent } from '@/lib/events';

export type EventChatMode = 'group' | 'host';

export function parseChatMode(value: unknown): EventChatMode {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'host' ? 'host' : 'group';
}

export type ChatRole = 'me' | 'host' | 'member';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  name: string;
  text: string;
  time: string;
  at: number;
  /** 自動挨拶など。一覧には出さない */
  seeded?: boolean;
  imageUri?: string;
  senderId?: string;
};

export type ChatThread = {
  id: string;
  eventId: string;
  mode: EventChatMode;
  messages: ChatMessage[];
  /** 再 hydrate 用（アプリ再起動後も remote fetch に必要） */
  hostUserId?: string | null;
  dmUserId?: string | null;
};

export function chatThreadId(
  eventId: string,
  mode: EventChatMode,
  dmUserId?: string | null,
) {
  const room = parseChatMode(mode);
  if (room === 'host' && dmUserId?.trim()) {
    return `${eventId}:host:${dmUserId.trim()}`;
  }
  return `${eventId}:${room}`;
}

/** thread id から host DM の相手ユーザー ID を取り出す */
export function dmUserIdFromThreadId(threadId: string): string | null {
  const parts = threadId.split(':');
  if (parts.length >= 3 && parts[1] === 'host') {
    return parts.slice(2).join(':') || null;
  }
  return null;
}

export function formatChatClock(at = Date.now()) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * チャット吹き出し用の時刻表示。
 * - 当日: "14:30"
 * - 別日（同年）: "03/15 14:30"
 * - 別年: "2025/03/15 14:30"
 */
export function formatChatBubbleTime(at: number, now = Date.now()) {
  if (!at || !Number.isFinite(at)) return '';
  const date = new Date(at);
  const clock = formatChatClock(at);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (at >= startOfToday.getTime()) return clock;

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  if (year !== new Date(now).getFullYear()) {
    return `${year}/${month}/${day} ${clock}`;
  }
  return `${month}/${day} ${clock}`;
}

function seedMessage(
  id: string,
  role: ChatRole,
  name: string,
  text: string,
  minutesAgo: number,
  senderId?: string,
): ChatMessage {
  const at = Date.now() - minutesAgo * 60_000;
  return {
    id,
    role,
    name,
    text,
    time: formatChatClock(at),
    at,
    seeded: true,
    senderId,
  };
}

function seedMemberForEvent(event: SportEvent) {
  const member = seedAttendees(event).find(
    (person) => !person.id.startsWith('host:'),
  );
  return member ?? { id: 'mika', name: 'Mika' };
}

export function seedGroupMessages(event: SportEvent): ChatMessage[] {
  const hostId = hostUserIdFromName(event.host);
  const member = seedMemberForEvent(event);
  return [
    seedMessage(
      'seed-1',
      'host',
      event.host,
      `こんにちは！主催の${event.host}です。このチャットは参加者限定です。集合や持ち物など、気軽に聞いてください。`,
      48,
      hostId,
    ),
    seedMessage(
      'seed-2',
      'member',
      member.name,
      'はじめまして！初心者でも大丈夫でしょうか？',
      36,
      member.id,
    ),
    seedMessage(
      'seed-3',
      'host',
      event.host,
      'もちろんです。当日はゆるめに進めますので、気軽に来てください！',
      22,
      hostId,
    ),
  ];
}

export function seedHostMessages(event: SportEvent): ChatMessage[] {
  return [
    seedMessage(
      'host-1',
      'host',
      event.host,
      `こんにちは、主催の${event.host}です。参加前の質問もこちらへどうぞ。他の参加者には見えません。`,
      18,
      hostUserIdFromName(event.host),
    ),
  ];
}

export function lastMessage(thread: ChatThread) {
  return thread.messages[thread.messages.length - 1];
}

export function isSeededMessage(message: ChatMessage) {
  return (
    message.seeded === true ||
    message.id.startsWith('seed-') ||
    message.id.startsWith('host-')
  );
}

export function lastSentMessage(thread: ChatThread) {
  for (let i = thread.messages.length - 1; i >= 0; i -= 1) {
    const item = thread.messages[i];
    if (!isSeededMessage(item)) return item;
  }
  return undefined;
}

export function threadHasSentMessages(thread: ChatThread) {
  return thread.messages.some((item) => !isSeededMessage(item));
}

export function isIncomingChatMessage(message: ChatMessage) {
  if (isSeededMessage(message)) return false;
  return message.role !== 'me' && message.senderId !== 'me';
}

export function threadUnreadCount(
  thread: ChatThread,
  lastReadAt: number | undefined,
) {
  const cutoff = lastReadAt ?? 0;
  let count = 0;
  for (const message of thread.messages) {
    if (!isIncomingChatMessage(message)) continue;
    if (message.at > cutoff) count += 1;
  }
  return count;
}

export function totalUnreadCount(
  threads: ChatThread[],
  lastReadAt: Record<string, number>,
  hiddenAt?: Record<string, number>,
) {
  return threads.reduce((sum, thread) => {
    if (isThreadHiddenFromList(thread, hiddenAt?.[thread.id])) return sum;
    return sum + threadUnreadCount(thread, lastReadAt[thread.id]);
  }, 0);
}

/**
 * 自分だけ一覧から非表示にしたスレッドか。
 * hidden_at 以降に実メッセージがあれば再表示（他端末の新着を取りこぼさない）。
 */
export function isThreadHiddenFromList(
  thread: ChatThread,
  hiddenAtMs: number | undefined,
) {
  const hiddenAt = Number(hiddenAtMs) || 0;
  if (hiddenAt <= 0) return false;
  const last = lastSentMessage(thread);
  if (!last) return true;
  return last.at <= hiddenAt;
}

/** イベント詳細の Group / Chat ボタン用 */
export function unreadCountForEventMode(
  threads: ChatThread[],
  lastReadAt: Record<string, number>,
  eventId: string,
  mode: EventChatMode,
) {
  const room = parseChatMode(mode);
  return threads.reduce((sum, thread) => {
    if (thread.eventId !== eventId || thread.mode !== room) return sum;
    return sum + threadUnreadCount(thread, lastReadAt[thread.id]);
  }, 0);
}

export function formatUnreadBadge(count: number): number | string | undefined {
  if (count <= 0) return undefined;
  if (count > 99) return '99+';
  return count;
}

export function threadLastActivityAt(thread: ChatThread) {
  return thread.messages[thread.messages.length - 1]?.at ?? 0;
}

export function previewTextForMessage(message: ChatMessage | undefined) {
  if (!message) return '';
  const text = message.text.trim();
  if (message.imageUri && !text) return '写真';
  return text;
}

export function formatChatListTime(at: number, now = Date.now()) {
  if (!at) return '';
  const date = new Date(at);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();
  if (at >= todayStart) return formatChatClock(at);
  if (at >= todayStart - 86_400_000) return '昨日';
  if (at >= todayStart - 6 * 86_400_000) {
    return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()] ?? '';
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
