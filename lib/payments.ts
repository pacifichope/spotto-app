import type { SportEvent } from '@/lib/events';
import { shouldAutoRefundOnCancel } from '@/lib/events';

export function eventPriceYen(
  event: Pick<SportEvent, 'priceYen'> | null | undefined,
) {
  const yen = Math.floor(Number(event?.priceYen) || 0);
  return yen > 0 ? yen : 0;
}

export function isPaidEvent(
  event: Pick<SportEvent, 'priceYen'> | null | undefined,
) {
  return eventPriceYen(event) > 0;
}

export function formatYenAmount(yen: number) {
  return `${Math.max(0, Math.floor(yen)).toLocaleString('ja-JP')}円`;
}

/** 詳細フッター用: Join (¥1,200) */
export function paidJoinButtonLabel(yen: number) {
  const amount = Math.max(0, Math.floor(yen));
  if (amount <= 0) return 'Join';
  return `Join (¥${amount.toLocaleString('ja-JP')})`;
}

/** 無料参加の詳細フッター用 */
export function freeJoinButtonLabel() {
  return 'Join';
}

/** キャンセルポリシー期限内なら支払額全額、期限外・返金不可なら 0 */
export function refundAmountYen(
  event: Pick<
    SportEvent,
    'date' | 'time' | 'sessions' | 'cancelPolicy' | 'priceYen'
  >,
  paidYen: number,
  now = new Date(),
) {
  if (!shouldAutoRefundOnCancel(event, now)) return 0;
  return Math.max(0, Math.floor(Number(paidYen) || 0));
}

