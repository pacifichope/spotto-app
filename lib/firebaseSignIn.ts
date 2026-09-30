/**
 * ソーシャルログイン入口（Firebase Auth のみ）
 */
import type { AuthResult, AuthUser, SocialProvider } from '@/lib/auth';
import { readPublicEnv } from '@/lib/env';
import { isAuthMockEnabled } from '@/lib/supabase';
import { userFacingSocialLoginError } from '@/lib/socialLoginErrors';
import { ensureFirebaseAuthenticatedClaim } from '@/lib/firebaseEnsureClaims';
import { Platform } from 'react-native';

export type FirebaseSignInResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; cancelled?: boolean };

async function signInProvider(
  provider: SocialProvider,
): Promise<FirebaseSignInResult> {
  if (provider === 'google') {
    const { signInWithGoogleFirebase } = await import(
      '@/lib/firebaseGoogleAuth'
    );
    return signInWithGoogleFirebase();
  }
  if (provider === 'apple') {
    const { signInWithAppleFirebase } = await import('@/lib/firebaseAppleAuth');
    return signInWithAppleFirebase();
  }
  const { signInWithLineFirebase } = await import('@/lib/firebaseLineAuth');
  return signInWithLineFirebase();
}

/**
 * Google / Apple / LINE → Firebase Auth
 */
export async function signInWithFirebaseProvider(
  provider: SocialProvider,
): Promise<AuthResult> {
  if (isAuthMockEnabled()) {
    if (__DEV__) {
      console.log('[auth] MOCK Firebase sign-in', provider);
    }
    const mockUser: AuthUser = {
      id: `mock-${provider}-${Date.now()}`,
      email: `${provider}@mock.spotto.local`,
      name: `Mock ${provider.toUpperCase()} User`,
      provider,
    };
    return { ok: true, user: mockUser };
  }

  try {
    const result = await signInProvider(provider);
    if (!result.ok) {
      if (result.cancelled) return result;
      return {
        ok: false,
        error: userFacingSocialLoginError(provider, result.error),
      };
    }

    // Supabase RLS 用 role: authenticated クレーム
    await ensureFirebaseAuthenticatedClaim();

    return result;
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] signInWithFirebaseProvider', provider, error);
    }
    return {
      ok: false,
      error: userFacingSocialLoginError(provider),
    };
  }
}

export function isFirebaseSocialReady(provider: SocialProvider): boolean {
  if (provider === 'google') {
    if (Platform.OS === 'web') {
      // web は firebase JS 設定があれば可
      return true;
    }
    return true;
  }
  if (provider === 'apple') return Platform.OS === 'ios';
  // LINE: Channel ID + API（ネイティブ / Web）
  if (provider === 'line') {
    return Boolean(readPublicEnv('EXPO_PUBLIC_LINE_CHANNEL_ID'));
  }
  return false;
}
