import {
  isEventCancelled,
  isEventPast,
  type SportEvent,
} from '@/lib/events';

/** seed_mock_qa.sql で投入するモックの目印 */
export const QA_EVENT_TITLE_PREFIX = '[QA]';
export const QA_HOST_ID_PREFIX = 'mock_qa_';

export function isQaMockEvent(
  event: Pick<SportEvent, 'title' | 'hostId'> | null | undefined,
): boolean {
  if (!event) return false;
  const title = String(event.title || '');
  const hostId = String(event.hostId || '');
  return (
    title.startsWith(QA_EVENT_TITLE_PREFIX) ||
    hostId.startsWith(QA_HOST_ID_PREFIX)
  );
}

export function isQaMockClubId(clubId: string | null | undefined): boolean {
  const id = String(clubId || '').trim();
  return id.startsWith(QA_HOST_ID_PREFIX);
}

/**
 * エリア絞り込み結果に、条件を満たす QA モックだけを足す（開催中・未来のみ）。
 * `allow` を渡さないと地理条件を無視して全 QA を戻すため、呼び出し側で必ず渡すこと。
 * （都道府県選択時に東京の QA が混ざる不具合の再発防止）
 */
export function mergeQaMockEvents(
  filtered: SportEvent[],
  all: SportEvent[],
  now = new Date(),
  allow?: (event: SportEvent) => boolean,
): SportEvent[] {
  const byId = new Map(filtered.map((event) => [event.id, event]));
  for (const event of all) {
    if (!isQaMockEvent(event)) continue;
    if (isEventCancelled(event) || isEventPast(event, now)) continue;
    if (allow && !allow(event)) continue;
    if (!byId.has(event.id)) byId.set(event.id, event);
  }
  return [...byId.values()];
}
