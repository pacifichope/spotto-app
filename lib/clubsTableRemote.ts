import { ensureFirebaseAuthenticatedClaim } from '@/lib/firebaseEnsureClaims';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type ClubsTableResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ClubRow = {
  id: string;
  name: string;
  image_url: string | null;
  cover_image_url: string | null;
  sns_links?: unknown;
};

export type UpsertClubInput = {
  id: string;
  name?: string;
  imageUrl?: string | null;
  coverImageUrl?: string | null;
  snsLinks?: unknown;
};

function mapRow(raw: Record<string, unknown> | null | undefined): ClubRow | null {
  if (!raw) return null;
  const id = String(raw.id ?? '').trim();
  if (!id) return null;
  return {
    id,
    name: String(raw.name ?? '').trim(),
    image_url:
      typeof raw.image_url === 'string' && raw.image_url.trim()
        ? raw.image_url.trim()
        : null,
    cover_image_url:
      typeof raw.cover_image_url === 'string' && raw.cover_image_url.trim()
        ? raw.cover_image_url.trim()
        : null,
    sns_links: raw.sns_links,
  };
}

/** 公開: クラブ行を id で取得 */
export async function fetchClubRow(
  clubId: string,
): Promise<ClubsTableResult<ClubRow | null>> {
  const id = String(clubId || '').trim();
  if (!id) return { ok: true, data: null };
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  try {
    let { data, error } = await client
      .from('clubs')
      .select('id, name, image_url, cover_image_url, sns_links')
      .eq('id', id)
      .maybeSingle();

    // sns_links 未適用時はフォールバック
    if (error && /sns_links/i.test(error.message || '')) {
      const fallback = await client
        .from('clubs')
        .select('id, name, image_url, cover_image_url')
        .eq('id', id)
        .maybeSingle();
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    if (error) {
      console.warn('[clubsTable] fetch failed', {
        id,
        code: error.code,
        message: error.message,
      });
      return { ok: false, error: error.message };
    }
    return { ok: true, data: mapRow(data as Record<string, unknown> | null) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'クラブ情報の取得に失敗しました',
    };
  }
}

/** 自分のクラブ行を upsert（カバー／アイコン含む） */
export async function upsertClubRow(
  input: UpsertClubInput,
): Promise<ClubsTableResult<ClubRow>> {
  const id = String(input.id || '').trim();
  if (!id) return { ok: false, error: 'クラブ ID がありません' };
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  try {
    await ensureFirebaseAuthenticatedClaim();

    const payload: Record<string, unknown> = {
      id,
      name: String(input.name ?? '').trim(),
    };
    if (input.imageUrl !== undefined) {
      payload.image_url = input.imageUrl?.trim() || null;
    }
    if (input.coverImageUrl !== undefined) {
      payload.cover_image_url = input.coverImageUrl?.trim() || null;
    }
    if (input.snsLinks !== undefined) {
      payload.sns_links = input.snsLinks;
    }

    const { data, error } = await client
      .from('clubs')
      .upsert(payload, { onConflict: 'id' })
      .select('id, name, image_url, cover_image_url, sns_links')
      .single();

    if (error) {
      console.warn('[clubsTable] upsert failed', {
        id,
        code: error.code,
        message: error.message,
        hint: error.hint,
      });
      return { ok: false, error: error.message };
    }
    const row = mapRow(data as Record<string, unknown>);
    if (!row) return { ok: false, error: 'クラブ情報の保存に失敗しました' };
    return { ok: true, data: row };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'クラブ情報の保存に失敗しました',
    };
  }
}
