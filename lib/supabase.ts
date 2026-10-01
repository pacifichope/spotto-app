import '@/lib/polyfills/webcrypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { readPublicEnv } from '@/lib/env';
import { ensureFirebaseAuthenticatedClaim } from '@/lib/firebaseEnsureClaims';
import {
  firebaseJwtHasAuthenticatedRole,
  getFirebaseIdToken,
  peekFirebaseJwtClaims,
} from '@/lib/firebaseIdToken';

export function getSupabaseUrl() {
  let url = readPublicEnv('EXPO_PUBLIC_SUPABASE_URL');
  if (!url) return '';
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/auth\/v1$/i, '');
  return url;
}

/**
 * クライアント用キー（Publishable / 旧 anon）。
 * 環境変数名は EXPO_PUBLIC_SUPABASE_ANON_KEY を正とし、
 * 新しい命名の EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY も受け付ける。
 */
export function getSupabaseAnonKey() {
  return (
    readPublicEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY') ||
    readPublicEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  );
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

/** 開発用: EXPO_PUBLIC_AUTH_MOCK=1 で SNS ログインをダミー成功にする（本番では無効） */
export function isAuthMockEnabled() {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return false;
  const raw = readPublicEnv('EXPO_PUBLIC_AUTH_MOCK').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

let cached: SupabaseClient | null | undefined;
let lastLoggedRole: string | null = null;

function logFirebaseJwt(token: string, source: string) {
  if (!__DEV__) return;
  const claims = peekFirebaseJwtClaims(token);
  const role =
    typeof claims?.role === 'string'
      ? claims.role
      : claims?.role == null
        ? null
        : String(claims.role);
  const roleKey = role ?? 'null';
  // role が変わったときだけ出す（authenticated 到達時を確実に観測）
  if (roleKey === lastLoggedRole) return;
  lastLoggedRole = roleKey;
  console.log('[supabase] firebase jwt', {
    platform: Platform.OS,
    sub: claims?.sub ?? null,
    role,
    hasAuthenticatedRole: firebaseJwtHasAuthenticatedRole(token),
    source,
  });
}

/**
 * Firebase ID Token を取得し、role=authenticated を確保してから返す。
 * Supabase Third-Party Auth では role クレームが無いと anon 扱いになり 42501 になる。
 */
export async function resolveFirebaseAccessToken(): Promise<string | null> {
  try {
    let token = await getFirebaseIdToken(false);
    if (!token) return null;

    if (!firebaseJwtHasAuthenticatedRole(token)) {
      logFirebaseJwt(token, 'before-ensure');
      const ok = await ensureFirebaseAuthenticatedClaim();
      // ensure 内でも force refresh 済みだが、最新を取り直す
      token = (await getFirebaseIdToken(ok)) ?? token;
    }

    if (token) {
      logFirebaseJwt(
        token,
        firebaseJwtHasAuthenticatedRole(token) ? 'ready' : 'missing-role',
      );
    }

    return token;
  } catch (error) {
    if (__DEV__) {
      console.warn('[supabase] resolveFirebaseAccessToken', error);
    }
    return null;
  }
}

/**
 * Realtime WebSocket に Firebase JWT を載せる。
 * accessToken オプションは REST 向けで、Realtime は明示 setAuth が必要。
 * role=authenticated 無しだと RLS で INSERT イベントが届かない。
 */
export async function authorizeSupabaseRealtime(
  client?: SupabaseClient | null,
): Promise<boolean> {
  const target = client ?? getSupabaseClient();
  if (!target) return false;
  try {
    const token = await resolveFirebaseAccessToken();
    if (!token) return false;
    await target.realtime.setAuth(token);
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('[supabase] realtime setAuth failed', error);
    }
    return false;
  }
}

/**
 * DB / Storage 用 Supabase クライアント。
 * GoTrue セッション無効。Authorization は Firebase ID Token を毎回動的付与。
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    cached = null;
    return cached;
  }

  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    accessToken: resolveFirebaseAccessToken,
  });
  return cached;
}

/** 設定済み前提のクライアント。未設定ならエラー。 */
export function getSupabase(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase が未設定です。EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を確認してください。',
    );
  }
  return client;
}

/** 互換用。未設定時は getSupabase() が throw する。 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabase();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
