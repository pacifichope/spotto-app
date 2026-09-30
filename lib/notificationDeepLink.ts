import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { chatRoomHref, eventDetailHref } from '@/lib/chatNavigation';
import { parseChatMode, type EventChatMode } from '@/lib/chats';
import { isNotificationsModuleAvailable } from '@/lib/notificationSettings';

type NotificationsModule = typeof import('expo-notifications');

export type NotificationNavTarget =
  | { kind: 'chat'; eventId: string; mode: EventChatMode }
  | { kind: 'event'; eventId: string }
  | { kind: 'sales' };

function getNotifications(): NotificationsModule | null {
  if (!isNotificationsModuleAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * Expo Push の data から遷移先を解決。
 * （値はすべて string 化されている想定）
 */
export function parseNotificationNavTarget(
  data: unknown,
): NotificationNavTarget | null {
  const record = asRecord(data);
  const type = asString(record.type || record.kind).toLowerCase();
  const eventId = asString(record.eventId || record.event_id);
  const modeRaw = asString(record.mode || record.chatMode || record.chat_mode);
  const screen = asString(record.screen).toLowerCase();
  const path = asString(record.path || record.url);

  if (
    type === 'payout_paid' ||
    screen === 'sales' ||
    path.includes('/settings/sales')
  ) {
    return { kind: 'sales' };
  }

  if (
    (type === 'chat_message' || type === 'chat' || path.includes('/chat/')) &&
    eventId
  ) {
    return {
      kind: 'chat',
      eventId,
      mode: parseChatMode(modeRaw || 'group'),
    };
  }

  if (
    (type === 'event_update' ||
      type === 'event' ||
      type === 'booking_confirmed' ||
      path.includes('/event/')) &&
    eventId
  ) {
    return { kind: 'event', eventId };
  }

  // path だけ渡された場合
  const chatMatch = path.match(/\/chat\/([^/]+)\/(group|host)/i);
  if (chatMatch) {
    return {
      kind: 'chat',
      eventId: chatMatch[1],
      mode: parseChatMode(chatMatch[2]),
    };
  }
  const eventMatch = path.match(/\/event\/([^/?#]+)/i);
  if (eventMatch) {
    return { kind: 'event', eventId: eventMatch[1] };
  }

  return null;
}

export function hrefForNotificationTarget(
  target: NotificationNavTarget,
): Href {
  if (target.kind === 'chat') {
    return chatRoomHref(target.eventId, target.mode);
  }
  if (target.kind === 'event') {
    return eventDetailHref(target.eventId);
  }
  return '/settings/sales' as Href;
}

function targetFromResponse(response: {
  notification?: { request?: { content?: { data?: unknown } } };
}): NotificationNavTarget | null {
  return parseNotificationNavTarget(
    response?.notification?.request?.content?.data,
  );
}

/**
 * 通知タップでチャット／イベント詳細などへ直接遷移する。
 * コールドスタート（タップで起動）とフォアグラウンド中のタップの両方に対応。
 */
export function useNotificationDeepLinks() {
  const router = useRouter();
  const handledIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const Notifications = getNotifications();
    if (!Notifications) return;

    const navigate = (
      target: NotificationNavTarget | null,
      responseId?: string,
    ) => {
      if (!target) return;
      const key =
        responseId ||
        `${target.kind}:${'eventId' in target ? target.eventId : 'sales'}:${
          target.kind === 'chat' ? target.mode : ''
        }`;
      if (handledIdsRef.current.has(key)) return;
      handledIdsRef.current.add(key);
      // ナビ準備後に遷移（ルートツリー構築直後の race を避ける）
      requestAnimationFrame(() => {
        try {
          router.push(hrefForNotificationTarget(target));
        } catch (error) {
          if (__DEV__) {
            console.warn('[notification] navigate failed', error);
          }
        }
      });
    };

    // 表示中もバナーを出す（既定だと foreground で黙ることがある）
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    } catch {
      // 古い SDK 互換: 失敗してもディープリンクは続行
    }

    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const id = String(response?.notification?.request?.identifier || '');
        navigate(targetFromResponse(response), id || undefined);
      },
    );

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const id = String(response.notification?.request?.identifier || '');
        navigate(targetFromResponse(response), id ? `cold:${id}` : undefined);
      })
      .catch(() => undefined);

    return () => {
      sub.remove();
    };
  }, [router]);
}
