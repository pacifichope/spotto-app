import { Alert, Platform } from 'react-native';

import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

/** ユーザー向け凍結メッセージ（ログイン画面・マイページ共通） */
export const ACCOUNT_BANNED_MESSAGE = 'アカウントが凍結されています';

export const ACCOUNT_BANNED_DETAIL =
  'アカウントが凍結されています。ご不明な点はサポートまでお問い合わせください。';

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
  return Boolean(message && /凍結/.test(message));
}

export function showAccountBannedAlert(
  message: string = ACCOUNT_BANNED_DETAIL,
) {
  const title = 'アカウント凍結';
  const body = message.trim() || ACCOUNT_BANNED_DETAIL;
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
    return { ok: false, error: ACCOUNT_BANNED_DETAIL };
  }
  return { ok: true };
}
