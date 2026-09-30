import { Platform, Share } from 'react-native';

import {
  createEventDeepLink,
  createEventWebUrl,
} from '@/lib/appLinking';
import {
  formatEventDate,
  formatLocationLabel,
  sortEventSessions,
  type SportEvent,
} from '@/lib/events';

/** アプリ内ディープリンク（spotto://event/... / Expo 開発 URI） */
export function getEventDeepLink(eventId: string) {
  return createEventDeepLink(eventId);
}

/**
 * 共有用の Web URL。
 * EXPO_PUBLIC_WEB_BASE_URL があれば優先（末尾スラッシュ除去）。
 * 未設定時は spotto.fun（利用規約・プライバシーと同ドメイン）。
 */
export function getEventWebUrl(eventId: string) {
  return createEventWebUrl(eventId);
}

/** 共有に載せる主リンク（Web 優先。アプリ未導入でも開ける） */
export function getEventShareUrl(eventId: string) {
  return getEventWebUrl(eventId);
}

function formatShareDateTime(event: SportEvent) {
  if (event.sessions && event.sessions.length > 1) {
    const sorted = sortEventSessions(event.sessions);
    const first = sorted[0];
    const firstLabel = formatEventDate(
      first.date,
      first.time,
      first.endTime,
      first.endDate,
    ).full;
    return `${firstLabel} ほか全${sorted.length}回`;
  }
  return formatEventDate(
    event.date,
    event.time,
    event.endTime,
    event.endDate,
  ).full;
}

export function buildEventShareMessage(
  event: SportEvent,
  options?: { includeUrl?: boolean },
) {
  const includeUrl = options?.includeUrl !== false;
  const dateTime = formatShareDateTime(event);
  const location = formatLocationLabel(event.location, event.locationNote);
  const webUrl = getEventWebUrl(event.id);
  const deepLink = getEventDeepLink(event.id);

  const lines = [
    event.title,
    '',
    `📅 ${dateTime}`,
    `📍 ${location}`,
  ];

  if (event.sport) {
    lines.push(
      `🏷 ${event.sport}${event.level ? ` · ${event.level}` : ''}`,
    );
  }

  const host = String(event.host || '').trim();
  if (host) {
    lines.push(`👤 主催: ${host}`);
  }

  if (includeUrl) {
    lines.push('', '──', '詳細・参加はこちら', webUrl);

    // 開発ビルドなど Web とディープリンクが異なる場合のみ併記
    if (deepLink && deepLink !== webUrl && !deepLink.startsWith('https://')) {
      lines.push('', `アプリで開く: ${deepLink}`);
    }
  }

  return lines.join('\n');
}

export async function shareEvent(event: SportEvent) {
  const url = getEventShareUrl(event.id);
  const title = event.title.trim() || 'イベント';

  try {
    // iOS は url を別フィールドで渡すと共有シートが綺麗に載る（message 内の重複を避ける）。
    // Android は url を無視することが多いので message に含める。
    if (Platform.OS === 'ios') {
      await Share.share(
        {
          title,
          message: buildEventShareMessage(event, { includeUrl: false }),
          url,
        },
        {
          subject: title,
        },
      );
    } else {
      await Share.share(
        {
          title,
          message: buildEventShareMessage(event),
        },
        {
          dialogTitle: 'イベントをシェア',
          subject: title,
        },
      );
    }
  } catch {
    // 共有キャンセルや未対応環境は無視
  }
}
