import { isHttpUrl, publicApiUrl } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/safeAsync';

export type NotifyKind =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'event_reminder'
  | 'event_cancelled_by_host';

export type BookingNotifyPayload = {
  kind: NotifyKind;
  toEmail?: string;
  toName?: string;
  eventId: string;
  eventTitle: string;
  location?: string;
  scheduleLabel?: string;
  startsAt?: string;
  amountYen?: number;
  refundYen?: number;
  paymentIntentId?: string;
  hostCancelled?: boolean;
};

export function notifyApiUrl() {
  return publicApiUrl('/notify', 'EXPO_PUBLIC_NOTIFY_API_URL');
}

export function isNotifyConfigured() {
  const url = notifyApiUrl();
  return Boolean(url && isHttpUrl(url));
}

/**
 * 予約完了・キャンセルなどのトランザクションメールをサーバー経由で送る。
 * 未設定・失敗でも参加フローは止めない。
 */
export async function notifyBookingEvent(
  payload: BookingNotifyPayload,
): Promise<{ ok: boolean; skipped?: boolean }> {
  const url = notifyApiUrl();
  if (!url) {
    if (__DEV__) {
      console.info('[spotto notify:console]', payload);
    }
    return { ok: true, skipped: true };
  }

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 12_000,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { ok: true };
  } catch (error) {
    if (__DEV__) {
      console.warn('[spotto notify] send failed', error);
    }
    return { ok: false };
  }
}
