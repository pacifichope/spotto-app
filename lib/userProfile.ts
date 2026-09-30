type AsyncStorageType =
  typeof import('@react-native-async-storage/async-storage').default;

/** 旧: ユーザー非紐づけ。ログアウト時に消えて再ログインで空になる原因だった */
const LEGACY_STORAGE_KEY = '@spotto/user-profile';

function profileStorageKey(userId: string) {
  return `@spotto/user-profile:${userId}`;
}

export const USER_GENDER_OPTIONS = ['男性', '女性'] as const;
export type UserGender = (typeof USER_GENDER_OPTIONS)[number];

export type UserProfile = {
  name: string;
  imageUri?: string;
  /** 個人プロフィールの性別（未設定は空文字） */
  gender: UserGender | '';
};

/** 未ログイン / クリア後の空プロフィール（モック名は入れない） */
export const GUEST_USER_PROFILE: UserProfile = {
  name: '',
  imageUri: undefined,
  gender: '',
};

/** @deprecated GUEST_USER_PROFILE を使用。後方互換のため残す */
export const DEFAULT_USER_PROFILE: UserProfile = GUEST_USER_PROFILE;

const listeners = new Set<() => void>();

let currentProfile: UserProfile = { ...GUEST_USER_PROFILE };
/** いま画面に紐づいている auth ユーザー（永続化キー用） */
let activeUserId: string | null = null;
let hydratePromise: Promise<UserProfile> | null = null;
let hydrateForUserId: string | null = null;

function getAsyncStorage(): AsyncStorageType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage')
      .default as AsyncStorageType;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function isUserGender(value: unknown): value is UserGender {
  return value === '男性' || value === '女性';
}

export function parseUserProfile(raw: unknown): UserProfile {
  if (!raw || typeof raw !== 'object') return { ...GUEST_USER_PROFILE };
  const record = raw as Record<string, unknown>;
  const name =
    typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : '';
  const imageUri =
    typeof record.imageUri === 'string' && record.imageUri.trim()
      ? record.imageUri.trim()
      : undefined;
  const gender = isUserGender(record.gender) ? record.gender : '';
  return { name, imageUri, gender };
}

export function getUserProfile() {
  return currentProfile;
}

export function getActiveProfileUserId() {
  return activeUserId;
}

/**
 * ログイン中ユーザーを紐づける。以後の setUserProfile はこの ID 配下に保存される。
 */
export function setActiveProfileUserId(userId: string | null) {
  activeUserId = userId?.trim() || null;
}

export function subscribeUserProfile(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 表示用。未設定時は「ゲスト」（モック名は出さない） */
export function userDisplayName(profile: UserProfile = currentProfile) {
  return profile.name.trim() || 'ゲスト';
}

/**
 * 参加・決済などに進む前に必要なプロフィールが揃っているか。
 * PersonalProfileModal の必須項目（表示名 + 性別）に合わせる。
 */
export function isProfileComplete(profile: UserProfile = currentProfile) {
  const name = profile.name.trim();
  if (!name || name === 'You' || name === 'ゲスト') return false;
  if (!isUserGender(profile.gender)) return false;
  return true;
}

export function userInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : 'G';
}

export function sanitizeUserProfile(input: UserProfile): UserProfile {
  return {
    name: input.name.trim(),
    imageUri: input.imageUri?.trim() || undefined,
    gender: isUserGender(input.gender) ? input.gender : '',
  };
}

async function persistUserProfile(profile: UserProfile, userId: string | null) {
  const storage = getAsyncStorage();
  if (!storage) return;
  try {
    const payload = JSON.stringify(profile);
    if (userId) {
      await storage.setItem(profileStorageKey(userId), payload);
    }
    // 旧キーは残さない（ゲストに前回名が漏れるのを防ぐ）
    await storage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore persistence failures in local-only mode
  }
}

function profileSetupDoneKey(userId: string) {
  return `@spotto/profile-setup-done:${userId}`;
}

/** 初回プロフィール設定完了フラグ（再ログインで設定画面を出さない判定用） */
export async function markProfileSetupComplete(userId: string): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const storage = getAsyncStorage();
  if (!storage) return;
  try {
    await storage.setItem(profileSetupDoneKey(uid), '1');
  } catch {
    // ignore
  }
}

export async function isProfileSetupMarkedComplete(
  userId: string,
): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;
  const storage = getAsyncStorage();
  if (!storage) return false;
  try {
    return (await storage.getItem(profileSetupDoneKey(uid))) === '1';
  } catch {
    return false;
  }
}

export function setUserProfile(
  input: UserProfile,
  options?: { userId?: string | null },
) {
  const bindUserId =
    options && 'userId' in (options ?? {})
      ? options?.userId?.trim() || null
      : activeUserId;
  if (bindUserId) {
    activeUserId = bindUserId;
  }

  const next = sanitizeUserProfile(input);
  const prev = currentProfile;
  if (
    prev.name === next.name &&
    prev.imageUri === next.imageUri &&
    prev.gender === next.gender
  ) {
    // 内容同じでも userId 紐づけ後に永続化が必要な場合がある
    if (bindUserId && isProfileComplete(next)) {
      void persistUserProfile(next, bindUserId);
    }
    return prev;
  }
  currentProfile = next;
  emit();
  void persistUserProfile(next, bindUserId);
  return next;
}

async function readStoredProfile(userId: string): Promise<UserProfile | null> {
  const storage = getAsyncStorage();
  if (!storage) return null;
  try {
    const keyed = await storage.getItem(profileStorageKey(userId));
    if (keyed) return parseUserProfile(JSON.parse(keyed));

    // 移行: 旧キーがあればこのユーザー用に移す
    const legacy = await storage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = parseUserProfile(JSON.parse(legacy));
      if (isProfileComplete(parsed) || parsed.name.trim()) {
        await storage.setItem(profileStorageKey(userId), legacy);
        await storage.removeItem(LEGACY_STORAGE_KEY);
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * 指定ユーザーの端末キャッシュをメモリへ載せる。
 * ログイン直後・hydrate 前に呼ぶ。
 */
export async function hydrateUserProfileForUser(userId: string) {
  const uid = userId.trim();
  if (!uid) return currentProfile;

  if (hydratePromise && hydrateForUserId === uid) return hydratePromise;

  hydrateForUserId = uid;
  activeUserId = uid;
  hydratePromise = (async () => {
    const stored = await readStoredProfile(uid);
    if (stored) {
      currentProfile = stored;
      emit();
      return stored;
    }
    return currentProfile;
  })();

  try {
    return await hydratePromise;
  } finally {
    if (hydrateForUserId === uid) {
      hydratePromise = null;
      hydrateForUserId = null;
    }
  }
}

/**
 * @deprecated ユーザー非紐づけ。hydrateUserProfileForUser を使う。
 */
export async function hydrateUserProfile() {
  if (activeUserId) return hydrateUserProfileForUser(activeUserId);
  return currentProfile;
}

/**
 * ログアウト時: 画面上はゲストに戻す。
 * ユーザー ID 付きキャッシュは残し、再ログイン時に復元できるようにする。
 */
export function resetUserProfile() {
  hydratePromise = null;
  hydrateForUserId = null;
  activeUserId = null;
  currentProfile = { ...GUEST_USER_PROFILE };
  emit();
  void (async () => {
    const storage = getAsyncStorage();
    if (!storage) return;
    try {
      await storage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
  })();
  return currentProfile;
}
