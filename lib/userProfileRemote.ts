import { ensureFirebaseAuthenticatedClaim } from '@/lib/firebaseEnsureClaims';
import i18n from '@/lib/i18n';
import {
  firebaseJwtHasAuthenticatedRole,
  getFirebaseIdToken,
  peekFirebaseJwtClaims,
} from '@/lib/firebaseIdToken';
import {
  isLocalImageUri,
  resolvePublicImageUrl,
  uploadPublicImageOrLocal,
} from '@/lib/storage';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  getUserProfile,
  isProfileComplete,
  isUserGender,
  markProfileSetupComplete,
  setUserProfile,
  type UserGender,
  type UserProfile,
} from '@/lib/userProfile';

function formatProfileRemoteError(message: string | undefined, fallback: string) {
  const raw = String(message || '').trim() || fallback;
  if (/row level security|rls|42501|permission denied/i.test(raw)) {
    if (__DEV__) {
      console.warn('[profile] permission/rls', raw);
    }
    return fallback;
  }
  return raw;
}

type RemoteProfileRow = {
  display_name?: string | null;
  nickname?: string | null;
  gender?: string | null;
  avatar_url?: string | null;
};

export type ProfileRemoteResult =
  | { ok: true }
  | { ok: false; error: string };

function hasRemoteProfileData(row: RemoteProfileRow | null | undefined) {
  if (!row) return false;
  const name = String(row.display_name || row.nickname || '').trim();
  const gender = isUserGender(row.gender) ? row.gender : '';
  const image =
    typeof row.avatar_url === 'string' && row.avatar_url.trim()
      ? row.avatar_url.trim()
      : '';
  return Boolean(name || gender || image);
}

export function remoteRowToProfile(
  row: RemoteProfileRow,
  local: UserProfile = getUserProfile(),
): UserProfile {
  const remoteName = String(row.display_name || row.nickname || '').trim();
  const remoteGender = isUserGender(row.gender)
    ? (row.gender as UserGender)
    : '';
  const rawAvatar =
    typeof row.avatar_url === 'string' && row.avatar_url.trim()
      ? row.avatar_url.trim()
      : undefined;
  const remoteImage =
    resolvePublicImageUrl(rawAvatar) ||
    (rawAvatar && !isLocalImageUri(rawAvatar) ? rawAvatar : undefined);

  return {
    name: remoteName || local.name,
    gender: remoteGender || local.gender,
    imageUri: remoteImage ?? local.imageUri,
  };
}

/** サインイン直後など、Firebase セッションがまだ載っていないことがあるので短く待つ */
async function waitForAuthUser(userId: string, attempts = 4): Promise<boolean> {
  const { getCurrentFirebaseUid } = await import('@/lib/currentUser');
  for (let i = 0; i < attempts; i += 1) {
    const uid = await getCurrentFirebaseUid();
    if (uid === userId) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function selectProfileRow(userId: string): Promise<{
  row: RemoteProfileRow | null;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) return { row: null, error: 'no client' };

  const primary = await client
    .from('profiles')
    .select('display_name, nickname, gender, avatar_url, is_banned')
    .eq('id', userId)
    .maybeSingle();

  if (!primary.error) {
    return { row: (primary.data as RemoteProfileRow | null) ?? null };
  }

  if (/is_banned|column/i.test(primary.error.message)) {
    const fallback = await client
      .from('profiles')
      .select('display_name, nickname, gender, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    if (fallback.error) {
      return { row: null, error: fallback.error.message };
    }
    return { row: (fallback.data as RemoteProfileRow | null) ?? null };
  }

  return { row: null, error: primary.error.message };
}

/**
 * Supabase profiles を userId（= Firebase JWT sub）で取得してローカルへ反映。
 */
export async function syncProfileFromRemote(
  userId: string,
  options?: { localFallback?: UserProfile },
): Promise<UserProfile> {
  const local = options?.localFallback ?? getUserProfile();
  if (!userId || !isSupabaseConfigured()) return local;

  const client = getSupabaseClient();
  if (!client) return local;

  try {
    await waitForAuthUser(userId);

    let { row, error } = await selectProfileRow(userId);
    // 初回はセッション待ち直後で空になることがある → 1 回リトライ
    if (!row && !error) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      ({ row, error } = await selectProfileRow(userId));
    }

    if (error) {
      if (__DEV__) console.warn('[profile] fetch failed', error);
      return local;
    }
    if (!row || !hasRemoteProfileData(row)) {
      return local;
    }

    const next = remoteRowToProfile(row, local);
    return setUserProfile(next, { userId });
  } catch (error) {
    if (__DEV__) console.warn('[profile] sync threw', error);
    return local;
  }
}

/** ローカルプロフィールを profiles に upsert（id = Firebase JWT sub） */
export async function pushProfileToRemote(
  userId: string,
  profile: UserProfile,
): Promise<ProfileRemoteResult> {
  if (!userId || !isSupabaseConfigured()) {
    return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };
  }

  await waitForAuthUser(userId);
  await ensureFirebaseAuthenticatedClaim();

  const token = await getFirebaseIdToken(false);
  const claims = token ? peekFirebaseJwtClaims(token) : null;
  const jwtSub =
    typeof claims?.sub === 'string' && claims.sub.trim()
      ? claims.sub.trim()
      : '';
  if (!token || !firebaseJwtHasAuthenticatedRole(token)) {
    return {
      ok: false,
      error:
        i18n.t('errors.authRoleMissing'),
    };
  }
  if (jwtSub && jwtSub !== userId) {
    return {
      ok: false,
      error:
        i18n.t('errors.profile.accountMismatch'),
    };
  }

  let avatarUrl = profile.imageUri?.trim() || null;
  // ローカル URI はクラウドへ上げてから保存（チャット他端末表示のため）
  if (avatarUrl && isLocalImageUri(avatarUrl)) {
    const uploaded = await uploadPublicImageOrLocal(avatarUrl, 'profiles');
    if (uploaded.uploaded) {
      avatarUrl = uploaded.uri;
    } else {
      console.warn('[profile] avatar upload before save failed', uploaded.error);
      avatarUrl = resolvePublicImageUrl(avatarUrl) || null;
    }
  } else {
    avatarUrl = resolvePublicImageUrl(avatarUrl) || avatarUrl;
  }

  const sanitized = {
    name: profile.name.trim(),
    gender: isUserGender(profile.gender) ? profile.gender : null,
    imageUri: avatarUrl,
  };

  const profileToCache: UserProfile = {
    ...profile,
    imageUri: sanitized.imageUri || profile.imageUri,
  };

  try {
    const { error } = await client.from('profiles').upsert(
      {
        id: userId,
        display_name: sanitized.name || null,
        nickname: sanitized.name || null,
        gender: sanitized.gender,
        avatar_url: sanitized.imageUri,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (error) {
      if (__DEV__) {
        console.warn('[profile] upsert failed', {
          code: error.code,
          message: error.message,
          userId,
        });
      }
      return {
        ok: false,
        error: formatProfileRemoteError(
          error.message,
          i18n.t('errors.profile.saveFailed'),
        ),
      };
    }

    // 端末キャッシュにも必ず userId 付きで残す
    setUserProfile(profileToCache, { userId });
    if (isProfileComplete(profileToCache)) {
      void markProfileSetupComplete(userId);
    }
    return { ok: true };
  } catch (error) {
    if (__DEV__) console.warn('[profile] upsert threw', error);
    return {
      ok: false,
      error: formatProfileRemoteError(
        error instanceof Error ? error.message : undefined,
        i18n.t('errors.profile.saveFailed'),
      ),
    };
  }
}

/**
 * リモートが空でローカルに完成プロフィールがあるとき、クラウドへ戻す。
 */
export async function backfillProfileIfNeeded(
  userId: string,
  profile: UserProfile,
): Promise<void> {
  if (!userId || !isProfileComplete(profile)) return;
  if (!isSupabaseConfigured()) return;

  try {
    await waitForAuthUser(userId);
    const { row, error } = await selectProfileRow(userId);
    if (error) {
      await pushProfileToRemote(userId, profile);
      return;
    }
    if (hasRemoteProfileData(row) && isUserGender(row?.gender)) {
      void markProfileSetupComplete(userId);
      return;
    }
    await pushProfileToRemote(userId, profile);
  } catch {
    // ignore
  }
}

/** DB 上に完成プロフィールがあるか（設定画面スキップ判定用） */
export async function hasCompleteRemoteProfile(
  userId: string,
): Promise<boolean> {
  if (!userId || !isSupabaseConfigured()) return false;
  try {
    await waitForAuthUser(userId);
    const { row } = await selectProfileRow(userId);
    if (!row) return false;
    const name = String(row.display_name || row.nickname || '').trim();
    return Boolean(name && isUserGender(row.gender));
  } catch {
    return false;
  }
}

export type PublicProfileView = {
  id: string;
  name: string;
  imageUri?: string;
  gender?: UserGender;
};

export type PublicProfileFetchResult =
  | { ok: true; data: PublicProfileView }
  | { ok: false; error: string };

/**
 * 任意ユーザーの公開プロフィールを profiles から取得（チャット送信者タップ等）。
 * 見つからない場合も ok:true + 空の name を返し、呼び出し側でフォールバック可能にする。
 */
export async function fetchPublicProfileByUserId(
  userId: string,
): Promise<PublicProfileFetchResult> {
  const id = String(userId || '').trim();
  if (!id || id === 'me') {
    return { ok: false, error: i18n.t('errors.profile.userUnknown') };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, error: i18n.t('errors.profile.serviceUnavailable') };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: i18n.t('errors.profile.serviceUnavailable') };
  }

  try {
    await ensureFirebaseAuthenticatedClaim();
    const { row, error } = await selectProfileRow(id);
    if (error) {
      console.warn('[profile] public fetch failed', { userId: id, error });
      return {
        ok: false,
        error: i18n.t('errors.profile.fetchFailedRetry'),
      };
    }
    if (!row || !hasRemoteProfileData(row)) {
      if (__DEV__) {
        console.log('[profile] public fetch empty', { userId: id });
      }
      return { ok: true, data: { id, name: '' } };
    }
    const name = String(row.display_name || row.nickname || '').trim();
    const rawAvatar =
      typeof row.avatar_url === 'string' && row.avatar_url.trim()
        ? row.avatar_url.trim()
        : undefined;
    const imageUri =
      resolvePublicImageUrl(rawAvatar) ||
      (rawAvatar && !isLocalImageUri(rawAvatar) ? rawAvatar : undefined);
    const gender = isUserGender(row.gender)
      ? (row.gender as UserGender)
      : undefined;
    return {
      ok: true,
      data: {
        id,
        name,
        imageUri,
        gender,
      },
    };
  } catch (error) {
    console.warn('[profile] public fetch threw', error);
    return {
      ok: false,
      error: i18n.t('errors.profile.fetchFailed'),
    };
  }
}
