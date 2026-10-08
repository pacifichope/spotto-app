import { createAuthedSupabase } from '@/lib/supabase';

export type NotificationPreferenceKey =
  | 'eventReminders'
  | 'chatMessages'
  | 'eventUpdates';

export type NotificationSettings = Record<NotificationPreferenceKey, boolean>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  eventReminders: false,
  chatMessages: false,
  eventUpdates: false,
};

export const NOTIFICATION_PREF_ROWS: {
  key: NotificationPreferenceKey;
  label: string;
  caption: string;
}[] = [
  {
    key: 'eventReminders',
    label: 'イベントのリマインダー',
    caption: '前日・当日の開始をお知らせします',
  },
  {
    key: 'chatMessages',
    label: 'メッセージ・チャットの通知',
    caption: '新しいメッセージを受け取ります',
  },
  {
    key: 'eventUpdates',
    label: 'イベントの更新・変更のお知らせ',
    caption: '時間・場所などの変更をお知らせします',
  },
];

const STORAGE_KEY = 'spotto_web_notification_settings_v1';

function parseSettings(raw: unknown): NotificationSettings {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    eventReminders: value.eventReminders === true,
    chatMessages: value.chatMessages === true,
    eventUpdates: value.eventUpdates === true,
  };
}

function loadLocal(userId: string): NotificationSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_NOTIFICATION_SETTINGS };
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    return parseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

function saveLocal(userId: string, settings: NotificationSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    `${STORAGE_KEY}:${userId}`,
    JSON.stringify(settings),
  );
}

function rowToSettings(row: {
  event_reminders?: boolean;
  chat_messages?: boolean;
  event_updates?: boolean;
}): NotificationSettings {
  return {
    eventReminders: row.event_reminders === true,
    chatMessages: row.chat_messages === true,
    eventUpdates: row.event_updates === true,
  };
}

/** ローカルとリモートを読み、リモート優先でマージ */
export async function loadNotificationSettings(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<NotificationSettings> {
  const uid = input.userId.trim();
  const local = loadLocal(uid);
  try {
    const supabase = createAuthedSupabase(input.getIdToken);
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('event_reminders, chat_messages, event_updates')
      .eq('user_id', uid)
      .maybeSingle();
    if (error || !data) return local;
    const remote = rowToSettings(data as Record<string, boolean>);
    saveLocal(uid, remote);
    return remote;
  } catch {
    return local;
  }
}

/** 即時にローカル＋Supabase へ保存 */
export async function saveNotificationSettings(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
  settings: NotificationSettings;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const uid = input.userId.trim();
  if (!uid) return { ok: false, error: 'ログインが必要です' };
  const next = parseSettings(input.settings);
  saveLocal(uid, next);

  try {
    const supabase = createAuthedSupabase(input.getIdToken);
    const { error } = await supabase.from('notification_preferences').upsert(
      {
        user_id: uid,
        event_reminders: next.eventReminders,
        chat_messages: next.chatMessages,
        event_updates: next.eventUpdates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      return {
        ok: false,
        error:
          error.message ||
          '通知設定の保存に失敗しました（端末には保存済みです）',
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '通知設定の保存に失敗しました（端末には保存済みです）',
    };
  }
}

export type BrowserNotificationPermission =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied';

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * 通知を初めて ON にするときにブラウザの許可ダイアログを出す。
 * すでに許可済みなら成功。拒否済み・未対応なら reason を返す。
 */
export async function ensureBrowserNotificationPermission(): Promise<
  | { ok: true; permission: BrowserNotificationPermission }
  | { ok: false; reason: 'unsupported' | 'denied'; permission: BrowserNotificationPermission }
> {
  const current = getBrowserNotificationPermission();
  if (current === 'unsupported') {
    return { ok: false, reason: 'unsupported', permission: current };
  }
  if (current === 'granted') {
    return { ok: true, permission: current };
  }
  if (current === 'denied') {
    return { ok: false, reason: 'denied', permission: current };
  }
  try {
    const next = await Notification.requestPermission();
    if (next === 'granted') {
      return { ok: true, permission: 'granted' };
    }
    return { ok: false, reason: 'denied', permission: next };
  } catch {
    return { ok: false, reason: 'unsupported', permission: 'unsupported' };
  }
}

export function browserPermissionLabel(permission: BrowserNotificationPermission) {
  switch (permission) {
    case 'granted':
      return 'ブラウザ通知: 許可済み';
    case 'denied':
      return 'ブラウザ通知: ブロック中（サイト設定から変更できます）';
    case 'default':
      return 'ブラウザ通知: 未設定（通知をオンにすると許可を求めます）';
    default:
      return 'このブラウザでは通知 API を利用できません';
  }
}
