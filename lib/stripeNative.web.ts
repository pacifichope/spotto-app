import type { PaymentSession } from '@/lib/stripePayments';

export function isNativeStripeAvailable() {
  return false;
}

export async function initNativePaymentSheet(
  _session: PaymentSession,
): Promise<void> {
  throw new Error('ネイティブ決済はこの環境では利用できません。');
}

export async function presentPreparedPaymentSheet(): Promise<boolean> {
  return false;
}

export async function presentNativePaymentSheet(
  _session: PaymentSession,
): Promise<boolean> {
  return false;
}
