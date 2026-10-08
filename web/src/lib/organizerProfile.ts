import { createAuthedSupabase } from '@/lib/supabase';
import {
  sanitizeSnsLinks,
  type SnsLink,
} from '@/lib/snsLinks';

export type WebOrganizerProfile = {
  name: string;
  /** サークルアイコン／ロゴ */
  imageUri?: string;
  /** クラブカバー写真（ヘッダー画像） */
  coverUri?: string;
  bio: string;
  /** 複数 SNS / Web リンク */
  snsLinks: SnsLink[];
};

export const EMPTY_ORGANIZER_PROFILE: WebOrganizerProfile = {
  name: '',
  imageUri: undefined,
  coverUri: undefined,
  bio: '',
  snsLinks: [],
};

const PREFIX = 'spotto:organizer-profile:';

function key(userId: string) {
  return `${PREFIX}${userId.trim()}`;
}

export function normalizeOrganizerName(name: string) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

export function hasOrganizerProfileReady(profile: WebOrganizerProfile) {
  return normalizeOrganizerName(profile.name).length >= 3;
}

function normalizeProfile(raw: Partial<WebOrganizerProfile> | null | undefined): WebOrganizerProfile {
  return {
    name: normalizeOrganizerName(raw?.name || ''),
    imageUri: String(raw?.imageUri || '').trim() || undefined,
    coverUri: String(raw?.coverUri || '').trim() || undefined,
    bio: String(raw?.bio || '').trim().slice(0, 500),
    snsLinks: sanitizeSnsLinks(raw?.snsLinks),
  };
}

export function loadOrganizerProfile(userId: string): WebOrganizerProfile {
  if (typeof window === 'undefined') return EMPTY_ORGANIZER_PROFILE;
  const uid = userId.trim();
  if (!uid) return EMPTY_ORGANIZER_PROFILE;
  try {
    const raw = window.localStorage.getItem(key(uid));
    if (!raw) return EMPTY_ORGANIZER_PROFILE;
    return normalizeProfile(JSON.parse(raw) as Partial<WebOrganizerProfile>);
  } catch {
    return EMPTY_ORGANIZER_PROFILE;
  }
}

export function saveOrganizerProfileLocal(
  userId: string,
  profile: WebOrganizerProfile,
): { ok: true; profile: WebOrganizerProfile } | { ok: false; error: string } {
  const uid = userId.trim();
  if (!uid) return { ok: false, error: 'ログインが必要です' };
  const name = normalizeOrganizerName(profile.name);
  if (name.length < 3) {
    return { ok: false, error: 'サークル名は3文字以上で入力してください' };
  }
  const next = normalizeProfile({
    ...profile,
    name,
    bio: String(profile.bio || '').trim().slice(0, 500),
  });
  try {
    window.localStorage.setItem(key(uid), JSON.stringify(next));
    return { ok: true, profile: next };
  } catch {
    return { ok: false, error: '保存に失敗しました' };
  }
}

/** @deprecated 互換: ローカルのみ保存 */
export function saveOrganizerProfile(
  userId: string,
  profile: WebOrganizerProfile,
) {
  return saveOrganizerProfileLocal(userId, profile);
}

/** clubs テーブルからカバー・SNS などを読み、ローカルとマージ */
export async function fetchOrganizerClubProfile(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<WebOrganizerProfile | null> {
  const uid = input.userId.trim();
  if (!uid) return null;
  const supabase = createAuthedSupabase(input.getIdToken);
  const { data, error } = await supabase
    .from('clubs')
    .select('id, name, image_url, cover_image_url, bio, sns_links')
    .eq('id', uid)
    .maybeSingle();
  if (error) {
    // sns_links 未適用時はフォールバック
    const fallback = await supabase
      .from('clubs')
      .select('id, name, image_url, cover_image_url, bio')
      .eq('id', uid)
      .maybeSingle();
    if (fallback.error || !fallback.data) return null;
    return normalizeProfile({
      name: String((fallback.data as { name?: string }).name || ''),
      imageUri:
        String((fallback.data as { image_url?: string }).image_url || '') ||
        undefined,
      coverUri:
        String(
          (fallback.data as { cover_image_url?: string }).cover_image_url || '',
        ) || undefined,
      bio: String((fallback.data as { bio?: string }).bio || ''),
      snsLinks: [],
    });
  }
  if (!data) return null;
  const row = data as {
    name?: string;
    image_url?: string | null;
    cover_image_url?: string | null;
    bio?: string;
    sns_links?: unknown;
  };
  return normalizeProfile({
    name: String(row.name || ''),
    imageUri: String(row.image_url || '').trim() || undefined,
    coverUri: String(row.cover_image_url || '').trim() || undefined,
    bio: String(row.bio || ''),
    snsLinks: sanitizeSnsLinks(row.sns_links),
  });
}

function preferUri(remote?: string, local?: string) {
  return remote?.trim() || local?.trim() || undefined;
}

/** ローカルとリモートをマージ（リモートの非空を優先） */
export function mergeOrganizerProfiles(
  local: WebOrganizerProfile,
  remote: WebOrganizerProfile | null,
): WebOrganizerProfile {
  if (!remote) return local;
  return normalizeProfile({
    name: remote.name || local.name,
    imageUri: preferUri(remote.imageUri, local.imageUri),
    coverUri: preferUri(remote.coverUri, local.coverUri),
    bio: remote.bio || local.bio,
    snsLinks:
      remote.snsLinks.length > 0 ? remote.snsLinks : local.snsLinks,
  });
}

/**
 * ローカル保存 + clubs upsert + 主催イベントの host_* 更新。
 */
export async function persistOrganizerProfile(input: {
  userId: string;
  profile: WebOrganizerProfile;
  getIdToken: () => Promise<string | null>;
}): Promise<{ ok: true; profile: WebOrganizerProfile } | { ok: false; error: string }> {
  const local = saveOrganizerProfileLocal(input.userId, input.profile);
  if (!local.ok) return local;
  const next = local.profile;
  const uid = input.userId.trim();
  const supabase = createAuthedSupabase(input.getIdToken);

  const clubPayload: Record<string, unknown> = {
    id: uid,
    name: next.name,
    bio: next.bio,
    image_url: next.imageUri ?? null,
    cover_image_url: next.coverUri ?? null,
    sns_links: next.snsLinks,
    updated_at: new Date().toISOString(),
  };

  let clubError = (
    await supabase.from('clubs').upsert(clubPayload, { onConflict: 'id' })
  ).error;

  if (clubError && /sns_links/i.test(clubError.message || '')) {
    delete clubPayload.sns_links;
    clubError = (
      await supabase.from('clubs').upsert(clubPayload, { onConflict: 'id' })
    ).error;
  }
  if (clubError) {
    return {
      ok: false,
      error:
        clubError.message ||
        'サークル情報をサーバーに保存できませんでした（端末には保存済み）',
    };
  }

  const { error: eventsError } = await supabase
    .from('events')
    .update({
      host_name: next.name,
      host_image_uri: next.imageUri ?? null,
      host_bio: next.bio || null,
      host_sns_links: next.snsLinks,
      updated_at: new Date().toISOString(),
    })
    .eq('host_id', uid);

  if (eventsError && !/host_sns_links/i.test(eventsError.message || '')) {
    return {
      ok: false,
      error:
        eventsError.message ||
        '主催イベントへの反映に失敗しました（サークル情報は保存済み）',
    };
  }

  return { ok: true, profile: next };
}

/** カバー写真を event-images/clubs にアップロード */
export async function uploadOrganizerCover(input: {
  file: File;
  getIdToken: () => Promise<string | null>;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    if (!input.file.type.startsWith('image/')) {
      return { ok: false, error: '画像ファイルを選択してください' };
    }
    const client = createAuthedSupabase(input.getIdToken);
    const rand = Math.random().toString(36).slice(2, 10);
    const ext = input.file.type.includes('png') ? 'png' : 'jpg';
    const path = `clubs/${Date.now()}-${rand}.${ext}`;
    const { error } = await client.storage.from('event-images').upload(path, input.file, {
      contentType: input.file.type || 'image/jpeg',
      upsert: false,
      cacheControl: '3600',
    });
    if (error) {
      return { ok: false, error: error.message || 'カバー写真のアップロードに失敗しました' };
    }
    const { data } = client.storage.from('event-images').getPublicUrl(path);
    const url = data.publicUrl?.trim();
    if (!url) return { ok: false, error: '公開 URL を取得できませんでした' };
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'カバー写真のアップロードに失敗しました',
    };
  }
}
