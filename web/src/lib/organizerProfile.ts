export type WebOrganizerProfile = {
  name: string;
  imageUri?: string;
  bio: string;
};

export const EMPTY_ORGANIZER_PROFILE: WebOrganizerProfile = {
  name: '',
  imageUri: undefined,
  bio: '',
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

export function loadOrganizerProfile(userId: string): WebOrganizerProfile {
  if (typeof window === 'undefined') return EMPTY_ORGANIZER_PROFILE;
  const uid = userId.trim();
  if (!uid) return EMPTY_ORGANIZER_PROFILE;
  try {
    const raw = window.localStorage.getItem(key(uid));
    if (!raw) return EMPTY_ORGANIZER_PROFILE;
    const parsed = JSON.parse(raw) as Partial<WebOrganizerProfile>;
    return {
      name: normalizeOrganizerName(parsed.name || ''),
      imageUri: String(parsed.imageUri || '').trim() || undefined,
      bio: String(parsed.bio || '').trim(),
    };
  } catch {
    return EMPTY_ORGANIZER_PROFILE;
  }
}

export function saveOrganizerProfile(
  userId: string,
  profile: WebOrganizerProfile,
): { ok: true; profile: WebOrganizerProfile } | { ok: false; error: string } {
  const uid = userId.trim();
  if (!uid) return { ok: false, error: 'ログインが必要です' };
  const name = normalizeOrganizerName(profile.name);
  if (name.length < 3) {
    return { ok: false, error: 'サークル名は3文字以上で入力してください' };
  }
  const next: WebOrganizerProfile = {
    name,
    imageUri: profile.imageUri?.trim() || undefined,
    bio: String(profile.bio || '').trim().slice(0, 500),
  };
  try {
    window.localStorage.setItem(key(uid), JSON.stringify(next));
    return { ok: true, profile: next };
  } catch {
    return { ok: false, error: '保存に失敗しました' };
  }
}
