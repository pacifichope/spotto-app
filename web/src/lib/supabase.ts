import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseAnonKey, supabaseUrl } from '@/lib/env';

/**
 * 一覧・詳細用。Firebase JWT は付けない。
 * events の SELECT は anon に開いている。
 */
export function createPublicSupabase(): SupabaseClient {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください',
    );
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * 予約の書き込み用。アプリと同じく GoTrue は使わず、Firebase ID トークンを載せる。
 * role=authenticated が無い JWT は Supabase 上 anon 扱いになり、INSERT が拒否される。
 */
export function createAuthedSupabase(getIdToken: () => Promise<string | null>) {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください',
    );
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    accessToken: getIdToken,
  });
}
