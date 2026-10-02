import { Alert, Platform } from 'react-native';

import i18n from '@/lib/i18n';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

const ACCOUNT_BAN_KEYS = ['message', 'detail', 'title'] as const;
type AccountBanKey = (typeof ACCOUNT_BAN_KEYS)[number];

/**
 * ユーザー向け凍結文言（参照時に現在の言語で解決）。
 * socialLoginErrors と同じ getter パターン。
 *
 * - ACCOUNT_BANNED_MESSAGE → ACCOUNT_BAN_USER_MESSAGES.message
 * - ACCOUNT_BANNED_DETAIL → ACCOUNT_BAN_USER_MESSAGES.detail
 * - showAccountBannedAlert title → ACCOUNT_BAN_USER_MESSAGES.title
 */
export const ACCOUNT_BAN_USER_MESSAGES = Object.defineProperties(
  {} as Readonly<Record<AccountBanKey, string>>,
  Object.fromEntries(
    ACCOUNT_BAN_KEYS.map((key) => [
      key,
      {
        enumerable: true,
        get: () => i18n.t(`errors.banned.${key}`),
      },
    ]),
  ),
);

/** 短い凍結メッセージ（参照時に現在言語） */
export const ACCOUNT_BANNED_MESSAGE = {
  toString: () => ACCOUNT_BAN_USER_MESSAGES.message,
  valueOf: () => ACCOUNT_BAN_USER_MESSAGES.message,
  [Symbol.toPrimitive]: () => ACCOUNT_BAN_USER_MESSAGES.message,
} as unknown as string;

/** 詳細凍結メッセージ（参照時に現在言語） */
export const ACCOUNT_BANNED_DETAIL = {
  toString: () => ACCOUNT_BAN_USER_MESSAGES.detail,
  valueOf: () => ACCOUNT_BAN_USER_MESSAGES.detail,
  [Symbol.toPrimitive]: () => ACCOUNT_BAN_USER_MESSAGES.detail,
} as unknown as string;

export type BanStatus = {
  isBanned: boolean;
  bannedAt?: string | null;
  /** 管理用。UI には出さない */
  banReason?: string | null;
  /** カラム未適用などで判定できなかった */
  unknown?: boolean;
};

let cachedBanByUserId = new Map<string, BanStatus>();

export function isAccountBannedMessage(message: string | null | undefined) {
  if (!message) return false;
  if (/凍結|banned|suspend/i.test(message)) return true;
  return (
    message === ACCOUNT_BAN_USER_MESSAGES.message ||
    message === ACCOUNT_BAN_USER_MESSAGES.detail
  );
}

export function showAccountBannedAlert(
  message: string = ACCOUNT_BAN_USER_MESSAGES.detail,
) {
  const title = ACCOUNT_BAN_USER_MESSAGES.title;
  const body = message.trim() || ACCOUNT_BAN_USER_MESSAGES.detail;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n${body}`);
    return;
  }
  Alert.alert(title, body);
}

export function getCachedBanStatus(userId: string | null | undefined): BanStatus | null {
  if (!userId) return null;
  return cachedBanByUserId.get(userId) ?? null;
}

export function clearCachedBanStatus(userId?: string | null) {
  if (userId) {
    cachedBanByUserId.delete(userId);
    return;
  }
  cachedBanByUserId = new Map();
}

/**
 * profiles.is_banned を取得する。
 * テーブル／カラム未作成時は unknown: true（凍結扱いにしない）。
 */
export async function fetchUserBanStatus(
  userId: string,
): Promise<BanStatus> {
  if (!userId || !isSupabaseConfigured()) {
    return { isBanned: false, unknown: true };
  }
  const client = getSupabaseClient();
  if (!client) return { isBanned: false, unknown: true };

  try {
    const { data, error } = await client
      .from('profiles')
      .select('is_banned, banned_at, ban_reason')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      // カラム未適用などは開発中に起きうる → 凍結扱いにしない
      if (__DEV__) {
        console.warn('[ban] fetchUserBanStatus', error.message);
      }
      const status: BanStatus = { isBanned: false, unknown: true };
      cachedBanByUserId.set(userId, status);
      return status;
    }

    if (!data) {
      const status: BanStatus = { isBanned: false };
      cachedBanByUserId.set(userId, status);
      return status;
    }

    const row = data as {
      is_banned?: boolean | null;
      banned_at?: string | null;
      ban_reason?: string | null;
    };
    const status: BanStatus = {
      isBanned: row.is_banned === true,
      bannedAt: row.banned_at ?? null,
      banReason: row.ban_reason ?? null,
    };
    cachedBanByUserId.set(userId, status);
    return status;
  } catch (error) {
    if (__DEV__) {
      console.warn('[ban] fetchUserBanStatus', error);
    }
    return { isBanned: false, unknown: true };
  }
}

/**
 * 凍結中なら ok: false。アプリはこの結果でログアウト／操作拒否する。
 */
export async function assertAccountNotBanned(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const status = await fetchUserBanStatus(userId);
  if (status.isBanned) {
    return { ok: false, error: ACCOUNT_BAN_USER_MESSAGES.detail };
  }
  return { ok: true };
}
