import { isRemoteEventId } from '@/lib/chatsRemote';
import { resolveAuthUserId } from '@/lib/eventsRemote';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type WatchlistRemoteResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function fetchWatchlistEventIds(): Promise<
  WatchlistRemoteResult<string[]>
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  const userId = await resolveAuthUserId();
  if (!userId) {
    return { ok: true, data: [] };
  }

  try {
    const { data, error } = await client
      .from('event_watchlist')
      .select('event_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return {
        ok: false,
        error: error.message || '空き通知リストの取得に失敗しました',
      };
    }

    const ids = (data ?? [])
      .map((row) => String((row as { event_id?: string }).event_id ?? '').trim())
      .filter(Boolean);
    return { ok: true, data: ids };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '空き通知リストの取得に失敗しました',
    };
  }
}

export async function addWatchlistRemote(
  eventId: string,
): Promise<WatchlistRemoteResult<void>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  if (!isRemoteEventId(eventId)) {
    return { ok: false, error: 'このイベントはクラウド同期できません' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  const userId = await resolveAuthUserId();
  if (!userId) {
    return { ok: false, error: 'ログインが必要です' };
  }

  try {
    const { error } = await client.from('event_watchlist').upsert(
      {
        user_id: userId,
        event_id: eventId,
      },
      { onConflict: 'user_id,event_id' },
    );

    if (error) {
      return {
        ok: false,
        error: error.message || '空き通知の登録に失敗しました',
      };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '空き通知の登録に失敗しました',
    };
  }
}

export async function removeWatchlistRemote(
  eventId: string,
): Promise<WatchlistRemoteResult<void>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  if (!isRemoteEventId(eventId)) {
    return { ok: false, error: 'このイベントはクラウド同期できません' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  const userId = await resolveAuthUserId();
  if (!userId) {
    return { ok: false, error: 'ログインが必要です' };
  }

  try {
    const { error } = await client
      .from('event_watchlist')
      .delete()
      .eq('user_id', userId)
      .eq('event_id', eventId);

    if (error) {
      return {
        ok: false,
        error: error.message || '空き通知の解除に失敗しました',
      };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '空き通知の解除に失敗しました',
    };
  }
}
