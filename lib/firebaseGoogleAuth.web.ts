/**
 * Google → Firebase Auth（Web: firebase JS SDK）
 */
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';

import type { AuthUser } from '@/lib/auth';
import { getFirebaseJsApp, isFirebaseWebConfigured } from '@/lib/firebaseApp';
import { authUserFromFirebaseUser } from '@/lib/firebaseAuthSession';
import { SOCIAL_LOGIN_USER_ERRORS } from '@/lib/socialLoginErrors';

export type FirebaseGoogleSignInResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; cancelled?: boolean };

export async function signInWithGoogleFirebase(): Promise<FirebaseGoogleSignInResult> {
  if (!isFirebaseWebConfigured()) {
    if (__DEV__) {
      console.warn(
        '[auth] Firebase Web 設定がありません（EXPO_PUBLIC_FIREBASE_*）',
      );
    }
    return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.google };
  }

  try {
    const auth = getAuth(getFirebaseJsApp());
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    provider.addScope('profile');
    provider.addScope('email');

    // リダイレクト復帰分を先に処理
    try {
      const redirected = await getRedirectResult(auth);
      if (redirected?.user) {
        return {
          ok: true,
          user: authUserFromFirebaseUser(redirected.user, 'google'),
        };
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[auth] getRedirectResult', error);
      }
    }

    try {
      const result = await signInWithPopup(auth, provider);
      return {
        ok: true,
        user: authUserFromFirebaseUser(result.user, 'google'),
      };
    } catch (popupError) {
      const code =
        typeof popupError === 'object' &&
        popupError &&
        'code' in popupError
          ? String((popupError as { code?: unknown }).code || '')
          : '';
      // ポップアップがブロックされた場合はリダイレクトにフォールバック
      if (
        /popup-blocked|popup-closed-by-user|cancelled-popup-request/i.test(code)
      ) {
        if (/popup-closed-by-user/i.test(code)) {
          return {
            ok: false,
            error: SOCIAL_LOGIN_USER_ERRORS.cancelled,
            cancelled: true,
          };
        }
        await signInWithRedirect(auth, provider);
        return {
          ok: false,
          error: SOCIAL_LOGIN_USER_ERRORS.cancelled,
          cancelled: true,
        };
      }
      throw popupError;
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] signInWithGoogleFirebase (web)', error);
    }
    const message =
      error instanceof Error ? error.message : String(error || '');
    if (/cancel|popup-closed/i.test(message)) {
      return {
        ok: false,
        error: SOCIAL_LOGIN_USER_ERRORS.cancelled,
        cancelled: true,
      };
    }
    return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.google };
  }
}

export function isFirebaseGoogleAuthReady(): boolean {
  return isFirebaseWebConfigured();
}
