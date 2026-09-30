import { isRemoteEventId } from '@/lib/chatsRemote';
import { resolveAuthUserId } from '@/lib/eventsRemote';
import { ensureFirebaseAuthenticatedClaim } from '@/lib/firebaseEnsureClaims';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type FavoritesRemoteResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function logFavoritesError(
  op: 'fetch' | 'add' | 'remove',
  detail: Record<string, unknown>,
) {
  console.error(`[favorites] ${op} failed`, detail);
}

function formatFavoritesError(
  message: string | undefined,
  fallback: string,
): string {
  const raw = String(message || '').trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  if (
    lower.includes('row-level security') ||
    lower.includes('violates row-level security')
  ) {
    return (
      'お気に入りの権限エラーです。event_favorites の RLS を Firebase JWT 向けに更新してください（apply_event_favorites_firebase_rls.sql）。'
    );
  }
  if (
    lower.includes('invalid input syntax for type uuid') ||
    lower.includes('column "user_id" is of type uuid')
  ) {
    return (
      'お気に入りテーブルの user_id が uuid のままです。apply_event_favorites_firebase_rls.sql を適用してください。'
    );
  }
  if (lower.includes('permission denied') || lower.includes('42501')) {
    return (
      'お気に入りテーブルへの権限がありません。GRANT と RLS を確認してください。'
    );
  }
  return raw || fallback;
}

async function prepareFavoritesClient(): Promise<
  | { ok: true; client: NonNullable<ReturnType<typeof getSupabaseClient>>; userId: string }
  | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  try {
    await ensureFirebaseAuthenticatedClaim();
  } catch (error) {
    if (__DEV__) {
      console.warn('[favorites] ensureFirebaseAuthenticatedClaim', error);
    }
  }

  const userId = await resolveAuthUserId();
  if (!userId) {
    return { ok: false, error: 'ログインが必要です' };
  }
  return { ok: true, client, userId };
}

export async function fetchFavoriteEventIds(): Promise<
  FavoritesRemoteResult<string[]>
> {
  const prepared = await prepareFavoritesClient();
  if (!prepared.ok) {
    if (prepared.error === 'ログインが必要です') {
      return { ok: true, data: [] };
    }
    return prepared;
  }
  const { client, userId } = prepared;

  try {
    const { data, error } = await client
      .from('event_favorites')
      .select('event_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logFavoritesError('fetch', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId,
      });
      return {
        ok: false,
        error: formatFavoritesError(
          error.message,
          'お気に入りの取得に失敗しました',
        ),
      };
    }

    const ids = (data ?? [])
      .map((row) => String((row as { event_id?: string }).event_id ?? '').trim())
      .filter(Boolean);
    return { ok: true, data: ids };
  } catch (error) {
    logFavoritesError('fetch', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'お気に入りの取得に失敗しました',
    };
  }
}

export async function addFavoriteRemote(
  eventId: string,
): Promise<FavoritesRemoteResult<void>> {
  if (!isRemoteEventId(eventId)) {
    return { ok: false, error: 'このイベントはクラウド同期できません' };
  }
  const prepared = await prepareFavoritesClient();
  if (!prepared.ok) return prepared;
  const { client, userId } = prepared;

  try {
    const { error } = await client.from('event_favorites').upsert(
      {
        user_id: userId,
        event_id: eventId,
      },
      { onConflict: 'user_id,event_id', ignoreDuplicates: true },
    );

    if (error) {
      // upsert が UPDATE 権限不足の場合は insert にフォールバック
      const needsInsertFallback =
        String(error.message || '')
          .toLowerCase()
          .includes('permission') || error.code === '42501';

      if (needsInsertFallback) {
        const inserted = await client.from('event_favorites').insert({
          user_id: userId,
          event_id: eventId,
        });
        if (
          inserted.error &&
          inserted.error.code !== '23505' // unique_violation = 既に登録済み
        ) {
          logFavoritesError('add', {
            code: inserted.error.code,
            message: inserted.error.message,
            details: inserted.error.details,
            hint: inserted.error.hint,
            userId,
            eventId,
            via: 'insert-fallback',
          });
          return {
            ok: false,
            error: formatFavoritesError(
              inserted.error.message,
              'お気に入りの保存に失敗しました',
            ),
          };
        }
        return { ok: true, data: undefined };
      }

      logFavoritesError('add', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId,
        eventId,
      });
      return {
        ok: false,
        error: formatFavoritesError(
          error.message,
          'お気に入りの保存に失敗しました',
        ),
      };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    logFavoritesError('add', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      eventId,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'お気に入りの保存に失敗しました',
    };
  }
}

export async function removeFavoriteRemote(
  eventId: string,
): Promise<FavoritesRemoteResult<void>> {
  if (!isRemoteEventId(eventId)) {
    return { ok: false, error: 'このイベントはクラウド同期できません' };
  }
  const prepared = await prepareFavoritesClient();
  if (!prepared.ok) return prepared;
  const { client, userId } = prepared;

  try {
    const { error } = await client
      .from('event_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('event_id', eventId);

    if (error) {
      logFavoritesError('remove', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId,
        eventId,
      });
      return {
        ok: false,
        error: formatFavoritesError(
          error.message,
          'お気に入りの削除に失敗しました',
        ),
      };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    logFavoritesError('remove', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      eventId,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'お気に入りの削除に失敗しました',
    };
  }
}
