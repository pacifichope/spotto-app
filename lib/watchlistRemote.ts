import i18n from '@/lib/i18n';
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
    return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };

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
        error: error.message || i18n.t('errors.watchlistFetchFailed'),
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
          : i18n.t('errors.watchlistFetchFailed'),
    };
  }
}

export async function addWatchlistRemote(
  eventId: string,
): Promise<WatchlistRemoteResult<void>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };
  }
  if (!isRemoteEventId(eventId)) {
    return { ok: false, error: i18n.t('errors.cloudSyncUnavailable') };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };

  const userId = await resolveAuthUserId();
  if (!userId) {
    return { ok: false, error: i18n.t('errors.loginRequired') };
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
        error: error.message || i18n.t('errors.watchlistAddFailed'),
      };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : i18n.t('errors.watchlistAddFailed'),
    };
  }
}

export async function removeWatchlistRemote(
  eventId: string,
): Promise<WatchlistRemoteResult<void>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };
  }
  if (!isRemoteEventId(eventId)) {
    return { ok: false, error: i18n.t('errors.cloudSyncUnavailable') };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };

  const userId = await resolveAuthUserId();
  if (!userId) {
    return { ok: false, error: i18n.t('errors.loginRequired') };
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
        error: error.message || i18n.t('errors.watchlistRemoveFailed'),
      };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : i18n.t('errors.watchlistRemoveFailed'),
    };
  }
}
