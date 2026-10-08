/** スポーツ・エリア・カテゴリなどデータ値 → 辞書キー */

import {
  getPrefectureByShortLabel,
  NEARBY_AREA,
} from '@/lib/areas';
import type { Locale } from '@/lib/i18n/types';

const SPORT_KEYS: Record<string, string> = {
  サッカー: 'sport.soccer',
  バスケットボール: 'sport.basketball',
  バスケ: 'sport.basketball',
  テニス: 'sport.tennis',
  ランニング: 'sport.running',
  フットサル: 'sport.futsal',
  バドミントン: 'sport.badminton',
  バレーボール: 'sport.volleyball',
  バレー: 'sport.volleyball',
  その他: 'sport.other',
  all: 'sport.all',
  hot: 'sport.hot',
};

type TFn = (key: string, params?: Record<string, string | number>) => string;

export function sportLabel(sport: string, t: TFn): string {
  const key = SPORT_KEYS[sport.trim()];
  if (key) return t(key);
  return sport.trim() || t('sport.generic');
}

export function areaLabel(
  area: string,
  t: TFn,
  locale: Locale = 'ja',
): string {
  const value = area.trim();
  if (value === NEARBY_AREA || value === 'nearby') {
    return t('area.nearby');
  }
  const prefecture = getPrefectureByShortLabel(value);
  if (prefecture) {
    return locale === 'en' ? prefecture.nameEn : prefecture.shortLabel;
  }
  return value;
}

export function categoryLabel(id: string, t: TFn): string {
  if (id === 'all') return t('sport.all');
  if (id === 'hot') return t('sport.hot');
  return sportLabel(id, t);
}
