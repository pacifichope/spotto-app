import Constants from 'expo-constants';
import * as Linking from 'expo-linking';

import { readPublicEnv } from '@/lib/env';

export const APP_SCHEME = 'spotto';
export const WEB_HOST = 'spotto.fun';
const DEFAULT_WEB_ORIGIN = `https://${WEB_HOST}`;

function webOrigin() {
  const configured = readPublicEnv('EXPO_PUBLIC_WEB_BASE_URL').replace(
    /\/+$/,
    '',
  );
  return configured || DEFAULT_WEB_ORIGIN;
}

/**
 * スタンドアロン／Dev Client 向けのアプリ内ディープリンク。
 * Expo Go では exp://.../--/ 形式になる。
 *
 * 例: spotto://event/abc123
 */
export function createAppDeepLink(path: string) {
  const normalized = String(path || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  if (Constants.appOwnership === 'expo') {
    return Linking.createURL(normalized);
  }

  // createURL は scheme が単一なら spotto://... を返す。
  // 明示スキームで安定させる（ビルド警告・複数 scheme 競合の再発防止）。
  const viaLinking = Linking.createURL(normalized, { scheme: APP_SCHEME });
  if (
    viaLinking.startsWith(`${APP_SCHEME}:`) ||
    viaLinking.startsWith('exp:') ||
    viaLinking.startsWith('exps:')
  ) {
    return viaLinking;
  }
  return `${APP_SCHEME}://${normalized}`;
}

/** https://spotto.fun/event/{id} */
export function createEventWebUrl(eventId: string) {
  return `${webOrigin()}/event/${encodeURIComponent(eventId)}`;
}

/** spotto://event/{id} （または Expo Go 相当） */
export function createEventDeepLink(eventId: string) {
  return createAppDeepLink(`event/${eventId}`);
}

/** https://spotto.fun/club/{id} */
export function createClubWebUrl(clubId: string) {
  return `${webOrigin()}/club/${encodeURIComponent(clubId)}`;
}

export function createClubDeepLink(clubId: string) {
  return createAppDeepLink(`club/${clubId}`);
}
