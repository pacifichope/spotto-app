/**
 * @react-native-firebase/auth のモジュラー API ヘルパー（名前空間 API を避ける）
 *
 * 必ず app 初期化（firebaseNativeInit）の後に Auth を読むこと。
 */
import '@/lib/firebaseNativeInit';

import { NativeModules, Platform } from 'react-native';

import {
  ensureNativeFirebaseApp,
  ensureNativeFirebaseAppSync,
  isNativeFirebaseLinked,
} from '@/lib/firebaseNativeInit';

type FirebaseUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  providerData?: Array<{ providerId?: string | null }>;
  getIdToken?: (forceRefresh?: boolean) => Promise<string>;
};

type AuthInstance = {
  currentUser: FirebaseUser | null;
  signOut: () => Promise<void>;
};

type AuthModular = {
  getAuth: (app?: unknown) => AuthInstance;
  getIdToken: (user: FirebaseUser, forceRefresh?: boolean) => Promise<string>;
  onAuthStateChanged: (
    auth: AuthInstance,
    callback: (user: FirebaseUser | null) => void,
  ) => () => void;
  signOut: (auth: AuthInstance) => Promise<void>;
};

let cached: AuthModular | null | undefined;

export function loadFirebaseAuthModular(): AuthModular | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web') {
    cached = null;
    return null;
  }

  // Auth より先に DEFAULT アプリを用意する
  ensureNativeFirebaseAppSync();

  try {
    if (!isNativeFirebaseLinked()) {
      if (
        !NativeModules.RNFBAppModule &&
        !NativeModules.RNFBAuthModule
      ) {
        cached = null;
        return null;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-firebase/auth') as AuthModular;
    if (!mod?.getAuth || !mod?.getIdToken || !mod?.onAuthStateChanged) {
      cached = null;
      return null;
    }
    cached = mod;
    return mod;
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] loadFirebaseAuthModular failed', error);
    }
    cached = null;
    return null;
  }
}

/** Auth 利用前に DEFAULT アプリ初期化を待つ */
export async function loadFirebaseAuthModularReady(): Promise<AuthModular | null> {
  await ensureNativeFirebaseApp();
  // 初期化後に再 require できるようキャッシュをクリアして再読込
  if (cached === null) cached = undefined;
  return loadFirebaseAuthModular();
}

export function getNativeFirebaseAuth(): AuthInstance | null {
  const mod = loadFirebaseAuthModular();
  if (!mod) return null;
  try {
    return mod.getAuth();
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] getAuth failed (DEFAULT app missing?)', error);
    }
    // 非同期初期化をキックし、次回に備える
    void ensureNativeFirebaseApp();
    return null;
  }
}

export async function getNativeFirebaseAuthReady(): Promise<AuthInstance | null> {
  const mod = await loadFirebaseAuthModularReady();
  if (!mod) return null;
  try {
    return mod.getAuth();
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] getAuth after ensure failed', error);
    }
    return null;
  }
}

export async function getNativeFirebaseIdToken(
  forceRefresh = false,
): Promise<string | null> {
  try {
    await ensureNativeFirebaseApp();
    const mod = loadFirebaseAuthModular();
    const user = mod?.getAuth().currentUser;
    if (!mod || !user) return null;
    return (await mod.getIdToken(user, forceRefresh)) ?? null;
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] getNativeFirebaseIdToken', error);
    }
    return null;
  }
}

export function subscribeNativeFirebaseAuth(
  onChange: (user: FirebaseUser | null) => void,
): () => void {
  let cancelled = false;
  let unsub: (() => void) | null = null;

  void (async () => {
    const mod = await loadFirebaseAuthModularReady();
    if (!mod || cancelled) return;
    try {
      unsub = mod.onAuthStateChanged(mod.getAuth(), onChange);
    } catch (error) {
      if (__DEV__) {
        console.warn('[auth] subscribeNativeFirebaseAuth', error);
      }
    }
  })();

  return () => {
    cancelled = true;
    unsub?.();
  };
}

export async function signOutNativeFirebaseAuth(): Promise<void> {
  const mod = await loadFirebaseAuthModularReady();
  if (!mod) return;
  try {
    const auth = mod.getAuth();
    if (mod.signOut) {
      await mod.signOut(auth);
      return;
    }
    await auth.signOut();
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] signOutNativeFirebaseAuth', error);
    }
  }
}

export type { FirebaseUser };
