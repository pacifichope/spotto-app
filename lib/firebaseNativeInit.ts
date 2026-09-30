/**
 * ネイティブで @react-native-firebase/app を確実に初期化する。
 *
 * - Auth より先に app を require する（DEFAULT アプリ未作成エラー対策）
 * - NativeModules が空でも TurboModule / 直接 require を試す
 * - google-services 由来の DEFAULT が無い場合は EXPO_PUBLIC_FIREBASE_* で初期化
 *
 * Web は firebaseNativeInit.web.ts（no-op）。
 */
import { NativeModules, Platform } from 'react-native';

import { readPublicEnv } from '@/lib/env';

// RNFB v22+ namespaced deprecation ログを抑止（Auth 読込より前に必須）
(globalThis as { RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS?: boolean })
  .RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS = true;

type RNFBAppModular = {
  getApps: () => unknown[];
  getApp: (name?: string) => unknown;
  initializeApp: (
    options: Record<string, string>,
    configOrName?: string | { name?: string },
  ) => Promise<unknown> | unknown;
};

let appModule: RNFBAppModular | null | undefined;
let initPromise: Promise<boolean> | null = null;
let initSucceeded = false;

function turboHasModule(name: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TurboModuleRegistry } = require('react-native') as {
      TurboModuleRegistry?: { get?: (n: string) => unknown };
    };
    return TurboModuleRegistry?.get?.(name) != null;
  } catch {
    return false;
  }
}

/** ネイティブ Firebase モジュールがリンクされているか */
export function isNativeFirebaseLinked(): boolean {
  if (Platform.OS === 'web') return false;
  if (NativeModules.RNFBAppModule || NativeModules.RNFBAuthModule) return true;
  if (turboHasModule('RNFBAppModule') || turboHasModule('RNFBAuthModule')) {
    return true;
  }
  // NativeModules が空でもパッケージがリンクされている場合があるため require を試す
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@react-native-firebase/app');
    return true;
  } catch {
    return false;
  }
}

function loadAppModular(): RNFBAppModular | null {
  if (appModule !== undefined) return appModule;
  if (Platform.OS === 'web') {
    appModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-firebase/app') as RNFBAppModular;
    if (!mod?.getApps || !mod?.initializeApp) {
      appModule = null;
      return null;
    }
    appModule = mod;
    return mod;
  } catch (error) {
    if (__DEV__) {
      console.warn('[firebase] @react-native-firebase/app require failed', error);
    }
    appModule = null;
    return null;
  }
}

function buildNativeFirebaseOptions(): Record<string, string> | null {
  const apiKey = readPublicEnv('EXPO_PUBLIC_FIREBASE_API_KEY');
  const appId = readPublicEnv('EXPO_PUBLIC_FIREBASE_APP_ID');
  const projectId = readPublicEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  const messagingSenderId = readPublicEnv(
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  );
  const storageBucket = readPublicEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET');
  if (!apiKey || !appId || !projectId || !messagingSenderId) return null;

  // RNFB initializeApp は databaseURL / storageBucket を必須バリデーションする
  const databaseURL =
    readPublicEnv('EXPO_PUBLIC_FIREBASE_DATABASE_URL') ||
    `https://${projectId}-default-rtdb.firebaseio.com`;

  return {
    apiKey,
    appId,
    projectId,
    messagingSenderId,
    storageBucket: storageBucket || `${projectId}.appspot.com`,
    databaseURL,
  };
}

/**
 * DEFAULT アプリが無ければ EXPO_PUBLIC_FIREBASE_* で初期化する。
 * Auth / getIdToken の直前にも呼べるよう同期＋非同期の両方を用意。
 */
export async function ensureNativeFirebaseApp(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (initSucceeded) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const mod = loadAppModular();
    if (!mod) {
      if (__DEV__) {
        console.warn(
          '[firebase] ネイティブモジュール未リンクです。google-services 配置後に Dev Client を再ビルドしてください（Expo Go では動作しません）。',
        );
      }
      return false;
    }

    try {
      if (mod.getApps().length > 0) {
        initSucceeded = true;
        return true;
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[firebase] getApps failed, will try initializeApp', error);
      }
    }

    const options = buildNativeFirebaseOptions();
    if (!options) {
      if (__DEV__) {
        console.warn(
          '[firebase] DEFAULT アプリが無く、EXPO_PUBLIC_FIREBASE_* も不足しています。google-services.json と .env を確認してください。',
        );
      }
      return false;
    }

    try {
      const result = mod.initializeApp(options);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        await (result as Promise<unknown>);
      }
      initSucceeded = mod.getApps().length > 0;
      if (__DEV__) {
        console.log('[firebase] initializeApp fallback', {
          ok: initSucceeded,
          projectId: options.projectId,
        });
      }
      return initSucceeded;
    } catch (error) {
      // 既に存在する競合は成功扱い
      const msg = error instanceof Error ? error.message : String(error);
      if (/already exists/i.test(msg)) {
        initSucceeded = true;
        return true;
      }
      if (__DEV__) {
        console.warn('[firebase] initializeApp failed', error);
      }
      return false;
    }
  })();

  try {
    return await initPromise;
  } finally {
    if (!initSucceeded) {
      // 失敗時は再試行可能にする
      initPromise = null;
    }
  }
}

/**
 * 同期側: app モジュールを確実に require し、既に DEFAULT があれば true。
 * initializeApp の完了待ちは ensureNativeFirebaseApp() を使う。
 */
export function ensureNativeFirebaseAppSync(): boolean {
  if (Platform.OS === 'web') return false;
  if (initSucceeded) return true;

  const mod = loadAppModular();
  if (!mod) return false;

  try {
    if (mod.getApps().length > 0) {
      initSucceeded = true;
      return true;
    }
  } catch {
    // continue — kick off async init
  }

  // 非同期初期化を起動（呼び出し側は可能な限り await ensureNativeFirebaseApp）
  void ensureNativeFirebaseApp();
  return false;
}

// エントリ import 時点で同期 require ＋ 必要なら非同期初期化を開始
ensureNativeFirebaseAppSync();
void ensureNativeFirebaseApp();

export {};
