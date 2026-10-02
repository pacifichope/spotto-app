/**
 * Firebase Auth 電話番号本人確認（Web: firebase JS + RecaptchaVerifier）
 *
 * ソーシャルログイン済みセッションを壊さない。
 * PhoneAuthProvider.verifyPhoneNumber → credential → linkWithCredential
 */
import {
  getAuth,
  linkWithCredential,
  PhoneAuthProvider,
  RecaptchaVerifier,
  updatePhoneNumber,
  type ApplicationVerifier,
} from 'firebase/auth';

import { getFirebaseJsApp, isFirebaseWebConfigured } from '@/lib/firebaseApp';
import i18n from '@/lib/i18n';
import {
  extractPhoneAuthErrorRaw,
  formatPhoneAuthError,
} from '@/lib/phoneVerificationShared';

export type FirebasePhoneConfirmation = {
  confirm: (code: string) => Promise<void>;
};

let pendingVerificationId: string | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;

export function isFirebasePhoneAuthAvailable() {
  return isFirebaseWebConfigured();
}

export function ensureWebRecaptchaVerifier(
  containerOrId: HTMLElement | string = 'firebase-recaptcha',
): ApplicationVerifier {
  const auth = getAuth(getFirebaseJsApp());
  if (typeof document === 'undefined') {
    throw new Error(i18n.t('errors.phone.recaptchaWebOnly'));
  }

  try {
    recaptchaVerifier?.clear();
  } catch {
    // ignore
  }
  recaptchaVerifier = null;

  let container: HTMLElement | null =
    typeof containerOrId === 'string'
      ? document.getElementById(containerOrId)
      : containerOrId;

  if (!container) {
    container = document.createElement('div');
    container.id =
      typeof containerOrId === 'string' ? containerOrId : 'firebase-recaptcha';
    container.style.position = 'fixed';
    container.style.bottom = '0';
    container.style.right = '0';
    container.style.zIndex = '99999';
    document.body.appendChild(container);
  }

  recaptchaVerifier = new RecaptchaVerifier(auth, container, {
    size: 'invisible',
    callback: () => {
      // solved
    },
    'expired-callback': () => {
      // allow retry
    },
  });
  return recaptchaVerifier;
}

async function applyPhoneCredential(verificationId: string, code: string) {
  const auth = getAuth(getFirebaseJsApp());
  const user = auth.currentUser;
  if (!user) {
    throw new Error(
      i18n.t('errors.phone.sessionMissing'),
    );
  }
  const credential = PhoneAuthProvider.credential(verificationId, code);
  try {
    await linkWithCredential(user, credential);
  } catch (linkError) {
    const raw = extractPhoneAuthErrorRaw(linkError).toLowerCase();
    if (
      /provider-already-linked|credential-already-in-use|account-exists|phone.*already/i.test(
        raw,
      )
    ) {
      try {
        await updatePhoneNumber(user, credential);
      } catch (updateError) {
        const updateRaw = extractPhoneAuthErrorRaw(updateError).toLowerCase();
        if (
          /invalid-verification-code|invalid-verification-id|code-expired/i.test(
            updateRaw,
          )
        ) {
          throw updateError;
        }
        if (__DEV__) {
          console.warn(
            '[firebasePhoneAuth.web] link/update skipped; treating as verified',
            updateRaw,
          );
        }
      }
      return;
    }
    throw linkError;
  }
}

export async function sendFirebasePhoneOtp(
  phoneE164: string,
  options?: { appVerifier?: ApplicationVerifier },
): Promise<
  | { ok: true; confirmation: FirebasePhoneConfirmation }
  | { ok: false; error: string }
> {
  try {
    if (!isFirebaseWebConfigured()) {
      return {
        ok: false,
        error:
          i18n.t('errors.phone.webNotConfigured'),
      };
    }
    const auth = getAuth(getFirebaseJsApp());
    if (!auth.currentUser) {
      return {
        ok: false,
        error: i18n.t('errors.phone.loginRequired'),
      };
    }

    const appVerifier =
      options?.appVerifier || ensureWebRecaptchaVerifier('firebase-recaptcha');
    const provider = new PhoneAuthProvider(auth);
    const verificationId = await provider.verifyPhoneNumber(
      phoneE164,
      appVerifier,
    );
    pendingVerificationId = verificationId;

    return {
      ok: true,
      confirmation: {
        confirm: async (code: string) => {
          if (!pendingVerificationId) {
            throw new Error(i18n.t('errors.phone.sendCodeFirst'));
          }
          await applyPhoneCredential(pendingVerificationId, code.trim());
          pendingVerificationId = null;
        },
      },
    };
  } catch (error) {
    pendingVerificationId = null;
    try {
      recaptchaVerifier?.clear();
    } catch {
      // ignore
    }
    recaptchaVerifier = null;
    const message = extractPhoneAuthErrorRaw(error);
    if (__DEV__) {
      console.warn('[firebasePhoneAuth.web] send failed', message, error);
    }
    return {
      ok: false,
      error: formatPhoneAuthError(
        message,
        i18n.t('errors.phone.smsSendFailedWeb'),
      ),
    };
  }
}

export async function confirmFirebasePhoneOtp(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pendingVerificationId) {
    return {
      ok: false,
      error: i18n.t('errors.phone.sendCodeFirst'),
    };
  }
  try {
    await applyPhoneCredential(pendingVerificationId, code.trim());
    pendingVerificationId = null;
    return { ok: true };
  } catch (error) {
    const message = extractPhoneAuthErrorRaw(error);
    if (__DEV__) {
      console.warn('[firebasePhoneAuth.web] confirm failed', message, error);
    }
    return {
      ok: false,
      error: formatPhoneAuthError(
        message,
        i18n.t('errors.phone.codeInvalid'),
      ),
    };
  }
}

export function clearFirebasePhonePending() {
  pendingVerificationId = null;
  try {
    recaptchaVerifier?.clear();
  } catch {
    // ignore
  }
  recaptchaVerifier = null;
}
