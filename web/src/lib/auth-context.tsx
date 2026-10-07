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

import {
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
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      return watchAuth((next) => {
        setUser(next);
        setReady(true);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '認証の初期化に失敗しました');
      setReady(true);
      return undefined;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      busy,
      error,
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
    [user, ready, busy, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth は AuthProvider 内で使ってください');
  return value;
}
