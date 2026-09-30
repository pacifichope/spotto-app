/**
 * 主催者プロフィールの端末キャッシュ（ユーザー ID 単位）。
 * リロード後もサークル名・bio・SNS を復元する。
 */
import {
  EMPTY_ORGANIZER_PROFILE,
  sanitizeOrganizerProfile,
  type OrganizerProfile,
} from '@/lib/organizerProfile';

const STORAGE_KEY_PREFIX = '@spotto/organizer-profile:';

type AsyncStorageType =
  typeof import('@react-native-async-storage/async-storage').default;

function getAsyncStorage(): AsyncStorageType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage')
      .default as AsyncStorageType;
  } catch {
    return null;
  }
}

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId.trim()}`;
}

export async function loadOrganizerProfile(
  userId: string | null | undefined,
): Promise<OrganizerProfile> {
  const uid = String(userId || '').trim();
  if (!uid) return EMPTY_ORGANIZER_PROFILE;

  const storage = getAsyncStorage();
  if (!storage) return EMPTY_ORGANIZER_PROFILE;

  try {
    const raw = await storage.getItem(storageKey(uid));
    if (!raw) return EMPTY_ORGANIZER_PROFILE;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return EMPTY_ORGANIZER_PROFILE;
    return sanitizeOrganizerProfile(parsed as OrganizerProfile);
  } catch (error) {
    if (__DEV__) console.warn('[organizer] load failed', error);
    return EMPTY_ORGANIZER_PROFILE;
  }
}

export async function saveOrganizerProfile(
  userId: string | null | undefined,
  profile: OrganizerProfile,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const uid = String(userId || '').trim();
  if (!uid) {
    return { ok: false, error: 'ログイン中のアカウントを確認できません。' };
  }

  const storage = getAsyncStorage();
  if (!storage) {
    return { ok: false, error: '端末ストレージを利用できません。' };
  }

  try {
    const sanitized = sanitizeOrganizerProfile(profile);
    await storage.setItem(storageKey(uid), JSON.stringify(sanitized));
    return { ok: true };
  } catch (error) {
    if (__DEV__) console.warn('[organizer] save failed', error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '主催者プロフィールの保存に失敗しました。',
    };
  }
}

export async function clearOrganizerProfile(
  userId: string | null | undefined,
): Promise<void> {
  const uid = String(userId || '').trim();
  if (!uid) return;
  const storage = getAsyncStorage();
  try {
    await storage?.removeItem(storageKey(uid));
  } catch {
    // ignore
  }
}
