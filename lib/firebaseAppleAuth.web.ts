/**
 * Apple → Firebase Auth（Web）
 * Services ID 設定が必要なため、現状は未対応（ネイティブ iOS のみ）。
 */
import type { AuthUser } from '@/lib/auth';
import { SOCIAL_LOGIN_USER_ERRORS } from '@/lib/socialLoginErrors';

export type FirebaseAppleSignInResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; cancelled?: boolean };

export async function signInWithAppleFirebase(): Promise<FirebaseAppleSignInResult> {
  return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.apple };
}

export function isFirebaseAppleAuthReady(): boolean {
  return false;
}
