import { updateProfile, type User } from 'firebase/auth';

import { supabaseUrl } from '@/lib/env';
import { createAuthedSupabase, createPublicSupabase } from '@/lib/supabase';

export type WebUserGender = '男性' | '女性' | '';

export type WebUserProfile = {
  name: string;
  imageUri?: string;
  gender: WebUserGender;
};

const STORAGE_BUCKET = 'event-images';
const PROFILE_FOLDER = 'profiles';
const PROFILE_MAX_EDGE = 1024;
const JPEG_QUALITY = 0.72;
const HARD_MAX_BYTES = 8_000_000;

type ProfileRow = {
  display_name?: string | null;
  nickname?: string | null;
  gender?: string | null;
  avatar_url?: string | null;
};

function isGender(value: unknown): value is '男性' | '女性' {
  return value === '男性' || value === '女性';
}

function resolvePublicAvatarUrl(raw: string | null | undefined): string | undefined {
  const value = String(raw || '').trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  const base = supabaseUrl();
  if (!base) return value;
  if (value.startsWith(`${PROFILE_FOLDER}/`) || value.startsWith('events/')) {
    return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${value.replace(/^\/+/, '')}`;
  }
  return value;
}

export function profileFromFirebaseUser(user: User | null | undefined): WebUserProfile {
  return {
    name: user?.displayName?.trim() || '',
    imageUri: user?.photoURL?.trim() || undefined,
    gender: '',
  };
}

export function rowToWebProfile(
  row: ProfileRow | null | undefined,
  fallback: WebUserProfile,
): WebUserProfile {
  if (!row) return fallback;
  const name = String(row.display_name || row.nickname || '').trim();
  const gender = isGender(row.gender) ? row.gender : '';
  const imageUri = resolvePublicAvatarUrl(row.avatar_url);
  return {
    name: name || fallback.name,
    gender: gender || fallback.gender,
    imageUri: imageUri || fallback.imageUri,
  };
}

export async function fetchWebProfile(input: {
  userId: string;
  fallback: WebUserProfile;
}): Promise<WebUserProfile> {
  try {
    const client = createPublicSupabase();
    const { data, error } = await client
      .from('profiles')
      .select('display_name, nickname, gender, avatar_url')
      .eq('id', input.userId)
      .maybeSingle();
    if (error || !data) return input.fallback;
    return rowToWebProfile(data as ProfileRow, input.fallback);
  } catch {
    return input.fallback;
  }
}

async function shrinkImageFile(file: File): Promise<{ blob: Blob; ext: string; contentType: string }> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return {
      blob: file,
      ext: file.type.includes('png') ? 'png' : 'jpg',
      contentType: file.type || 'image/jpeg',
    };
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, PROFILE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        blob: file,
        ext: 'jpg',
        contentType: file.type || 'image/jpeg',
      };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((next) => resolve(next), 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob) {
      return {
        blob: file,
        ext: 'jpg',
        contentType: file.type || 'image/jpeg',
      };
    }
    return { blob, ext: 'jpg', contentType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

export async function uploadProfileAvatar(input: {
  file: File;
  getIdToken: () => Promise<string | null>;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    if (!input.file.type.startsWith('image/')) {
      return { ok: false, error: '画像ファイルを選択してください' };
    }
    if (input.file.size > HARD_MAX_BYTES * 2) {
      return { ok: false, error: '画像サイズが大きすぎます（目安 8MB 以下）' };
    }

    const prepared = await shrinkImageFile(input.file);
    if (prepared.blob.size > HARD_MAX_BYTES) {
      return { ok: false, error: '画像サイズが大きすぎます。別の写真をお試しください' };
    }

    const client = createAuthedSupabase(input.getIdToken);
    const rand = Math.random().toString(36).slice(2, 10);
    const path = `${PROFILE_FOLDER}/${Date.now()}-${rand}.${prepared.ext}`;
    const { error } = await client.storage.from(STORAGE_BUCKET).upload(path, prepared.blob, {
      contentType: prepared.contentType,
      upsert: false,
      cacheControl: '3600',
    });
    if (error) {
      return {
        ok: false,
        error: error.message || '画像のアップロードに失敗しました',
      };
    }
    const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    const url = data.publicUrl?.trim();
    if (!url) return { ok: false, error: '公開 URL を取得できませんでした' };
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '画像のアップロードに失敗しました',
    };
  }
}

export async function saveWebProfile(input: {
  user: User;
  profile: WebUserProfile;
  getIdToken: () => Promise<string | null>;
}): Promise<{ ok: true; profile: WebUserProfile } | { ok: false; error: string }> {
  const name = input.profile.name.trim();
  if (!name) {
    return { ok: false, error: '名前を入力してください' };
  }

  const gender = isGender(input.profile.gender) ? input.profile.gender : null;
  const avatarUrl = input.profile.imageUri?.trim() || null;

  try {
    const client = createAuthedSupabase(input.getIdToken);
    const { error } = await client.from('profiles').upsert(
      {
        id: input.user.uid,
        display_name: name,
        nickname: name,
        gender,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (error) {
      return {
        ok: false,
        error: error.message || 'プロフィールの保存に失敗しました',
      };
    }

    try {
      await updateProfile(input.user, {
        displayName: name,
        photoURL: avatarUrl || null,
      });
    } catch {
      // Firebase 側の更新失敗でも Supabase 保存は成功扱い（画面はローカル状態で反映）
    }

    return {
      ok: true,
      profile: {
        name,
        gender: gender || '',
        imageUri: avatarUrl || undefined,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'プロフィールの保存に失敗しました',
    };
  }
}
