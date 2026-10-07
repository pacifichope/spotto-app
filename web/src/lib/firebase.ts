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

import {
  apiBaseUrl,
  firebasePublicConfig,
  isFirebaseConfigured,
  lineChannelId,
  missingFirebaseEnvKeys,
} from '@/lib/env';

const LINE_STATE_KEY = 'spotto_line_oauth_state';
const LINE_REDIRECT_KEY = 'spotto_line_oauth_redirect';

export function getFirebaseApp(): FirebaseApp {
  const config = firebasePublicConfig();
  const missing = missingFirebaseEnvKeys();
  if (missing.length > 0) {
    throw new Error(
      `Firebase Web の環境変数が未設定です（${missing.join(', ')}）。web/.env.local または Vercel の Environment Variables を確認してください。`,
    );
  }
  return getApps()[0] ?? initializeApp(config);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function watchAuth(onChange: (user: User | null) => void) {
  if (!isFirebaseConfigured()) {
    onChange(null);
    return () => {};
  }
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

export function lineLoginRedirectUri() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/auth/line/callback`;
}

/** LINE Login の認可画面へ遷移する。 */
export function beginLineLogin() {
  const channelId = lineChannelId();
  if (!channelId) {
    throw new Error(
      'NEXT_PUBLIC_LINE_CHANNEL_ID が未設定です。web/.env.local に LINE Login のチャネル ID を設定してください。',
    );
  }
  const redirectUri = lineLoginRedirectUri();
  const state =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(LINE_STATE_KEY, state);
  sessionStorage.setItem(LINE_REDIRECT_KEY, redirectUri);

  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', channelId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'profile openid email');
  window.location.assign(url.toString());
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

export async function completeLineLoginFromCallback(params: {
  code: string | null;
  state: string | null;
  error?: string | null;
}): Promise<User> {
  if (params.error) {
    throw new Error(params.error === 'access_denied' ? 'LINE ログインがキャンセルされました' : params.error);
  }
  if (!params.code) throw new Error('LINE の認可コードがありません');
  const expected = sessionStorage.getItem(LINE_STATE_KEY);
  const redirectUri =
    sessionStorage.getItem(LINE_REDIRECT_KEY) || lineLoginRedirectUri();
  if (expected && params.state && expected !== params.state) {
    throw new Error('LINE ログインの state が一致しません');
  }
  sessionStorage.removeItem(LINE_STATE_KEY);
  sessionStorage.removeItem(LINE_REDIRECT_KEY);
  return signInWithLineToken({ code: params.code, redirectUri });
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
