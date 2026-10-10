/**
 * Google → Firebase Auth（ネイティブ）
 * Supabase signInWithIdToken は使わない。
 */
import '@/lib/firebaseNativeInit';

import { Platform } from 'react-native';

import type { AuthUser } from '@/lib/auth';
import { readPublicEnv } from '@/lib/env';
import { authUserFromFirebaseUser } from '@/lib/firebaseAuthSession';
import {
  ensureNativeFirebaseApp,
  isNativeFirebaseLinked,
} from '@/lib/firebaseNativeInit';
import { waitForNativeAuthPresenter } from '@/lib/nativeAuthPresenter';
import { SOCIAL_LOGIN_USER_ERRORS } from '@/lib/socialLoginErrors';

export type FirebaseGoogleSignInResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; cancelled?: boolean };

let googleConfigured = false;

function googleWebClientId() {
  return readPublicEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
}

function googleIosClientId() {
  // Web クライアント ID を iOS 用に流用すると本番の GIDSignIn が即失敗する。
  // 未設定なら SDK が GoogleService-Info.plist / URL scheme を使う。
  return readPublicEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');
}

function loadGoogleSignIn() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
}

function loadAuthModular(): {
  getAuth: () => unknown;
  GoogleAuthProvider: {
    credential: (
      idToken: string | null,
      accessToken?: string | null,
    ) => unknown;
  };
  signInWithCredential: (
    auth: unknown,
    credential: unknown,
  ) => Promise<{ user: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null; providerData?: Array<{ providerId?: string | null }> } }>;
} | null {
  if (Platform.OS === 'web') return null;
  if (!isNativeFirebaseLinked()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-firebase/auth');
  } catch {
    return null;
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return String((error as { message: string }).message);
  }
  return String(error || '');
}

/** iPad でモーダル閉鎖直後だと presenter が無く、1回目だけ失敗することがある */
async function signInWithPresenterRetry<T>(
  attempt: () => Promise<T>,
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    const blob = errorText(error);
    if (!/NULL_PRESENTER|presenting view controller|no presenting/i.test(blob)) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
    return attempt();
  }
}

function ensureGoogleConfigured(): FirebaseGoogleSignInResult | null {
  const webClientId = googleWebClientId();
  if (!webClientId) {
    if (__DEV__) {
      console.warn(
        '[auth] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID が未設定です（Firebase Google ログイン）',
      );
    }
    return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.google };
  }

  if (!googleConfigured) {
    const { GoogleSignin } = loadGoogleSignIn();
    const iosClientId = googleIosClientId();
    GoogleSignin.configure({
      webClientId,
      ...(iosClientId ? { iosClientId } : {}),
      offlineAccess: false,
    });
    if (__DEV__) {
      console.log('[auth] GoogleSignin.configure (Firebase)', {
        webClientIdPrefix: webClientId.split('-')[0],
        hasIosClientId: Boolean(iosClientId),
      });
    }
    googleConfigured = true;
  }
  return null;
}

function mapGoogleError(error: unknown): FirebaseGoogleSignInResult {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error &&
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
        ? String((error as { message: string }).message)
        : String(error || '');
  const code =
    typeof error === 'object' &&
    error &&
    'code' in error &&
    (error as { code?: unknown }).code != null
      ? String((error as { code: unknown }).code)
      : '';
  const blob = `${code} ${message}`.toLowerCase();

  if (/cancel|キャンセル|sign_in_cancelled/i.test(blob)) {
    return {
      ok: false,
      error: SOCIAL_LOGIN_USER_ERRORS.cancelled,
      cancelled: true,
    };
  }
  if (
    /developer_error|api_exception:\s*10\b|\bcode[=: ]*10\b|error.?code.?10/i.test(
      blob,
    )
  ) {
    const webClientId = googleWebClientId();
    console.warn(
      '[auth] Google DEVELOPER_ERROR (code 10): OAuth クライアント設定不一致です。\n' +
        '  【最頻出】この端末ビルドの署名 SHA-1 が Firebase に未登録です。\n' +
        '  1) npm run check:firebase で登録済み SHA とローカル debug.keystore を照合\n' +
        '  2) debug が無い場合は初回 `npx expo run:android` 後に keytool で SHA-1 を取得\n' +
        '  3) EAS ビルドなら `eas credentials -p android` の SHA-1 も Firebase に追加\n' +
        '  4) EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = google-services.json の client_type=3\n' +
        '  5) package は com.taiki.spotto。JSON を再配置後に Dev Client を再ビルド\n' +
        '  → docs/AUTH_TROUBLESHOOTING.md\n' +
        `  webClientIdPrefix=${webClientId ? webClientId.split('-')[0] : '(unset)'} code=${code}`,
    );
    return {
      ok: false,
      error: SOCIAL_LOGIN_USER_ERRORS.googleConfig,
    };
  }
  return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.google };
}

/**
 * Google Sign-In SDK で ID トークンを取得し、Firebase Auth に signInWithCredential する。
 */
export async function signInWithGoogleFirebase(): Promise<FirebaseGoogleSignInResult> {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      error: SOCIAL_LOGIN_USER_ERRORS.google,
    };
  }

  try {
    const configError = ensureGoogleConfigured();
    if (configError) return configError;

    const appReady = await ensureNativeFirebaseApp();
    if (!appReady) {
      if (__DEV__) {
        console.warn(
          '[auth] Firebase DEFAULT アプリ未初期化。google-services.json / Dev Client を確認してください。',
        );
      }
      return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.google };
    }

    const authMod = loadAuthModular();
    if (!authMod) {
      if (__DEV__) {
        console.warn(
          '[auth] @react-native-firebase/auth が未リンクです。Dev Client を再ビルドしてください。',
        );
      }
      return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.google };
    }

    const { GoogleSignin, isSuccessResponse, statusCodes } = loadGoogleSignIn();

    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: true,
        });
      }

      // 既存セッションがあると signIn がスキップされることがあるためクリア
      try {
        if (GoogleSignin.getCurrentUser()) {
          await GoogleSignin.signOut();
        }
      } catch {
        // ignore
      }

      await waitForNativeAuthPresenter(Platform.isPad ? 200 : 0);
      const response = await signInWithPresenterRetry(() =>
        GoogleSignin.signIn(),
      );
      if (!isSuccessResponse(response)) {
        return {
          ok: false,
          error: SOCIAL_LOGIN_USER_ERRORS.cancelled,
          cancelled: true,
        };
      }

      let idToken = response.data.idToken;
      let accessToken: string | null | undefined;
      try {
        const tokens = await GoogleSignin.getTokens();
        idToken = idToken || tokens.idToken;
        accessToken = tokens.accessToken;
      } catch {
        // idToken だけで続行
      }

      if (!idToken) {
        if (__DEV__) {
          console.warn('[auth] Google Sign-In: idToken が空です');
        }
        return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.google };
      }

      const credential = authMod.GoogleAuthProvider.credential(
        idToken,
        accessToken ?? null,
      );
      const userCredential = await authMod.signInWithCredential(
        authMod.getAuth(),
        credential,
      );

      return {
        ok: true,
        user: authUserFromFirebaseUser(userCredential.user, 'google'),
      };
    } catch (error) {
      if (__DEV__) {
        console.warn('[auth] Firebase Google sign-in', error);
      }
      // statusCodes は map 内で cancel 判定に使う
      void statusCodes;
      return mapGoogleError(error);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] signInWithGoogleFirebase', error);
    }
    return mapGoogleError(error);
  }
}

export function isFirebaseGoogleAuthReady(): boolean {
  if (Platform.OS === 'web') return false;
  return Boolean(googleWebClientId() && loadAuthModular());
}
