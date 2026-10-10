/**
 * Apple → Firebase Auth（ネイティブ: AppleAuthProvider + signInWithCredential）
 */
import '@/lib/firebaseNativeInit';

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import type { AuthUser } from '@/lib/auth';
import { authUserFromFirebaseUser } from '@/lib/firebaseAuthSession';
import {
  ensureNativeFirebaseApp,
  isNativeFirebaseLinked,
} from '@/lib/firebaseNativeInit';
import { waitForNativeAuthPresenter } from '@/lib/nativeAuthPresenter';
import { SOCIAL_LOGIN_USER_ERRORS } from '@/lib/socialLoginErrors';

export type FirebaseAppleSignInResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; cancelled?: boolean };

type FirebaseUserLike = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  providerData?: Array<{ providerId?: string | null }>;
};

function loadAuthModular(): {
  getAuth: () => unknown;
  AppleAuthProvider: {
    credential: (
      idToken: string,
      rawNonce?: string,
    ) => unknown;
  };
  signInWithCredential: (
    auth: unknown,
    credential: unknown,
  ) => Promise<{ user: FirebaseUserLike }>;
  updateProfile: (
    user: FirebaseUserLike,
    profile: { displayName?: string },
  ) => Promise<void>;
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

async function createRawAndHashedNonce() {
  const rawNonce = Crypto.randomUUID().replace(/-/g, '');
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
  return { rawNonce, hashedNonce };
}

function mapAppleError(error: unknown): FirebaseAppleSignInResult {
  const code =
    typeof error === 'object' &&
    error &&
    'code' in error &&
    (error as { code?: unknown }).code != null
      ? String((error as { code: unknown }).code)
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error &&
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
        ? String((error as { message: string }).message)
        : String(error || '');
  const blob = `${code} ${message}`.toLowerCase();

  if (
    code === 'ERR_REQUEST_CANCELED' ||
    /cancel|キャンセル|err_request_canceled/i.test(blob)
  ) {
    return {
      ok: false,
      error: SOCIAL_LOGIN_USER_ERRORS.cancelled,
      cancelled: true,
    };
  }
  return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.apple };
}

async function signInAppleWithRetry<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error || '');
    if (
      /cancel|キャンセル/i.test(message) ||
      !/window|present|anchor|view controller/i.test(message)
    ) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
    return attempt();
  }
}

/**
 * Apple Authentication → Firebase Auth (apple.com OAuthProvider)
 */
export async function signInWithAppleFirebase(): Promise<FirebaseAppleSignInResult> {
  if (Platform.OS !== 'ios') {
    return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.apple };
  }

  try {
    const appReady = await ensureNativeFirebaseApp();
    if (!appReady) {
      if (__DEV__) {
        console.warn(
          '[auth] Firebase DEFAULT アプリ未初期化。google-services / Dev Client を確認してください。',
        );
      }
      return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.apple };
    }

    const authMod = loadAuthModular();
    if (!authMod) {
      if (__DEV__) {
        console.warn(
          '[auth] @react-native-firebase/auth が未リンクです。Dev Client を再ビルドしてください。',
        );
      }
      return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.apple };
    }

    let available = false;
    try {
      available = await AppleAuthentication.isAvailableAsync();
    } catch (error) {
      return mapAppleError(error);
    }
    if (!available) {
      return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.apple };
    }

    const { rawNonce, hashedNonce } = await createRawAndHashedNonce();

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      await waitForNativeAuthPresenter(Platform.isPad ? 200 : 0);
      credential = await signInAppleWithRetry(() =>
        AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce: hashedNonce,
        }),
      );
    } catch (error) {
      return mapAppleError(error);
    }

    if (!credential.identityToken) {
      return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.apple };
    }

    const firebaseCredential = authMod.AppleAuthProvider.credential(
      credential.identityToken,
      rawNonce,
    );

    const userCredential = await authMod.signInWithCredential(
      authMod.getAuth(),
      firebaseCredential,
    );

    const given = credential.fullName?.givenName?.trim();
    const family = credential.fullName?.familyName?.trim();
    const fullName = [given, family].filter(Boolean).join(' ');
    if (fullName && userCredential.user) {
      try {
        await authMod.updateProfile(userCredential.user, {
          displayName: fullName,
        });
        userCredential.user.displayName = fullName;
      } catch (error) {
        if (__DEV__) {
          console.warn('[auth] Apple updateProfile', error);
        }
      }
    }

    return {
      ok: true,
      user: authUserFromFirebaseUser(userCredential.user, 'apple'),
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] signInWithAppleFirebase', error);
    }
    return mapAppleError(error);
  }
}

export function isFirebaseAppleAuthReady(): boolean {
  return Platform.OS === 'ios' && Boolean(loadAuthModular());
}
