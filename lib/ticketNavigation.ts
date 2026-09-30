/** 参加チケット（予約詳細）画面へのパス */
export function ticketHref(eventId: string) {
  const id = String(eventId || '').trim();
  return id ? `/ticket/${encodeURIComponent(id)}` : '/(tabs)/mypage';
}
