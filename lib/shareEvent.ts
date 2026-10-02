import { Platform, Share } from 'react-native';

import {
  createEventDeepLink,
  createEventWebUrl,
} from '@/lib/appLinking';
import {
  levelDisplayLabel,
  sportDisplayLabel,
} from '@/lib/createEventLabels';
import {
  formatEventDate,
  formatLocationLabel,
  sortEventSessions,
  type SportEvent,
} from '@/lib/events';
import { localizedEventTitle } from '@/lib/eventLocalizedText';
import i18n from '@/lib/i18n';

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
    return i18n.t('share.sessionsMore', {
      first: firstLabel,
      count: sorted.length,
    });
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
    localizedEventTitle(event),
    '',
    `📅 ${dateTime}`,
    `📍 ${location}`,
  ];

  if (event.sport) {
    const sport = sportDisplayLabel(event.sport);
    const level = event.level ? levelDisplayLabel(event.level) : '';
    lines.push(`🏷 ${sport}${level ? ` · ${level}` : ''}`);
  }

  const host = String(event.host || '').trim();
  if (host) {
    lines.push(`👤 ${i18n.t('share.host', { name: host })}`);
  }

  if (includeUrl) {
    lines.push('', '──', i18n.t('share.cta'), webUrl);

    // 開発ビルドなど Web とディープリンクが異なる場合のみ併記
    if (deepLink && deepLink !== webUrl && !deepLink.startsWith('https://')) {
      lines.push('', i18n.t('share.openInApp', { url: deepLink }));
    }
  }

  return lines.join('\n');
}

export async function shareEvent(event: SportEvent) {
  const url = getEventShareUrl(event.id);
  const title =
    localizedEventTitle(event).trim() || i18n.t('events.defaultTitle');

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
          dialogTitle: i18n.t('share.dialogTitle'),
          subject: title,
        },
      );
    }
  } catch {
    // 共有キャンセルや未対応環境は無視
  }
}
