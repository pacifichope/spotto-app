import { getApiBaseUrl } from '@/lib/env';
import { getFirebaseIdToken } from '@/lib/firebaseIdToken';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Firebase Auth ユーザー + 関連 DB 行を削除する。
 * 優先: Edge Function `delete-account`（Firebase JWT）
 * フォールバック: EXPO_PUBLIC_API_BASE_URL の POST /account/delete
 */
export async function deleteRemoteSupabaseAccount(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const accessToken = await getFirebaseIdToken(false);
  if (!accessToken) {
    return {
      ok: false,
      error: 'セッションが無効です。再ログインしてから退会してください。',
    };
  }

  // 1) 自分の public データを掃除（RPC があれば）
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabaseClient();
      if (client) {
        await client.rpc('delete_own_app_data');
      }
    } catch {
      // 未適用でも続行
    }

    // 2) Edge Function
    try {
      const client = getSupabaseClient();
      if (client) {
        const { data, error } = await client.functions.invoke('delete-account', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!error) {
          const body = data as { ok?: boolean; error?: string } | null;
          if (body && body.ok === false) {
            return {
              ok: false,
              error: body.error || 'アカウントの削除に失敗しました。',
            };
          }
          return { ok: true };
        }
        if (__DEV__) {
          console.warn('[account] edge delete-account failed', error.message);
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[account] edge delete-account', error);
      }
    }
  }

  // 3) 自前 API（Firebase Admin で Auth ユーザー削除）
  const apiBase = getApiBaseUrl().replace(/\/$/, '');
  if (apiBase) {
    try {
      const response = await fetch(`${apiBase}/account/delete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || body.ok === false) {
        return {
          ok: false,
          error:
            body.error ||
            `アカウントの削除に失敗しました（HTTP ${response.status}）。`,
        };
      }
      return { ok: true };
    } catch (error) {
      if (__DEV__) {
        console.warn('[account] api /account/delete', error);
      }
      return {
        ok: false,
        error:
          'アカウント削除サーバーに接続できませんでした。時間をおいて再度お試しください。',
      };
    }
  }

  return {
    ok: false,
    error:
      'アカウント削除 API が未設定です。API サーバーを起動するか、Edge Function「delete-account」をデプロイしてください。',
  };
}
