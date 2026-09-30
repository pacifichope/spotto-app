/**
 * Firebase Auth セッション管理（アプリの唯一の認証ソース）
 */
import { Platform } from 'react-native';

import type { AuthUser } from '@/lib/auth';
import {
  getNativeFirebaseAuth,
  loadFirebaseAuthModular,
  signOutNativeFirebaseAuth,
  subscribeNativeFirebaseAuth,
  type FirebaseUser,
} from '@/lib/firebaseNativeAuth';

export function authUserFromFirebaseUser(
  user: FirebaseUser,
  provider: AuthUser['provider'] = 'google',
): AuthUser {
  const email = user.email?.trim() || '';
  const name =
    user.displayName?.trim() ||
    email.split('@')[0] ||
    (provider === 'google'
      ? 'Googleユーザー'
      : provider === 'apple'
        ? 'Appleユーザー'
        : provider === 'line'
          ? 'LINEユーザー'
          : 'User');
  return {
    id: user.uid,
    email: email || `firebase-${user.uid}@users.spotto.local`,
    name,
    imageUri: user.photoURL?.trim() || undefined,
    provider,
  };
}

export function inferProvider(
  providerData?: Array<{ providerId?: string | null }>,
  uid?: string,
): AuthUser['provider'] {
  const ids = (providerData || [])
    .map((p) => String(p.providerId || '').toLowerCase())
    .filter(Boolean);
  if (ids.some((id) => id.includes('google'))) return 'google';
  if (ids.some((id) => id.includes('apple'))) return 'apple';
  if (ids.some((id) => id.includes('custom') || id.includes('line'))) {
    return 'line';
  }
  if (uid && /^line_/i.test(uid)) return 'line';
  return 'google';
}

/** 起動時など: Firebase にログイン中ユーザーがいれば AuthUser を返す */
export async function loadFirebaseAuthUser(): Promise<AuthUser | null> {
  try {
    if (Platform.OS === 'web') {
      const { getAuth } = await import('firebase/auth');
      const { getFirebaseJsApp, isFirebaseWebConfigured } = await import(
        '@/lib/firebaseApp'
      );
      if (!isFirebaseWebConfigured()) return null;
      const user = getAuth(getFirebaseJsApp()).currentUser;
      if (!user) return null;
      return authUserFromFirebaseUser(
        user,
        inferProvider(user.providerData, user.uid),
      );
    }

    const { ensureNativeFirebaseApp } = await import('@/lib/firebaseNativeInit');
    await ensureNativeFirebaseApp();

    if (!loadFirebaseAuthModular()) return null;
    const user = getNativeFirebaseAuth()?.currentUser;
    if (!user) return null;
    return authUserFromFirebaseUser(
      user,
      inferProvider(user.providerData, user.uid),
    );
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] loadFirebaseAuthUser', error);
    }
    return null;
  }
}

/**
 * 永続化セッションの復元を待つ。
 * Web では reload 直後 currentUser が一時的に null のため、
 * 最初の onAuthStateChanged を待つ（タイムアウト付き）。
 */
export function waitForInitialFirebaseAuthUser(
  timeoutMs = 8_000,
): Promise<AuthUser | null> {
  return new Promise((resolve) => {
    let settled = false;
    let unsub: (() => void) | null = null;

    const finish = (user: AuthUser | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        unsub?.();
      } catch {
        // ignore
      }
      resolve(user);
    };

    const timer = setTimeout(() => {
      void loadFirebaseAuthUser().then((user) => finish(user));
    }, timeoutMs);

    unsub = subscribeFirebaseAuth((user) => {
      // 最初のコールバック（復元完了 or 未ログイン確定）で決める
      finish(user);
    });

    // すでに currentUser がある場合は即確定
    void loadFirebaseAuthUser().then((user) => {
      if (user) finish(user);
    });
  });
}

/** Firebase Auth の状態変化を購読。戻り値は unsubscribe。 */
export function subscribeFirebaseAuth(
  onChange: (user: AuthUser | null) => void,
): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    try {
      if (Platform.OS === 'web') {
        const { getAuth, onAuthStateChanged } = await import('firebase/auth');
        const { getFirebaseJsApp, isFirebaseWebConfigured } = await import(
          '@/lib/firebaseApp'
        );
        if (!isFirebaseWebConfigured() || cancelled) return;
        unsub = onAuthStateChanged(getAuth(getFirebaseJsApp()), (user) => {
          if (!user) {
            onChange(null);
            return;
          }
          onChange(
            authUserFromFirebaseUser(
              user,
              inferProvider(user.providerData, user.uid),
            ),
          );
        });
        return;
      }

      if (!loadFirebaseAuthModular() || cancelled) return;
      unsub = subscribeNativeFirebaseAuth((user) => {
        if (!user) {
          onChange(null);
          return;
        }
        onChange(
          authUserFromFirebaseUser(
            user,
            inferProvider(user.providerData, user.uid),
          ),
        );
      });
    } catch (error) {
      if (__DEV__) {
        console.warn('[auth] subscribeFirebaseAuth', error);
      }
    }
  })();

  return () => {
    cancelled = true;
    unsub?.();
  };
}

export async function signOutFirebaseAuth(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      const { getAuth, signOut } = await import('firebase/auth');
      const { getFirebaseJsApp, isFirebaseWebConfigured } = await import(
        '@/lib/firebaseApp'
      );
      if (!isFirebaseWebConfigured()) return;
      await signOut(getAuth(getFirebaseJsApp()));
      return;
    }

    await signOutNativeFirebaseAuth();

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleSignin } =
        require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
      if (GoogleSignin.getCurrentUser?.()) {
        await GoogleSignin.signOut();
      }
    } catch {
      // ignore
    }

    try {
      const Line = (
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@xmartlabs/react-native-line') as typeof import('@xmartlabs/react-native-line')
      ).default;
      await Line.logout();
    } catch {
      // ignore
    }

    try {
      const { clearPersistedLineWebSession } = await import(
        '@/lib/firebaseLineAuth'
      );
      clearPersistedLineWebSession();
    } catch {
      // ignore
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] signOutFirebaseAuth', error);
    }
  }
}
