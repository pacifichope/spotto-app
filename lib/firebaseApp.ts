import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';

import { readPublicEnv } from '@/lib/env';

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
};

export function readFirebaseWebConfig(): FirebaseWebConfig | null {
  const apiKey = readPublicEnv('EXPO_PUBLIC_FIREBASE_API_KEY');
  const authDomain = readPublicEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN');
  const projectId = readPublicEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  const appId = readPublicEnv('EXPO_PUBLIC_FIREBASE_APP_ID');
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: readPublicEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') || undefined,
    messagingSenderId:
      readPublicEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') || undefined,
    measurementId: readPublicEnv('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID') || undefined,
  };
}

export function isFirebaseWebConfigured() {
  return Boolean(readFirebaseWebConfig());
}

/** Web / JS SDK 用 Firebase App（ネイティブは @react-native-firebase を使用） */
export function getFirebaseJsApp(): FirebaseApp {
  const config = readFirebaseWebConfig();
  if (!config) {
    throw new Error(
      'Firebase が未設定です。EXPO_PUBLIC_FIREBASE_API_KEY 等を .env に設定してください。',
    );
  }
  if (getApps().length > 0) return getApp();
  return initializeApp(config);
}
