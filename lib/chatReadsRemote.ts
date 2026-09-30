import { resolveAuthUserId } from '@/lib/eventsRemote';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import type { ChatReads } from '@/lib/chatReads';

type ChatThreadReadRow = {
  thread_id: string;
  last_read_at: string;
};

function rowToMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : 0;
}

/** サーバー上の既読マップを取得（失敗時は空） */
export async function fetchChatThreadReads(): Promise<ChatReads> {
  if (!isSupabaseConfigured()) return {};
  const client = getSupabaseClient();
  if (!client) return {};

  const userId = await resolveAuthUserId();
  if (!userId) return {};

  try {
    const { data, error } = await client
      .from('chat_thread_reads')
      .select('thread_id, last_read_at')
      .eq('user_id', userId);

    if (error) {
      if (__DEV__) {
        console.warn('[chatReadsRemote] fetch failed', error.message);
      }
      return {};
    }

    const next: ChatReads = {};
    for (const row of (data as ChatThreadReadRow[] | null) ?? []) {
      const id = String(row.thread_id || '').trim();
      const at = rowToMs(row.last_read_at);
      if (!id || at <= 0) continue;
      next[id] = at;
    }
    return next;
  } catch (error) {
    if (__DEV__) {
      console.warn('[chatReadsRemote] fetch threw', error);
    }
    return {};
  }
}

/** 1スレッドの既読時刻を upsert（ローカル先行・失敗は握りつぶし） */
export async function upsertChatThreadRead(
  threadId: string,
  lastReadAtMs: number,
): Promise<boolean> {
  const id = String(threadId || '').trim();
  const at = Math.floor(Number(lastReadAtMs) || 0);
  if (!id || at <= 0) return false;
  if (!isSupabaseConfigured()) return false;

  const client = getSupabaseClient();
  if (!client) return false;

  const userId = await resolveAuthUserId();
  if (!userId) return false;

  const iso = new Date(at).toISOString();
  try {
    const { error } = await client.from('chat_thread_reads').upsert(
      {
        user_id: userId,
        thread_id: id,
        last_read_at: iso,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,thread_id' },
    );
    if (error) {
      if (__DEV__) {
        console.warn('[chatReadsRemote] upsert failed', error.message);
      }
      return false;
    }
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('[chatReadsRemote] upsert threw', error);
    }
    return false;
  }
}

/** 複数スレッドをまとめて既読化 */
export async function upsertChatThreadReadsBulk(
  reads: ChatReads,
): Promise<void> {
  const entries = Object.entries(reads).filter(
    ([id, at]) => id.trim() && Number(at) > 0,
  );
  if (entries.length === 0) return;
  if (!isSupabaseConfigured()) return;

  const client = getSupabaseClient();
  if (!client) return;

  const userId = await resolveAuthUserId();
  if (!userId) return;

  const nowIso = new Date().toISOString();
  const rows = entries.map(([thread_id, at]) => ({
    user_id: userId,
    thread_id,
    last_read_at: new Date(Math.floor(at)).toISOString(),
    updated_at: nowIso,
  }));

  try {
    const { error } = await client
      .from('chat_thread_reads')
      .upsert(rows, { onConflict: 'user_id,thread_id' });
    if (error && __DEV__) {
      console.warn('[chatReadsRemote] bulk upsert failed', error.message);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[chatReadsRemote] bulk upsert threw', error);
    }
  }
}

/** ローカルとリモートをマージ（新しい方を採用） */
export function mergeChatReads(local: ChatReads, remote: ChatReads): ChatReads {
  const next: ChatReads = { ...local };
  for (const [id, at] of Object.entries(remote)) {
    const key = id.trim();
    if (!key || !(at > 0)) continue;
    next[key] = Math.max(next[key] ?? 0, at);
  }
  return next;
}
