import { createAuthedSupabase } from '@/lib/supabase';
import { apiBaseUrl } from '@/lib/env';

/**
 * アプリと同じく Edge Function `delete-account` を優先し、失敗時は API を試す。
 */
export async function deleteWebAccount(input: {
  getIdToken: () => Promise<string | null>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await input.getIdToken();
  if (!token) return { ok: false, error: 'ログインしていません' };

  try {
    const supabase = createAuthedSupabase(input.getIdToken);
    const { data, error } = await supabase.functions.invoke('delete-account', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!error) {
      const body = data as { ok?: boolean; error?: string } | null;
      if (body?.ok !== false) return { ok: true };
      if (body?.error) return { ok: false, error: body.error };
    }
  } catch {
    // fall through
  }

  const base = apiBaseUrl();
  if (base) {
    try {
      const response = await fetch(`${base}/auth/delete-account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      if (response.ok) return { ok: true };
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (body?.error) return { ok: false, error: body.error };
    } catch {
      // fall through
    }
  }

  return {
    ok: false,
    error:
      'アカウント削除 API に接続できませんでした。しばらくしてから再試行するか、お問い合わせからご連絡ください。',
  };
}
