import type { ChatHides } from '@/lib/chatHides';
import { resolveAuthUserId } from '@/lib/eventsRemote';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type ChatThreadHideRow = {
  thread_id: string;
  hidden_at: string;
};

function rowToMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : 0;
}

/** サーバー上の非表示マップを取得（失敗時は空） */
export async function fetchChatThreadHides(): Promise<ChatHides> {
  if (!isSupabaseConfigured()) return {};
  const client = getSupabaseClient();
  if (!client) return {};

  const userId = await resolveAuthUserId();
  if (!userId) return {};

  try {
    const { data, error } = await client
      .from('chat_thread_hides')
      .select('thread_id, hidden_at')
      .eq('user_id', userId);

    if (error) {
      if (__DEV__) {
        console.warn('[chatHidesRemote] fetch failed', error.message);
      }
      return {};
    }

    const next: ChatHides = {};
    for (const row of (data as ChatThreadHideRow[] | null) ?? []) {
      const id = String(row.thread_id || '').trim();
      const at = rowToMs(row.hidden_at);
      if (!id || at <= 0) continue;
      next[id] = at;
    }
    return next;
  } catch (error) {
    if (__DEV__) {
      console.warn('[chatHidesRemote] fetch threw', error);
    }
    return {};
  }
}

/** スレッドを自分だけ非表示にする（メッセージは削除しない） */
export async function upsertChatThreadHide(
  threadId: string,
  hiddenAtMs: number,
): Promise<boolean> {
  const id = String(threadId || '').trim();
  const at = Math.floor(Number(hiddenAtMs) || 0);
  if (!id || at <= 0) return false;
  if (!isSupabaseConfigured()) return false;

  const client = getSupabaseClient();
  if (!client) return false;

  const userId = await resolveAuthUserId();
  if (!userId) return false;

  const iso = new Date(at).toISOString();
  try {
    const { error } = await client.from('chat_thread_hides').upsert(
      {
        user_id: userId,
        thread_id: id,
        hidden_at: iso,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,thread_id' },
    );
    if (error) {
      if (__DEV__) {
        console.warn('[chatHidesRemote] upsert failed', error.message);
      }
      return false;
    }
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('[chatHidesRemote] upsert threw', error);
    }
    return false;
  }
}

/** 非表示を解除（一覧に再表示） */
export async function deleteChatThreadHide(threadId: string): Promise<boolean> {
  const id = String(threadId || '').trim();
  if (!id) return false;
  if (!isSupabaseConfigured()) return false;

  const client = getSupabaseClient();
  if (!client) return false;

  const userId = await resolveAuthUserId();
  if (!userId) return false;

  try {
    const { error } = await client
      .from('chat_thread_hides')
      .delete()
      .eq('user_id', userId)
      .eq('thread_id', id);
    if (error) {
      if (__DEV__) {
        console.warn('[chatHidesRemote] delete failed', error.message);
      }
      return false;
    }
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('[chatHidesRemote] delete threw', error);
    }
    return false;
  }
}

/** ローカルとリモートをマージ（新しい hidden_at を採用） */
export function mergeChatHides(local: ChatHides, remote: ChatHides): ChatHides {
  const next: ChatHides = { ...local };
  for (const [id, at] of Object.entries(remote)) {
    const key = id.trim();
    if (!key || !(at > 0)) continue;
    next[key] = Math.max(next[key] ?? 0, at);
  }
  return next;
}
