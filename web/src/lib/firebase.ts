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

import { assertAuthFriendlyOrigin, formatAuthError } from '@/lib/auth-errors';
import {
  apiBaseUrl,
  firebasePublicConfig,
  isFirebaseConfigured,
  lineChannelId,
  lineRedirectUriFromEnv,
  missingFirebaseEnvKeys,
  siteUrl,
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
  // authDomain は Firebase プロジェクトの *.firebaseapp.com。ページの Vercel ドメインとは別物。
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
  assertAuthFriendlyOrigin();
  try {
    const auth = getFirebaseAuth();
    const credential = await signInWithPopup(auth, new GoogleAuthProvider());
    return credential.user;
  } catch (error) {
    throw new Error(formatAuthError(error));
  }
}

export async function signInWithApple(): Promise<User> {
  assertAuthFriendlyOrigin();
  try {
    const auth = getFirebaseAuth();
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    // popup の認可ドメインは「いま開いているページの hostname」。
    // Firebase Console → Authentication → Settings → Authorized domains に追加する。
    const credential = await signInWithPopup(auth, provider);
    return credential.user;
  } catch (error) {
    throw new Error(formatAuthError(error));
  }
}

/**
 * LINE Login の redirect_uri。
 * authorize と token 交換で同一文字列であること、かつ LINE Developers の Callback URL と一致すること。
 *
 * Web の LINE は Supabase Auth（/auth/v1/callback）ではなく
 * `/auth/line/callback` → API `/auth/line-firebase` → Firebase Custom Token。
 *
 * 既定は「いま開いているオリジン」+ `/auth/line/callback`（sessionStorage と同一オリジンを保つ）。
 * LINE Developers に登録した URL とずらしたいときだけ NEXT_PUBLIC_LINE_REDIRECT_URI を使う
 * （その場合も、ユーザーはその origin でサイトを開いている必要がある）。
 */
export function lineLoginRedirectUri() {
  const fromEnv = lineRedirectUriFromEnv();
  if (fromEnv) return fromEnv;

  if (typeof window !== 'undefined') {
    return `${window.location.origin.replace(/\/+$/, '')}/auth/line/callback`;
  }

  const site = siteUrl().replace(/\/+$/, '');
  return `${site}/auth/line/callback`;
}

function hostnameIsPrivateIp(hostname: string): boolean {
  return (
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)
  );
}

/** LINE Login の認可画面へ遷移する。 */
export function beginLineLogin() {
  assertAuthFriendlyOrigin();
  const channelId = lineChannelId();
  if (!channelId) {
    throw new Error(
      'NEXT_PUBLIC_LINE_CHANNEL_ID が未設定です。web/.env.local に LINE Login のチャネル ID を設定してください。',
    );
  }
  const redirectUri = lineLoginRedirectUri();
  if (!redirectUri.startsWith('http')) {
    throw new Error('LINE redirect_uri を組み立てられませんでした');
  }

  // プライベート IP で開いていると LINE Callback 未登録になりやすい
  if (typeof window !== 'undefined' && hostnameIsPrivateIp(window.location.hostname)) {
    throw new Error(
      `LINE ログインは LAN IP（${window.location.hostname}）ではなく http://localhost:${window.location.port || '3456'} で開くか、その URL を LINE Developers の Callback URL に登録してください。使用予定の redirect_uri: ${redirectUri}`,
    );
  }

  const state =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(LINE_STATE_KEY, state);
  sessionStorage.setItem(LINE_REDIRECT_KEY, redirectUri);

  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', channelId);
  // searchParams.set が 1 回だけ URL エンコードする（二重エンコードしない）
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
    throw new Error(
      formatAuthError(
        data.error || `LINE ログインに失敗しました（HTTP ${response.status}）`,
      ),
    );
  }
  const credential = await signInWithCustomToken(getFirebaseAuth(), data.customToken);
  return credential.user;
}

export async function completeLineLoginFromCallback(params: {
  code: string | null;
  state: string | null;
  error?: string | null;
  errorDescription?: string | null;
}): Promise<User> {
  if (params.error) {
    const detail = params.errorDescription || params.error;
    throw new Error(
      formatAuthError(
        params.error === 'access_denied'
          ? 'LINE ログインがキャンセルされました'
          : detail,
      ),
    );
  }
  if (!params.code) throw new Error('LINE の認可コードがありません');
  const expected = sessionStorage.getItem(LINE_STATE_KEY);
  // authorize 時に保存した redirect_uri を token 交換でもそのまま使う（一字一句一致が必要）
  const redirectUri =
    sessionStorage.getItem(LINE_REDIRECT_KEY) || lineLoginRedirectUri();
  if (expected && params.state && expected !== params.state) {
    throw new Error('LINE ログインの state が一致しません');
  }
  sessionStorage.removeItem(LINE_STATE_KEY);
  sessionStorage.removeItem(LINE_REDIRECT_KEY);
  try {
    return await signInWithLineToken({ code: params.code, redirectUri });
  } catch (error) {
    throw new Error(formatAuthError(error));
  }
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
