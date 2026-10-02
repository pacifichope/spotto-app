import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  apiConnectionErrorMessage,
  getDevMachineHost,
  publicApiUrl,
  readPublicEnv,
} from '@/lib/env';
import i18n from '@/lib/i18n';

export type CheckoutRequest = {
  eventId: string;
  title: string;
  amountYen: number;
  /** true のとき Stripe Checkout（hosted URL）を返す。未指定時は Platform 依存 */
  preferHostedCheckout?: boolean;
};

export type PaymentSession = {
  clientSecret?: string;
  customerId?: string;
  customerEphemeralKey?: string;
  checkoutUrl?: string;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  livemode?: boolean;
  stripeAccountId?: string;
  status?: string;
};

export type RefundRequest = {
  eventId: string;
  paymentIntentId: string;
  amountYen: number;
  refundAmountYen?: number;
  cancelPolicy?: string;
  eventStartsAt?: string;
  hostCancelled?: boolean;
};

export type RefundResult = {
  refundId: string;
  demo: boolean;
};

export type StripeMode = 'test' | 'live';

/**
 * Stripe モード（test | live）。
 * EXPO_PUBLIC_STRIPE_MODE で切替。未設定・不正値は安全側で test。
 */
export function stripeMode(): StripeMode {
  const raw = readPublicEnv('EXPO_PUBLIC_STRIPE_MODE').toLowerCase();
  return raw === 'live' ? 'live' : 'test';
}

export function stripePublishableKey() {
  const mode = stripeMode();
  const specific = readPublicEnv(
    mode === 'live'
      ? 'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE'
      : 'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST',
  );
  if (specific) return specific;
  // 互換: 旧 EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
  return readPublicEnv('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY');
}

/** 公開鍵またはモードが test のとき true（UI の開発向け表示切替用） */
export function isStripeTestMode() {
  if (stripeMode() === 'test') return true;
  const key = stripePublishableKey();
  return Boolean(key) && key.startsWith('pk_test_');
}

/**
 * StripeProvider の urlScheme。
 * Expo Go とスタンドアロンで Linking と揃える。
 */
export function stripeUrlScheme() {
  if (Constants.appOwnership === 'expo') {
    return Linking.createURL('/--/');
  }
  return 'spotto';
}

/**
 * PaymentSheet の returnURL。
 * StripeProvider の urlScheme と同じ Linking 体系で組み立てる。
 */
export function stripePaymentSheetReturnUrl() {
  return Linking.createURL('stripe-redirect');
}

export function stripePaymentApiUrl() {
  return publicApiUrl('/payments', 'EXPO_PUBLIC_STRIPE_PAYMENT_API_URL');
}

export function stripeRefundApiUrl() {
  return publicApiUrl('/refunds', 'EXPO_PUBLIC_STRIPE_REFUND_API_URL');
}

export function stripePaymentConfirmApiUrl() {
  return publicApiUrl('/payments/confirm', 'EXPO_PUBLIC_STRIPE_CONFIRM_API_URL');
}

export function stripePaymentStatusApiUrl() {
  return publicApiUrl('/payments/status');
}

export function isStripePaymentsConfigured() {
  return Boolean(stripePublishableKey() && stripePaymentApiUrl());
}

/** 公開鍵から推定する Stripe アカウント ID（デバッグ用） */
export function stripePublishableAccountId() {
  const key = stripePublishableKey();
  // pk_{mode}_51{accountSuffix15}{random…} → acct_1{accountSuffix15}
  const match = key.match(/^pk_(?:test|live)_51([A-Za-z0-9]{15})/);
  if (!match) return '';
  return `acct_1${match[1]}`;
}

export function paymentIntentIdFromSession(session: PaymentSession | null) {
  const explicit = session?.paymentIntentId?.trim();
  if (explicit) return explicit;
  const secret = session?.clientSecret?.trim() || '';
  const match = secret.match(/^(pi_[^_]+)/);
  if (match) return match[1];
  return '';
}

export function demoPaymentIntentId(eventId: string) {
  return `demo_pi_${eventId}_${Date.now()}`;
}

export function paymentReturnUrl() {
  // Android Custom Tabs のリダイレクト検出は固定スキームの方が安定する
  if (Platform.OS === 'android') {
    return 'spotto://payment-complete';
  }
  return Linking.createURL('payment-complete');
}

export async function createPaymentSession(
  input: CheckoutRequest,
): Promise<PaymentSession | null> {
  const configuredBase = readPublicEnv('EXPO_PUBLIC_API_BASE_URL');
  const configuredPayment = readPublicEnv('EXPO_PUBLIC_STRIPE_PAYMENT_API_URL');
  const url = stripePaymentApiUrl();

  if (__DEV__) {
    console.log('[payments] createPaymentSession resolve', {
      platform: Platform.OS,
      configuredBase: configuredBase || '(empty)',
      configuredPayment: configuredPayment || '(empty)',
      devMachineHost: getDevMachineHost() || '(empty)',
      resolvedUrl: url || '(empty)',
      eventId: input.eventId,
      amountYen: input.amountYen,
    });
  }

  if (!url) {
    const msg = i18n.t('payment.errorApiUrlEmpty');
    if (__DEV__) console.warn('[payments]', msg);
    return null;
  }

  const body = {
    eventId: input.eventId,
    title: input.title,
    amountYen: input.amountYen,
    currency: 'jpy',
    returnUrl: paymentReturnUrl(),
    preferHostedCheckout:
      typeof input.preferHostedCheckout === 'boolean'
        ? input.preferHostedCheckout
        : Platform.OS === 'web',
  };

  if (__DEV__) {
    console.log('[payments] POST request', {
      method: 'POST',
      url,
      body,
    });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (__DEV__) {
      console.error('[payments] fetch threw', {
        url,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        error,
      });
    }
    throw new Error(apiConnectionErrorMessage(url, error));
  }

  const responseText = await response.text();
  if (__DEV__) {
    console.log('[payments] POST response', {
      url,
      status: response.status,
      ok: response.ok,
      bodyPreview: responseText.slice(0, 500),
    });
  }

  if (!response.ok) {
    if (response.status === 401) {
      void import('@/lib/sessionExpiry').then((m) =>
        m.notifySessionExpired(`payments:${response.status}`),
      );
    }
    let detail = '';
    try {
      const payload = JSON.parse(responseText) as { error?: string };
      detail = payload.error ? `: ${payload.error}` : '';
    } catch {
      if (responseText.trim()) {
        detail = `: ${responseText.trim().slice(0, 180)}`;
      }
    }
    const base = i18n.t('payment.errorSessionCreateFailed');
    const msg = __DEV__
      ? `${base}${detail}（URL: ${url}, status: ${response.status}）`
      : `${base}${detail}`;
    if (__DEV__) console.error('[payments]', msg);
    throw new Error(msg);
  }

  try {
    const session = JSON.parse(responseText) as PaymentSession;
    if (__DEV__) {
      const pkAccount = stripePublishableAccountId();
      console.log('[payments] session created', {
        paymentIntentId: session.paymentIntentId,
        status: session.status,
        livemode: session.livemode,
        stripeAccountId: session.stripeAccountId,
        publishableAccountId: pkAccount || '(unknown)',
        accountMatch:
          !session.stripeAccountId || !pkAccount
            ? '(skipped)'
            : session.stripeAccountId === pkAccount,
        dashboardHint: session.livemode
          ? 'https://dashboard.stripe.com/payments'
          : 'https://dashboard.stripe.com/test/payments',
      });
      if (
        session.stripeAccountId &&
        pkAccount &&
        session.stripeAccountId !== pkAccount
      ) {
        console.error(
          '[payments] Stripe アカウント不一致: サーバー SK とアプリ PK が別アカウントです',
          { server: session.stripeAccountId, app: pkAccount },
        );
      }
    }
    return session;
  } catch (error) {
    if (__DEV__) {
      console.error('[payments] invalid JSON response', {
        url,
        responseText: responseText.slice(0, 500),
        error,
      });
    }
    throw new Error(
      __DEV__
        ? `${i18n.t('payment.errorApiInvalidResponse')}（URL: ${url}）`
        : i18n.t('payment.errorApiInvalidResponse'),
    );
  }
}

export async function confirmPaymentIntentStatus(
  paymentIntentId: string,
): Promise<{
  paid: boolean;
  paymentIntentId: string;
  status: string;
  livemode?: boolean;
  stripeAccountId?: string;
}> {
  const url = stripePaymentStatusApiUrl();
  const id = paymentIntentId.trim();
  if (!url || !id) {
    return { paid: false, paymentIntentId: id, status: '' };
  }
  if (__DEV__) {
    console.log('[payments] POST /payments/status', { url, paymentIntentId: id });
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentIntentId: id }),
  });
  const text = await response.text();
  if (__DEV__) {
    console.log('[payments] status response', {
      status: response.status,
      bodyPreview: text.slice(0, 400),
    });
  }
  if (!response.ok) {
    let detail = '';
    try {
      const payload = JSON.parse(text) as { error?: string };
      detail = payload.error ? `: ${payload.error}` : '';
    } catch {
      detail = text.trim() ? `: ${text.trim().slice(0, 120)}` : '';
    }
    throw new Error(`${i18n.t('payment.errorStatusCheckFailed')}${detail}`);
  }
  const data = JSON.parse(text) as {
    paid?: boolean;
    paymentIntentId?: string;
    status?: string;
    livemode?: boolean;
    stripeAccountId?: string;
  };
  return {
    paid: Boolean(data.paid),
    paymentIntentId: data.paymentIntentId?.trim() || id,
    status: data.status || '',
    livemode: data.livemode,
    stripeAccountId: data.stripeAccountId,
  };
}

export async function confirmCheckoutSession(
  sessionId: string,
): Promise<{ paid: boolean; paymentIntentId: string }> {
  const url = stripePaymentConfirmApiUrl();
  if (!url || !sessionId.trim()) {
    return { paid: false, paymentIntentId: '' };
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionId.trim() }),
  });
  if (!response.ok) {
    throw new Error(i18n.t('payment.errorConfirmFailed'));
  }
  const data = (await response.json()) as {
    paid?: boolean;
    paymentIntentId?: string;
  };
  return {
    paid: Boolean(data.paid),
    paymentIntentId: data.paymentIntentId?.trim() || '',
  };
}

export async function openHostedCheckout(
  checkoutUrl: string,
): Promise<{ paid: boolean; sessionId: string }> {
  const url = String(checkoutUrl || '').trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error(i18n.t('payment.errorCheckoutUrlFailed'));
  }
  // Android Custom Tabs のリダイレクト検出は app scheme が安定している方がよい
  const returnUrl =
    Platform.OS === 'android'
      ? 'spotto://payment-complete'
      : paymentReturnUrl();
  if (__DEV__) {
    console.log('[payments] openHostedCheckout', {
      checkoutUrlPreview: `${url.slice(0, 48)}…`,
      returnUrl,
      platform: Platform.OS,
    });
  }

  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined') {
        window.location.assign(url);
        return { paid: false, sessionId: '' };
      }
    } catch {
      // fall through
    }
  }

  const androidBrowserOptions = {
    createTask: true,
    showInRecents: true,
    enableDefaultShareMenuItem: false,
  } as const;

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    if (Platform.OS === 'android') {
      try {
        await WebBrowser.warmUpAsync();
      } catch {
        // optional
      }
    }
    result = await WebBrowser.openAuthSessionAsync(url, returnUrl, {
      dismissButtonStyle: 'close',
      enableDefaultShareMenuItem: false,
      ...(Platform.OS === 'android' ? androidBrowserOptions : null),
      ...(Platform.OS === 'ios'
        ? {
            presentationStyle:
              WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          }
        : null),
    });
  } catch (error) {
    if (__DEV__) {
      console.error(
        '[payments] openAuthSessionAsync failed, fallback openBrowserAsync / Linking',
        error,
      );
    }
    try {
      await WebBrowser.openBrowserAsync(url, {
        dismissButtonStyle: 'close',
        enableDefaultShareMenuItem: false,
        ...(Platform.OS === 'android' ? androidBrowserOptions : null),
        ...(Platform.OS === 'ios'
          ? {
              presentationStyle:
                WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
            }
          : null),
      });
    } catch (browserErr) {
      if (__DEV__) {
        console.error('[payments] openBrowserAsync failed, Linking.openURL', browserErr);
      }
      const opened = await Linking.canOpenURL(url);
      if (!opened) {
        throw new Error(i18n.t('payment.errorOpenFailed'));
      }
      await Linking.openURL(url);
    }
    return { paid: false, sessionId: '' };
  }

  if (__DEV__) {
    console.log('[payments] openAuthSessionAsync result', {
      type: result.type,
      url:
        'url' in result && result.url
          ? `${String(result.url).slice(0, 80)}…`
          : '',
    });
  }

  if (result.type === 'locked') {
    throw new Error(i18n.t('payment.errorBrowserLocked'));
  }
  // Android openBrowser polyfill は type: 'opened' を返すことがある
  if (result.type === 'opened') {
    return { paid: false, sessionId: '' };
  }
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    return { paid: false, sessionId: '' };
  }
  const parsed = Linking.parse(result.url);
  const status = String(parsed.queryParams?.status ?? '');
  const sessionId = String(parsed.queryParams?.session_id ?? '');
  if (/cancel/i.test(status)) {
    return { paid: false, sessionId };
  }
  return { paid: true, sessionId };
}

export async function requestStripeRefund(
  input: RefundRequest,
): Promise<RefundResult> {
  const isDemoPayment = input.paymentIntentId.startsWith('demo_');
  const url = stripeRefundApiUrl() || (!isDemoPayment ? stripePaymentApiUrl() : '');
  if (!url || isDemoPayment) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { refundId: `demo_re_${Date.now()}`, demo: true };
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'refund',
      eventId: input.eventId,
      paymentIntentId: input.paymentIntentId,
      amountYen: input.amountYen,
      refundAmountYen: input.refundAmountYen ?? input.amountYen,
      cancelPolicy: input.cancelPolicy ?? '',
      eventStartsAt: input.eventStartsAt ?? '',
      hostCancelled: Boolean(input.hostCancelled),
      currency: 'jpy',
    }),
  });
  if (!response.ok) {
    throw new Error(i18n.t('payment.errorRefundFailed'));
  }
  const data = (await response.json()) as { refundId?: string };
  return {
    refundId: data.refundId?.trim() || `re_${Date.now()}`,
    demo: false,
  };
}
