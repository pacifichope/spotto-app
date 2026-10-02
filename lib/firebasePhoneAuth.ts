/**
 * Firebase Auth 電話番号本人確認（ネイティブ: @react-native-firebase/auth）
 *
 * ソーシャルログイン済みの Firebase セッションを壊さない。
 * - 送信: verifyPhoneNumber（signInWithPhoneNumber は使わない）
 * - 確認: PhoneAuthProvider.credential → linkWithCredential / updatePhoneNumber
 * - 検証後に signOut しない
 *
 * Console 必須設定（コードでは代替不可）:
 * - Authentication → Sign-in method → Phone を有効化
 * - Authentication → Settings → SMS region policy で JP を許可
 *   （新規プロジェクトは既定で全リージョン拒否 → auth/operation-not-allowed）
 */
import '@/lib/firebaseNativeInit';

import { Platform } from 'react-native';

import {
  ensureNativeFirebaseApp,
  ensureNativeFirebaseAppSync,
  isNativeFirebaseLinked,
} from '@/lib/firebaseNativeInit';
import i18n from '@/lib/i18n';
import {
  extractPhoneAuthErrorRaw,
  formatPhoneAuthError,
} from '@/lib/phoneVerificationShared';

export type FirebasePhoneConfirmation = {
  confirm: (code: string) => Promise<void>;
};

type PhoneAuthSnapshot = {
  state: string;
  verificationId?: string | null;
  code?: string | null;
  error?: unknown;
};

type PhoneAuthListener = {
  on: (
    event: 'state_changed',
    observer: (snapshot: PhoneAuthSnapshot) => void,
  ) => PhoneAuthListener;
  then?: (
    onfulfilled?: (value: PhoneAuthSnapshot) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

type AuthUser = {
  linkWithCredential: (credential: unknown) => Promise<unknown>;
  updatePhoneNumber: (credential: unknown) => Promise<unknown>;
};

type AuthModular = {
  getAuth: () => {
    currentUser: AuthUser | null;
    app?: { options?: { projectId?: string; appId?: string } };
  };
  PhoneAuthProvider: {
    credential: (verificationId: string, code: string) => unknown;
  };
  PhoneAuthState?: {
    CODE_SENT?: string;
    AUTO_VERIFIED?: string;
    ERROR?: string;
    TIMEOUT?: string;
    AUTO_VERIFY_TIMEOUT?: string;
  };
  verifyPhoneNumber: (
    auth: ReturnType<AuthModular['getAuth']>,
    phoneNumber: string,
    autoVerifyTimeoutOrForceResend?: number | boolean,
    forceResend?: boolean,
  ) => PhoneAuthListener;
  linkWithCredential?: (user: AuthUser, credential: unknown) => Promise<unknown>;
  updatePhoneNumber?: (user: AuthUser, credential: unknown) => Promise<unknown>;
};

type PendingPhone = {
  verificationId: string;
};

let pending: PendingPhone | null = null;

const AUTO_VERIFY_TIMEOUT_SEC = 60;

function loadAuthModular(): AuthModular | null {
  if (Platform.OS === 'web') return null;
  ensureNativeFirebaseAppSync();
  if (!isNativeFirebaseLinked()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-firebase/auth') as AuthModular;
  } catch {
    return null;
  }
}

export function isFirebasePhoneAuthAvailable() {
  return Boolean(loadAuthModular());
}

/** Web 専用。ネイティブでは未使用 */
export function ensureWebRecaptchaVerifier(
  _containerOrId?: unknown,
): undefined {
  return undefined;
}

function isState(snapshot: PhoneAuthSnapshot, ...names: string[]) {
  const state = String(snapshot.state || '').toLowerCase();
  return names.some((name) => {
    const n = name.toLowerCase();
    return state === n || state.includes(n);
  });
}

function assertE164(phoneE164: string): string {
  const phone = String(phoneE164 || '').trim().replace(/\s+/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error(
      'auth/invalid-phone-number: E.164 形式（例: +819012345678）で指定してください',
    );
  }
  return phone;
}

function logPhoneAuthContext(authMod: AuthModular, phoneE164: string) {
  if (!__DEV__) return;
  const auth = authMod.getAuth();
  const options = auth?.app?.options;
  console.log('[firebasePhoneAuth] request', {
    phonePrefix: `${phoneE164.slice(0, 5)}…`,
    phoneLen: phoneE164.length,
    hasCurrentUser: Boolean(auth?.currentUser),
    projectId: options?.projectId ?? null,
    appId: options?.appId ?? null,
  });
}

/**
 * verifyPhoneNumber が CODE_SENT / AUTO_VERIFIED になるまで待つ
 */
function waitForPhoneVerification(
  authMod: AuthModular,
  phoneE164: string,
): Promise<PhoneAuthSnapshot> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    try {
      const auth = authMod.getAuth();
      // RNFB PhoneAuthState: sent | verified | error | timeout
      const states = authMod.PhoneAuthState || {
        CODE_SENT: 'sent',
        AUTO_VERIFIED: 'verified',
        ERROR: 'error',
        AUTO_VERIFY_TIMEOUT: 'timeout',
      };

      // 第3引数 = Android 自動検証タイムアウト（秒）。未指定でも動くが明示する
      const listener = authMod.verifyPhoneNumber(
        auth,
        phoneE164,
        AUTO_VERIFY_TIMEOUT_SEC,
      );

      listener.on('state_changed', (snapshot) => {
        if (__DEV__) {
          console.log('[firebasePhoneAuth] state', snapshot.state, {
            hasVerificationId: Boolean(snapshot.verificationId),
            hasCode: Boolean(snapshot.code),
            error: snapshot.error
              ? extractPhoneAuthErrorRaw(snapshot.error)
              : null,
          });
        }
        if (
          isState(
            snapshot,
            String(states.CODE_SENT || 'sent'),
            String(states.AUTO_VERIFIED || 'verified'),
            'sent',
            'verified',
          ) &&
          snapshot.verificationId
        ) {
          finish(() => resolve(snapshot));
          return;
        }
        if (isState(snapshot, String(states.ERROR || 'error'), 'error')) {
          finish(() =>
            reject(snapshot.error || new Error('Phone verification error')),
          );
          return;
        }
        // timeout は「自動取得タイムアウト」であり、CODE_SENT 済みなら SMS 自体は送られている。
        // verificationId 無しの timeout だけ失敗扱い。
        if (
          isState(
            snapshot,
            String(states.AUTO_VERIFY_TIMEOUT || states.TIMEOUT || 'timeout'),
            'timeout',
          ) &&
          !snapshot.verificationId
        ) {
          finish(() =>
            reject(
              snapshot.error ||
                new Error(
                  'auth/code-expired: 認証コードの送信がタイムアウトしました',
                ),
            ),
          );
        }
      });
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

async function applyPhoneCredential(
  authMod: AuthModular,
  verificationId: string,
  code: string,
): Promise<void> {
  const credential = authMod.PhoneAuthProvider.credential(verificationId, code);
  const user = authMod.getAuth().currentUser;
  if (!user) {
    throw new Error(i18n.t('errors.phone.sessionMissing'));
  }

  try {
    if (authMod.linkWithCredential) {
      await authMod.linkWithCredential(user, credential);
    } else {
      await user.linkWithCredential(credential);
    }
    return;
  } catch (linkError) {
    const raw = extractPhoneAuthErrorRaw(linkError).toLowerCase();
    // 既に電話が紐づいている / 別手段で確認済み → update を試す
    if (
      /provider-already-linked|credential-already-in-use|account-exists|phone.*already/i.test(
        raw,
      )
    ) {
      try {
        if (authMod.updatePhoneNumber) {
          await authMod.updatePhoneNumber(user, credential);
        } else {
          await user.updatePhoneNumber(credential);
        }
        return;
      } catch (updateError) {
        // コード自体は正しいがリンク不可でも、SMS 到達は証明できたケースがある
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
            '[firebasePhoneAuth] link/update skipped; treating SMS as verified',
            updateRaw,
          );
        }
        return;
      }
    }
    throw linkError;
  }
}

export async function sendFirebasePhoneOtp(
  phoneE164: string,
  _options?: { appVerifier?: unknown },
): Promise<
  | { ok: true; confirmation: FirebasePhoneConfirmation }
  | { ok: false; error: string }
> {
  const appReady = await ensureNativeFirebaseApp();
  if (!appReady) {
    return {
      ok: false,
      error:
        i18n.t('errors.phone.initFailed'),
    };
  }

  const authMod = loadAuthModular();
  if (!authMod) {
    return {
      ok: false,
      error:
        i18n.t('errors.phone.nativeMissing'),
    };
  }

  if (!authMod.getAuth().currentUser) {
    return {
      ok: false,
      error: i18n.t('errors.phone.loginRequired'),
    };
  }

  try {
    const phone = assertE164(phoneE164);
    logPhoneAuthContext(authMod, phone);

    const snapshot = await waitForPhoneVerification(authMod, phone);
    const verificationId = String(snapshot.verificationId || '').trim();
    if (!verificationId) {
      return {
        ok: false,
        error:
          i18n.t('errors.phone.sendFailedDetail'),
      };
    }

    pending = { verificationId };

    // Android 自動取得コードがあれば保持（confirm 時に利用可）
    const autoCode = snapshot.code ? String(snapshot.code).trim() : '';

    return {
      ok: true,
      confirmation: {
        confirm: async (code: string) => {
          const useCode = (code || autoCode).trim();
          if (!pending?.verificationId) {
            throw new Error(i18n.t('errors.phone.sendCodeFirst'));
          }
          await applyPhoneCredential(authMod, pending.verificationId, useCode);
          pending = null;
        },
      },
    };
  } catch (error) {
    pending = null;
    const raw = extractPhoneAuthErrorRaw(error);
    if (__DEV__) {
      console.warn('[firebasePhoneAuth] send failed', raw, error);
    }
    return {
      ok: false,
      error: formatPhoneAuthError(
        raw,
        i18n.t('errors.phone.smsSendFailed'),
      ),
    };
  }
}

export async function confirmFirebasePhoneOtp(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pending?.verificationId) {
    return {
      ok: false,
      error: i18n.t('errors.phone.sendCodeFirst'),
    };
  }
  await ensureNativeFirebaseApp();
  const authMod = loadAuthModular();
  if (!authMod) {
    return {
      ok: false,
      error: i18n.t('errors.phone.nativeMissingShort'),
    };
  }
  try {
    await applyPhoneCredential(authMod, pending.verificationId, code.trim());
    pending = null;
    // ソーシャルログインセッションは維持（signOut しない）
    return { ok: true };
  } catch (error) {
    const raw = extractPhoneAuthErrorRaw(error);
    if (__DEV__) {
      console.warn('[firebasePhoneAuth] confirm failed', raw, error);
    }
    return {
      ok: false,
      error: formatPhoneAuthError(raw, i18n.t('errors.phone.codeInvalid')),
    };
  }
}

export function clearFirebasePhonePending() {
  pending = null;
}
