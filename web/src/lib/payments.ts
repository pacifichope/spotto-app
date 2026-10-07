import { apiBaseUrl, siteUrl } from '@/lib/env';

export type PaymentSession = {
  checkoutUrl?: string;
  checkoutSessionId?: string;
  clientSecret?: string;
  paymentIntentId?: string;
  status?: string;
};

/**
 * 有料イベントは既存の POST /payments を使う。
 * Web は preferHostedCheckout で Stripe Checkout の URL を受け取る（アプリの Web 分岐と同じ）。
 */
export async function createHostedCheckout(input: {
  eventId: string;
  title: string;
  amountYen: number;
}): Promise<PaymentSession> {
  const base = apiBaseUrl();
  if (!base) throw new Error('NEXT_PUBLIC_API_BASE_URL が未設定です');
  const returnUrl = `${siteUrl()}/event/${input.eventId}`;
  const response = await fetch(`${base}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      eventId: input.eventId,
      title: input.title,
      amountYen: input.amountYen,
      currency: 'jpy',
      returnUrl,
      preferHostedCheckout: true,
    }),
  });
  const data = (await response.json()) as PaymentSession & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || '決済の開始に失敗しました');
  }
  return data;
}

export async function confirmHostedCheckout(sessionId: string): Promise<{
  paid: boolean;
  paymentIntentId: string;
}> {
  const base = apiBaseUrl();
  const id = sessionId.trim();
  if (!base || !id) return { paid: false, paymentIntentId: '' };
  const response = await fetch(`${base}/payments/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sessionId: id }),
  });
  if (!response.ok) return { paid: false, paymentIntentId: '' };
  const data = (await response.json()) as {
    paid?: boolean;
    paymentIntentId?: string;
  };
  return {
    paid: Boolean(data.paid),
    paymentIntentId: data.paymentIntentId?.trim() || '',
  };
}

