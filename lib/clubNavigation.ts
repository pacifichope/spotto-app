import type { Href } from 'expo-router';

/**
 * クラブ詳細への Href。
 * Firebase UID や日本語を含む id でも壊れないよう、pathname + params 形式を使う。
 */
export function clubHref(clubId: string): Href {
  const id = String(clubId || '').trim();
  return {
    pathname: '/club/[id]',
    params: { id },
  } as Href;
}
