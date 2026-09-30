import {
  sanitizeSnsLinks,
  type SnsLink,
} from '@/lib/snsLinks';

export const MY_ORGANIZER_ID = 'me';

/** サークル／主催者名の文字数制限（UI 崩れ防止） */
export const ORGANIZER_NAME_MIN_LENGTH = 3;
export const ORGANIZER_NAME_MAX_LENGTH = 30;

export type OrganizerProfile = {
  name: string;
  /** サークルアイコン／ロゴ */
  imageUri?: string;
  /** クラブカバー写真（ヘッダー画像） */
  coverUri?: string;
  bio: string;
  /** 複数 SNS / Web リンク */
  snsLinks: SnsLink[];
};

export const EMPTY_ORGANIZER_PROFILE: OrganizerProfile = {
  name: '',
  imageUri: undefined,
  coverUri: undefined,
  bio: '',
  snsLinks: [],
};

export function normalizeOrganizerName(name: string) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ORGANIZER_NAME_MAX_LENGTH);
}

/**
 * サークル名（主催者名）のバリデーション。
 * @returns エラーメッセージ。問題なければ null
 */
export function getOrganizerNameError(name: string): string | null {
  const trimmed = String(name || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return 'サークル名を入力してください。';
  }
  if (trimmed.length < ORGANIZER_NAME_MIN_LENGTH) {
    return `サークル名は${ORGANIZER_NAME_MIN_LENGTH}文字以上で入力してください。`;
  }
  if (trimmed.length > ORGANIZER_NAME_MAX_LENGTH) {
    return `サークル名は${ORGANIZER_NAME_MAX_LENGTH}文字以内で入力してください。`;
  }
  return null;
}

export function isValidOrganizerName(name: string) {
  return getOrganizerNameError(name) == null;
}

export function hasOrganizerName(profile: OrganizerProfile) {
  return isValidOrganizerName(profile.name);
}

/** アイコン画像が未設定のときのエラー（問題なければ null） */
export function getOrganizerImageError(
  imageUri: string | null | undefined,
): string | null {
  if (!String(imageUri || '').trim()) {
    return 'アイコン画像を設定してください。';
  }
  return null;
}

export function hasOrganizerImage(profile: Pick<OrganizerProfile, 'imageUri'>) {
  return getOrganizerImageError(profile.imageUri) == null;
}

/** イベント作成ゲート用: サークル名が揃っていれば可（アイコンは任意） */
export function hasOrganizerProfileReady(profile: OrganizerProfile) {
  return hasOrganizerName(profile);
}

export function organizerDisplayName(profile: OrganizerProfile) {
  const name = normalizeOrganizerName(profile.name);
  return name || 'マイサークル';
}

export function organizerInitial(name: string) {
  const trimmed = normalizeOrganizerName(name);
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '主';
}

/**
 * 主催者判定。
 * - currentUserId がある場合: event.hostId と一致すれば自分の主催
 * - 旧ローカル 'me' / MY_ORGANIZER_ID は hostedIds に含まれる場合のみ自分扱い
 */
export function isHostedByMe(
  event: { id: string; host?: string; hostId?: string },
  hostedIds?: Set<string>,
  currentUserId?: string | null,
) {
  const hostId = event.hostId?.trim();
  const uid = currentUserId?.trim();
  if (uid && hostId && hostId === uid) return true;
  if (hostedIds?.has(event.id)) {
    if (!uid) return true;
    if (!hostId || hostId === MY_ORGANIZER_ID || hostId === 'me') return true;
  }
  if (!uid && (hostId === MY_ORGANIZER_ID || hostId === 'me')) return true;
  return event.host === 'You';
}

/** 保存・読み込み両対応（旧 contact / snsUrl 形式も吸収） */
export function sanitizeOrganizerProfile(
  input: OrganizerProfile & {
    contact?: string;
    snsUrl?: string;
  },
): OrganizerProfile {
  const fromLinks = sanitizeSnsLinks(input.snsLinks);
  const fromLegacy = sanitizeSnsLinks(input.snsUrl);
  const merged = sanitizeSnsLinks([...fromLinks, ...fromLegacy]);

  return {
    name: normalizeOrganizerName(input.name),
    imageUri: input.imageUri?.trim() || undefined,
    coverUri: input.coverUri?.trim() || undefined,
    bio: input.bio.trim(),
    snsLinks: merged,
  };
}
