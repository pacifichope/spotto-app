/**
 * DB 層向け: 現在の Firebase Auth ユーザー（UID）を返すヘルパー。
 * Supabase GoTrue の getSession / getUser の代替。
 */
import { loadFirebaseAuthUser } from '@/lib/firebaseAuthSession';
import { getFirebaseIdToken } from '@/lib/firebaseIdToken';
import type { AuthUser } from '@/lib/auth';

export async function getCurrentFirebaseAuthUser(): Promise<AuthUser | null> {
  return loadFirebaseAuthUser();
}

export async function getCurrentFirebaseUid(): Promise<string | null> {
  const user = await loadFirebaseAuthUser();
  return user?.id ?? null;
}

/** Authorization ヘッダー用 Bearer トークン */
export async function getCurrentFirebaseAccessToken(
  forceRefresh = false,
): Promise<string | null> {
  return getFirebaseIdToken(forceRefresh);
}
