import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { isHttpUrl, publicApiUrl } from '@/lib/env';
import { resolveAuthUserId } from '@/lib/eventsRemote';
import {
  ensureNotificationPermission,
  isNotificationsModuleAvailable,
} from '@/lib/notificationSettings';
import { fetchWithTimeout } from '@/lib/safeAsync';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export function pushApiUrl() {
  return publicApiUrl('/push', 'EXPO_PUBLIC_PUSH_API_URL');
}

export function isPushApiConfigured() {
  const url = pushApiUrl();
  return Boolean(url && isHttpUrl(url));
}

type NotificationsModule = typeof import('expo-notifications');

function getNotifications(): NotificationsModule | null {
  if (!isNotificationsModuleAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

/**
 * Expo Push Token を取得し、Supabase device_push_tokens に保存する。
 * 未ログイン・権限拒否・モジュールなしでは静かにスキップ。
 */
export async function registerDevicePushToken(): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
}> {
  if (Platform.OS === 'web') {
    return { ok: true, skipped: true };
  }
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true };
  }

  const permission = await ensureNotificationPermission();
  if (!permission.ok) {
    return { ok: false, error: permission.reason, skipped: true };
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return { ok: true, skipped: true };
  }

  const userId = await resolveAuthUserId();
  if (!userId) {
    return { ok: true, skipped: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { ok: true, skipped: true };
  }

  try {
    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResult = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResult.data?.trim();
    if (!token) {
      return { ok: false, error: 'push token empty' };
    }

    const { error } = await client.from('device_push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    );

    if (error) {
      if (__DEV__) console.warn('[push] upsert failed', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (error) {
    if (__DEV__) console.warn('[push] register failed', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'register failed',
    };
  }
}

/** ログアウト時などに端末トークンを削除（任意） */
export async function unregisterDevicePushToken(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = getSupabaseClient();
  const userId = await resolveAuthUserId();
  if (!client || !userId) return;

  try {
    const Notifications = getNotifications();
    if (!Notifications) {
      await client.from('device_push_tokens').delete().eq('user_id', userId);
      return;
    }
    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResult = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResult.data?.trim();
    if (token) {
      await client
        .from('device_push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('token', token);
    }
  } catch {
    // ログアウトを止めない
  }
}

/**
 * 他ユーザーへ Expo Push を送る（サーバーが service role でトークン解決）。
 * 未設定・失敗でも呼び出し元のフローは止めない。
 */
export async function sendPushToUsers(input: {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const recipients = [
    ...new Set(
      input.userIds
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (recipients.length === 0) {
    return { ok: true, skipped: true };
  }

  const url = pushApiUrl();
  if (!url) {
    if (__DEV__) {
      console.info('[push:console]', {
        userIds: recipients,
        title: input.title,
        body: input.body,
      });
    }
    return { ok: true, skipped: true };
  }

  try {
    const { getCurrentFirebaseAccessToken } = await import('@/lib/currentUser');
    const accessToken = await getCurrentFirebaseAccessToken(false);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userIds: recipients,
        title: input.title.slice(0, 80),
        body: input.body.slice(0, 180),
        data: input.data ?? {},
      }),
      timeoutMs: 12_000,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { ok: true };
  } catch (error) {
    if (__DEV__) console.warn('[push] send failed', error);
    return { ok: false };
  }
}

/** チャットメッセージ受信向けプッシュ */
export async function notifyChatMessagePush(input: {
  recipientUserIds: string[];
  senderName: string;
  preview: string;
  eventId: string;
  mode: string;
}): Promise<void> {
  const preview = input.preview.trim() || '新しいメッセージ';
  const mode = input.mode === 'host' ? 'host' : 'group';
  const eventId = String(input.eventId || '').trim();
  void sendPushToUsers({
    userIds: input.recipientUserIds,
    title: input.senderName.trim() || 'メッセージ',
    body: preview.length > 80 ? `${preview.slice(0, 80)}…` : preview,
    data: {
      type: 'chat_message',
      eventId,
      mode,
      chatMode: mode,
      path: `/chat/${eventId}/${mode}`,
    },
  });
}

/** イベント更新・キャンセルなどのお知らせプッシュ */
export async function notifyEventUpdatePush(input: {
  recipientUserIds: string[];
  title: string;
  body: string;
  eventId: string;
}): Promise<void> {
  const eventId = String(input.eventId || '').trim();
  void sendPushToUsers({
    userIds: input.recipientUserIds,
    title: input.title,
    body: input.body,
    data: {
      type: 'event_update',
      eventId,
      path: `/event/${eventId}`,
    },
  });
}
