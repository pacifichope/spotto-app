import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';

import { apiBaseUrl } from '@/lib/env';

function firebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };
}

export function getFirebaseApp(): FirebaseApp {
  const config = firebaseConfig();
  if (!config.apiKey || !config.projectId) {
    throw new Error('Firebase Web の環境変数が未設定です');
  }
  return getApps()[0] ?? initializeApp(config);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function watchAuth(onChange: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), onChange);
}

export async function signOutFirebase(): Promise<void> {
  await signOut(getFirebaseAuth());
}

export async function signInWithGoogle(): Promise<User> {
  const auth = getFirebaseAuth();
  const credential = await signInWithPopup(auth, new GoogleAuthProvider());
  return credential.user;
}

export async function signInWithApple(): Promise<User> {
  const auth = getFirebaseAuth();
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

/**
 * LINE は既存 API に認可コードまたはアクセストークンを渡し、
 * Firebase Custom Token で同じユーザーになる。
 */
export async function signInWithLineToken(input: {
  accessToken?: string;
  idToken?: string;
  code?: string;
  redirectUri?: string;
}): Promise<User> {
  const base = apiBaseUrl();
  if (!base) throw new Error('NEXT_PUBLIC_API_BASE_URL が未設定です');
  const response = await fetch(`${base}/auth/line-firebase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as { customToken?: string; error?: string };
  if (!response.ok || !data.customToken) {
    throw new Error(data.error || 'LINE ログインに失敗しました');
  }
  const credential = await signInWithCustomToken(getFirebaseAuth(), data.customToken);
  return credential.user;
}

/** Supabase RLS が authenticated と認めるまで、既存 API でクレームを付与して取り直す。 */
export async function idTokenWithAuthenticatedRole(user: User): Promise<string> {
  const first = await user.getIdToken();
  const base = apiBaseUrl();
  if (!base) return first;
  await fetch(`${base}/auth/firebase-ensure-claims`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${first}` },
  });
  return user.getIdToken(true);
}
