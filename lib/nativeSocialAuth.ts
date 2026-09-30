/**
 * ネイティブソーシャルログイン（Firebase Auth のみ）
 */
import { Platform } from 'react-native';

import type { SocialProvider } from '@/lib/auth';
import { readPublicEnv } from '@/lib/env';
import { userFacingSocialLoginError } from '@/lib/socialLoginErrors';

export type NativeSignInResult =
  | { ok: true; user: import('@/lib/auth').AuthUser }
  | {
      ok: false;
      error: string;
      cancelled?: boolean;
    };

function googleWebClientId() {
  return readPublicEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
}

function lineChannelId() {
  return readPublicEnv('EXPO_PUBLIC_LINE_CHANNEL_ID');
}

/**
 * Google / Apple / LINE → Firebase Auth
 */
export async function signInWithNativeProvider(
  provider: SocialProvider,
): Promise<NativeSignInResult> {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      error: userFacingSocialLoginError(provider),
    };
  }

  const { signInWithFirebaseProvider } = await import('@/lib/firebaseSignIn');
  return signInWithFirebaseProvider(provider);
}

export function isNativeSocialReady(provider: SocialProvider): boolean {
  if (Platform.OS === 'web') return false;
  if (provider === 'apple') return Platform.OS === 'ios';
  if (provider === 'google') return Boolean(googleWebClientId());
  return Boolean(lineChannelId());
}
