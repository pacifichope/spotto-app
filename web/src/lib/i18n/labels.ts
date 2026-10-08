/** スポーツ・エリア・カテゴリなどデータ値 → 辞書キー */

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

const AREA_KEYS: Record<string, string> = {
  現在地付近: 'area.nearby',
  東京: 'area.tokyo',
  神奈川: 'area.kanagawa',
  埼玉: 'area.saitama',
  千葉: 'area.chiba',
  愛知: 'area.aichi',
  大阪: 'area.osaka',
  京都: 'area.kyoto',
  福岡: 'area.fukuoka',
  北海道: 'area.hokkaido',
};

type TFn = (key: string, params?: Record<string, string | number>) => string;

export function sportLabel(sport: string, t: TFn): string {
  const key = SPORT_KEYS[sport.trim()];
  if (key) return t(key);
  return sport.trim() || t('sport.generic');
}

export function areaLabel(area: string, t: TFn): string {
  const key = AREA_KEYS[area.trim()];
  if (key) return t(key);
  return area;
}

export function categoryLabel(id: string, t: TFn): string {
  if (id === 'all') return t('sport.all');
  if (id === 'hot') return t('sport.hot');
  return sportLabel(id, t);
}
