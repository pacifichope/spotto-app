'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
  // Providers が注入した runtime 設定を含めて判定する
  const configured = isFirebaseConfigured();

  useEffect(() => {
    const missing = missingFirebaseEnvKeys();
    if (missing.length > 0) {
      setError(`Firebase Web の環境変数が未設定です（${missing.join(', ')}）`);
      setReady(true);
      return;
    }
    let settled = false;
    const finish = (next: User | null) => {
      if (settled) return;
      settled = true;
      setUser(next);
      setReady(true);
    };
    try {
      const unsub = watchAuth(finish);
      // onAuthStateChanged が返らない場合でも UI を止めない
      const timeout = window.setTimeout(() => finish(null), 8000);
      return () => {
        window.clearTimeout(timeout);
        unsub();
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '認証の初期化に失敗しました');
      setReady(true);
    }
    return undefined;
  }, [configured]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      busy,
      error,
      configured,
      clearError: () => setError(''),
      signInGoogle: async () => {
        setBusy(true);
        setError('');
        try {
          await signInWithGoogle();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'ログインに失敗しました');
        } finally {
          setBusy(false);
        }
      },
      signInApple: async () => {
        setBusy(true);
        setError('');
        try {
          await signInWithApple();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'ログインに失敗しました');
        } finally {
          setBusy(false);
        }
      },
      signInLine: async () => {
        setBusy(true);
        setError('');
        try {
          beginLineLogin();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'LINE ログインに失敗しました');
          setBusy(false);
        }
      },
      signOut: async () => {
        setBusy(true);
        setError('');
        try {
          await signOutFirebase();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'ログアウトに失敗しました');
        } finally {
          setBusy(false);
        }
      },
    }),
    [user, ready, busy, error, configured],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth は AuthProvider 内で使ってください');
  return value;
}
