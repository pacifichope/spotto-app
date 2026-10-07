'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';

import { isFirebaseConfigured, missingFirebaseEnvKeys } from '@/lib/env';
import {
  beginLineLogin,
  signInWithApple,
  signInWithGoogle,
  signOutFirebase,
  watchAuth,
} from '@/lib/firebase';

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  busy: boolean;
  error: string;
  configured: boolean;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  signInLine: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyTimerRef = useRef<number | null>(null);
  const configured = isFirebaseConfigured();

  const clearBusy = useCallback(() => {
    if (busyTimerRef.current != null) {
      window.clearTimeout(busyTimerRef.current);
      busyTimerRef.current = null;
    }
    setBusy(false);
  }, []);

  const startBusy = useCallback(() => {
    setBusy(true);
    setError('');
    if (busyTimerRef.current != null) window.clearTimeout(busyTimerRef.current);
    // ポップアップ放置などで Promise が返らない場合の保険
    busyTimerRef.current = window.setTimeout(() => {
      setBusy(false);
      busyTimerRef.current = null;
    }, 60_000);
  }, []);

  useEffect(() => {
    const missing = missingFirebaseEnvKeys();
    if (missing.length > 0) {
      setError(`Firebase Web の環境変数が未設定です（${missing.join(', ')}）`);
      setReady(true);
      return;
    }
    try {
      const unsub = watchAuth((next) => {
        setUser(next);
        setReady(true);
        // ログイン成功・ログアウト後もローディングを残さない
        clearBusy();
      });
      const timeout = window.setTimeout(() => setReady(true), 8000);
      return () => {
        window.clearTimeout(timeout);
        unsub();
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '認証の初期化に失敗しました');
      setReady(true);
      clearBusy();
    }
    return undefined;
  }, [configured, clearBusy]);

  // LINE 認可画面からブラウザバック（bfcache）すると busy が残ることがある
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) clearBusy();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      if (busyTimerRef.current != null) window.clearTimeout(busyTimerRef.current);
    };
  }, [clearBusy]);

  const runSignIn = useCallback(
    async (action: () => void | Promise<unknown>, fallback: string) => {
      startBusy();
      try {
        await action();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : fallback);
      } finally {
        // 成功・キャンセル・エラー・LINE 遷移直前のいずれでも必ず解除
        clearBusy();
      }
    },
    [startBusy, clearBusy],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      busy,
      error,
      configured,
      clearError: () => setError(''),
      signInGoogle: () => runSignIn(() => signInWithGoogle(), 'ログインに失敗しました'),
      signInApple: () => runSignIn(() => signInWithApple(), 'ログインに失敗しました'),
      signInLine: () =>
        runSignIn(() => {
          beginLineLogin();
        }, 'LINE ログインに失敗しました'),
      signOut: () =>
        runSignIn(async () => {
          await signOutFirebase();
        }, 'ログアウトに失敗しました'),
    }),
    [user, ready, busy, error, configured, runSignIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth は AuthProvider 内で使ってください');
  return value;
}
