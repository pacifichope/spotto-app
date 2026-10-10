import { absoluteImageUrl } from '@/lib/eventSeo';
import { createAuthedSupabase } from '@/lib/supabase';

export type BlockedUser = {
  id: string;
  name: string;
  imageUri?: string;
  blockedAt: number;
};

type BlockRow = {
  blocked_id?: string;
  blocked_name?: string | null;
  blocked_image_uri?: string | null;
  created_at?: string | null;
};

type ProfileRow = {
  id?: string;
  display_name?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
};

function mapBlockRow(row: BlockRow): BlockedUser | null {
  const id = String(row.blocked_id || '').trim();
  if (!id) return null;
  const name = String(row.blocked_name || '').trim() || 'ユーザー';
  const imageUri =
    absoluteImageUrl(row.blocked_image_uri ?? null) ||
    String(row.blocked_image_uri || '').trim() ||
    undefined;
  const at = row.created_at ? Date.parse(row.created_at) : Date.now();
  return {
    id,
    name,
    imageUri: imageUri || undefined,
    blockedAt: Number.isFinite(at) ? at : Date.now(),
  };
}

/** 自分がブロックしているユーザー一覧 */
export async function fetchBlockedUsers(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<BlockedUser[]> {
  const uid = input.userId.trim();
  if (!uid) return [];

  const supabase = createAuthedSupabase(input.getIdToken);
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id, blocked_name, blocked_image_uri, created_at')
    .eq('blocker_id', uid)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const list = (data as BlockRow[] | null ?? [])
    .map(mapBlockRow)
    .filter((item): item is BlockedUser => item != null);

  // 名前・画像が薄い行は profiles で補完
  const needProfile = list
    .filter((item) => !item.imageUri || item.name === 'ユーザー' || item.name === item.id)
    .map((item) => item.id);
  if (needProfile.length === 0) return list;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, nickname, avatar_url')
    .in('id', needProfile.slice(0, 80));

  const byId = new Map<string, ProfileRow>();
  for (const row of (profiles ?? []) as ProfileRow[]) {
    const id = String(row.id || '').trim();
    if (id) byId.set(id, row);
  }

  return list.map((item) => {
    const profile = byId.get(item.id);
    if (!profile) return item;
    const name =
      String(profile.display_name || profile.nickname || '').trim() || item.name;
    const imageUri =
      absoluteImageUrl(profile.avatar_url ?? null) ||
      item.imageUri ||
      undefined;
    return { ...item, name, imageUri };
  });
}

/** ブロック登録 */
export async function blockUserRemote(input: {
  userId: string;
  target: { id: string; name: string; imageUri?: string };
  getIdToken: () => Promise<string | null>;
}): Promise<void> {
  const uid = input.userId.trim();
  const blockedId = input.target.id.trim();
  if (!uid || !blockedId) throw new Error('対象が不正です');
  if (uid === blockedId) throw new Error('自分自身はブロックできません');

  const supabase = createAuthedSupabase(input.getIdToken);
  const { error } = await supabase.from('blocks').upsert(
    {
      blocker_id: uid,
      blocked_id: blockedId,
      blocked_name: input.target.name.trim() || null,
      blocked_image_uri: input.target.imageUri?.trim() || null,
    },
    { onConflict: 'blocker_id,blocked_id' },
  );
  if (error) throw new Error(error.message);
}

/** ブロック解除（自分のブロック行のみ削除） */
export async function unblockUserRemote(input: {
  userId: string;
  blockedId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<void> {
  const uid = input.userId.trim();
  const blockedId = input.blockedId.trim();
  if (!uid || !blockedId) throw new Error('対象が不正です');

  const supabase = createAuthedSupabase(input.getIdToken);
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', uid)
    .eq('blocked_id', blockedId);

  if (error) throw new Error(error.message);
}

/**
 * 非表示対象のユーザー ID（自分がブロックした + 相手が自分をブロックした）。
 * イベント・メッセージ・参加者一覧のフィルタに使う。
 */
export async function fetchHiddenUserIdSet(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<Set<string>> {
  const uid = input.userId.trim();
  if (!uid) return new Set();

  try {
    const supabase = createAuthedSupabase(input.getIdToken);
    const [{ data: outgoing }, { data: incoming }] = await Promise.all([
      supabase.from('blocks').select('blocked_id').eq('blocker_id', uid),
      supabase.from('blocks').select('blocker_id').eq('blocked_id', uid),
    ]);

    const ids = new Set<string>();
    for (const row of (outgoing ?? []) as { blocked_id?: string }[]) {
      const id = String(row.blocked_id || '').trim();
      if (id) ids.add(id);
    }
    for (const row of (incoming ?? []) as { blocker_id?: string }[]) {
      const id = String(row.blocker_id || '').trim();
      if (id) ids.add(id);
    }
    return ids;
  } catch {
    return new Set();
  }
}

/** @deprecated fetchHiddenUserIdSet を使用 */
export async function fetchBlockedIdSet(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<Set<string>> {
  return fetchHiddenUserIdSet(input);
}
