import type { Href } from 'expo-router';

import { parseChatMode, type EventChatMode } from '@/lib/chats';

/** チャット画面へのパス。chatMode は URL の一部。host DM は ?dm= で相手を渡す。 */
export function chatRoomHref(
  eventId: string,
  chatMode?: EventChatMode | null,
  dmUserId?: string | null,
): Href {
  const mode = parseChatMode(chatMode);
  const dm = dmUserId?.trim();
  if (mode === 'host' && dm) {
    return `/chat/${eventId}/${mode}?dm=${encodeURIComponent(dm)}` as Href;
  }
  return `/chat/${eventId}/${mode}` as Href;
}

/** イベント詳細へのパス。チャットヘッダーなどから遷移する。 */
export function eventDetailHref(eventId: string): Href {
  return `/event/${eventId}` as Href;
}
