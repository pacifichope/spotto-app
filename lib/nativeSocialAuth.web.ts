import type { AuthUser, SocialProvider } from '@/lib/auth';
import { userFacingSocialLoginError } from '@/lib/socialLoginErrors';

export type NativeSignInResult =
  | { ok: true; user: AuthUser }
  | {
      ok: false;
      error: string;
      cancelled?: boolean;
    };

/** Web は firebaseSignIn / firebaseGoogleAuth 側で処理する */
export async function signInWithNativeProvider(
  provider: SocialProvider,
): Promise<NativeSignInResult> {
  return {
    ok: false,
    error: userFacingSocialLoginError(provider),
  };
}

export function isNativeSocialReady(_provider: SocialProvider): boolean {
  return false;
}
