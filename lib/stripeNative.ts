import { Platform } from 'react-native';
import {
  AddressCollectionMode,
  initPaymentSheet,
  presentPaymentSheet,
} from '@stripe/stripe-react-native';

import {
  stripePaymentSheetReturnUrl,
  stripePublishableKey,
  type PaymentSession,
} from '@/lib/stripePayments';

export function isNativeStripeAvailable() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function isValidPaymentIntentClientSecret(secret: string | undefined) {
  const value = String(secret || '').trim();
  if (!value.includes('_secret_')) return false;
  return value.startsWith('pi_') && value.length >= 20;
}

/** PaymentSheet を初期化。present は別途呼ぶ。 */
export async function initNativePaymentSheet(
  session: PaymentSession,
): Promise<void> {
  const clientSecret = String(session.clientSecret || '').trim();
  if (!isValidPaymentIntentClientSecret(clientSecret)) {
    throw new Error(
      '決済情報の準備に失敗しました。時間をおいて再度お試しください。',
    );
  }
  const publishableKey = stripePublishableKey();
  if (!publishableKey) {
    throw new Error('Stripe の公開鍵が未設定です。');
  }
  if (__DEV__) {
    console.log('[payments] initNativePaymentSheet', {
      platform: Platform.OS,
      paymentIntentId: session.paymentIntentId,
      hasClientSecret: Boolean(clientSecret),
      publishableKeyMode: publishableKey.startsWith('pk_live_')
        ? 'live'
        : publishableKey.startsWith('pk_test_')
          ? 'test'
          : 'unknown',
      publishableKeyPrefix: `${publishableKey.slice(0, 12)}…`,
      livemode: session.livemode,
      stripeAccountId: session.stripeAccountId,
    });
  }

  const { error: initError } = await initPaymentSheet({
    merchantDisplayName: 'spotto',
    paymentIntentClientSecret: clientSecret,
    customerId: session.customerId,
    customerEphemeralKeySecret: session.customerEphemeralKey,
    allowsDelayedPaymentMethods: false,
    ...(Platform.OS === 'ios'
      ? { applePay: { merchantCountryCode: 'JP' as const } }
      : null),
    ...(Platform.OS === 'android'
      ? {
          googlePay: {
            merchantCountryCode: 'JP' as const,
            currencyCode: 'JPY',
            testEnv: !publishableKey.startsWith('pk_live_'),
          },
        }
      : null),
    defaultBillingDetails: {
      address: { country: 'JP' },
    },
    billingDetailsCollectionConfiguration: {
      address: AddressCollectionMode.NEVER,
      attachDefaultsToPaymentMethod: true,
    },
    returnURL: stripePaymentSheetReturnUrl(),
    appearance: {
      colors: {
        background: '#FFFFFF',
        componentBackground: '#FFFFFF',
        primary: '#111111',
        secondaryText: '#6B7280',
        primaryText: '#111111',
        placeholderText: '#9CA3AF',
      },
    },
  });
  if (initError) {
    if (__DEV__) {
      console.error('[payments] initPaymentSheet failed', initError);
    }
    throw new Error(
      initError.message ||
        '決済シートの初期化に失敗しました。もう一度お試しください。',
    );
  }
}

export async function presentPreparedPaymentSheet(): Promise<boolean> {
  const { error } = await presentPaymentSheet();
  if (!error) return true;
  if (error.code === 'Canceled') return false;
  if (__DEV__) {
    console.error('[payments] presentPaymentSheet failed', error);
  }
  throw new Error(error.message || '決済を完了できませんでした。');
}

export async function presentNativePaymentSheet(
  session: PaymentSession,
): Promise<boolean> {
  await initNativePaymentSheet(session);
  // Android: Activity が前面に来るまで少し待つ
  if (Platform.OS === 'android') {
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return presentPreparedPaymentSheet();
}
