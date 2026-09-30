import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

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

const STORAGE_KEY = '@spotto/notification-settings';

type NotificationsModule = typeof import('expo-notifications');
type AsyncStorageType =
  typeof import('@react-native-async-storage/async-storage').default;

let memoryCache: NotificationSettings | null = null;

function getAsyncStorage(): AsyncStorageType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage')
      .default as AsyncStorageType;
  } catch {
    return null;
  }
}

export function isNotificationsModuleAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  return (
    requireOptionalNativeModule('ExpoNotificationPermissionsModule') != null
  );
}

function getNotifications(): NotificationsModule | null {
  if (!isNotificationsModuleAvailable()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as NotificationsModule;
}

function parseSettings(raw: unknown): NotificationSettings {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    eventReminders: value.eventReminders === true,
    chatMessages: value.chatMessages === true,
    eventUpdates: value.eventUpdates === true,
  };
}

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  if (memoryCache) return { ...memoryCache };
  try {
    const storage = getAsyncStorage();
    const raw = storage ? await storage.getItem(STORAGE_KEY) : null;
    memoryCache = raw
      ? parseSettings(JSON.parse(raw))
      : { ...DEFAULT_NOTIFICATION_SETTINGS };
  } catch {
    memoryCache = { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
  return { ...memoryCache };
}

export async function saveNotificationSettings(
  next: NotificationSettings,
): Promise<void> {
  memoryCache = { ...next };
  try {
    const storage = getAsyncStorage();
    await storage?.setItem(STORAGE_KEY, JSON.stringify(memoryCache));
  } catch {
    // ネイティブ未リンク時などはメモリ上だけ保持する
  }
}

export async function resetNotificationSettings(): Promise<void> {
  await saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS });
}

function isPermissionGranted(
  Notifications: NotificationsModule,
  status: Awaited<ReturnType<NotificationsModule['getPermissionsAsync']>>,
): boolean {
  return (
    status.granted === true ||
    status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    status.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
  );
}

export type NotificationPermissionResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' };

/**
 * 通知を初めて ON にするときに OS の許可ダイアログを出す。
 * すでに許可済みなら何も出さず成功扱い。拒否済みなら denied。
 */
export async function ensureNotificationPermission(): Promise<NotificationPermissionResult> {
  if (Platform.OS === 'web') {
    return { ok: true };
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'お知らせ',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#29D1E8',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    if (isPermissionGranted(Notifications, existing)) {
      return { ok: true };
    }

    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    if (isPermissionGranted(Notifications, requested)) {
      return { ok: true };
    }
    return { ok: false, reason: 'denied' };
  } catch {
    return { ok: false, reason: 'unsupported' };
  }
}
