/** モバイルアプリ constants/theme.ts と同じブランドカラー。 */

export const brand = {
  cyan: '#29D1E8',
  cyanDeep: '#12B8D0',
  orange: '#FF9533',
  orangeSoft: '#FFE4CC',
  mid: '#A8E8D8',
  gradientSoft: ['#7EEAF2', '#E8F8F2', '#FFD4B0'] as const,
  gradientCta: ['#29D1E8', '#FF9533'] as const,
} as const;

export const theme = {
  colors: {
    primary: brand.cyan,
    primaryDark: brand.cyanDeep,
    primarySoft: '#E5F9FC',
    accent: brand.orange,
    accentDark: '#E8742A',
    onPrimary: '#FFFFFF',
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F4F7F8',
    text: '#12202A',
    textSecondary: '#5B6B75',
    textMuted: '#8A9199',
    border: '#E4EBEE',
    shadow: '#0B1A22',
    danger: '#EF4444',
    homeGradientTop: brand.gradientSoft[0],
    homeGradientMid: brand.gradientSoft[1],
    homeGradientBottom: brand.gradientSoft[2],
  },
  radius: {
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    pill: 999,
  },
} as const;

export const CATEGORIES = [
  { id: 'all', label: 'すべて' },
  { id: 'hot', label: '人気' },
  { id: 'サッカー', label: 'サッカー' },
  { id: 'バスケットボール', label: 'バスケ' },
  { id: 'テニス', label: 'テニス' },
  { id: 'ランニング', label: 'ランニング' },
  { id: 'フットサル', label: 'フットサル' },
  { id: 'バドミントン', label: 'バドミントン' },
  { id: 'バレーボール', label: 'バレー' },
  { id: 'その他', label: 'その他' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const AREAS = [
  '現在地付近',
  '東京',
  '神奈川',
  '埼玉',
  '千葉',
  '愛知',
  '大阪',
  '京都',
  '福岡',
  '北海道',
] as const;

const PRIMARY_SPORTS = new Set<string>(
  CATEGORIES.map((category) => category.id).filter(
    (id) => id !== 'all' && id !== 'hot' && id !== 'その他',
  ),
);

export function eventMatchesCategory(sport: string, joinedCount: number, category: CategoryId) {
  if (category === 'all') return true;
  if (category === 'hot') return joinedCount >= 8;
  if (category === 'その他') return !PRIMARY_SPORTS.has(sport);
  return sport === category;
}

function unsplash(id: string) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;
}

export const SPORT_COVERS: Record<string, string> = {
  サッカー: unsplash('photo-1579952363873-27f3bade9f55'),
  バスケットボール: unsplash('photo-1546519638-68e109498ffc'),
  テニス: unsplash('photo-1554068865-24cecd4e34b8'),
  ランニング:
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-sakura.jpg',
  フットサル:
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-futsal-1.jpg',
  バレーボール: unsplash('photo-1612872087720-bb876e2e67d1'),
  バドミントン: unsplash('photo-1626224583764-f87db24ac4ea'),
  野球: unsplash('photo-1529768167801-9173d94c2a42'),
  その他: unsplash('photo-1544367567-0f2fcb009e0b'),
};

export function sportCover(sport: string) {
  return SPORT_COVERS[sport] || unsplash('photo-1461896836934-ffe607ba6851');
}

export const CATEGORY_COLORS: Record<string, string> = {
  サッカー: '#0F6E56',
  フットサル: '#0F6E56',
  バスケットボール: '#BA7517',
  バスケ: '#BA7517',
  野球: '#185FA5',
  ランニング: '#0E7490',
  バドミントン: '#BE185D',
  テニス: '#4D7C0F',
  バレーボール: '#7C3AED',
  バレー: '#7C3AED',
  ヨガ: '#9333EA',
  その他: '#57534E',
};

export function categoryColor(sport: string) {
  return CATEGORY_COLORS[sport.trim()] || '#8A9199';
}

export const SPORT_EMOJIS: Record<string, string> = {
  サッカー: '⚽',
  フットサル: '⚽',
  バスケットボール: '🏀',
  バスケ: '🏀',
  テニス: '🎾',
  ランニング: '🏃',
  バドミントン: '🏸',
  バレーボール: '🏐',
  バレー: '🏐',
  野球: '⚾',
  ヨガ: '🧘',
  その他: '🏷️',
};

export function sportEmoji(sport: string) {
  return SPORT_EMOJIS[sport.trim()] || '🏅';
}

/** 座標が無いイベント用の都道府県フォールバック（概位置）。 */
export const AREA_CENTERS: { match: string; lat: number; lng: number }[] = [
  { match: '北海道', lat: 43.0618, lng: 141.3545 },
  { match: '札幌', lat: 43.0618, lng: 141.3545 },
  { match: '東京', lat: 35.6812, lng: 139.7671 },
  { match: '渋谷', lat: 35.6595, lng: 139.7004 },
  { match: '新宿', lat: 35.6938, lng: 139.7034 },
  { match: '大阪', lat: 34.7024, lng: 135.4959 },
  { match: '京都', lat: 35.0116, lng: 135.7681 },
  { match: '愛知', lat: 35.1709, lng: 136.8815 },
  { match: '名古屋', lat: 35.1709, lng: 136.8815 },
  { match: '福岡', lat: 33.5902, lng: 130.4017 },
  { match: '神奈川', lat: 35.4437, lng: 139.638 },
  { match: '横浜', lat: 35.4437, lng: 139.638 },
  { match: '埼玉', lat: 35.8617, lng: 139.6455 },
  { match: '千葉', lat: 35.6074, lng: 140.1065 },
];

export function resolveEventCoords(event: {
  latitude: number | null;
  longitude: number | null;
  location: string;
}): { lat: number; lng: number; approximate: boolean } | null {
  if (event.latitude != null && event.longitude != null) {
    return { lat: event.latitude, lng: event.longitude, approximate: false };
  }
  const place = event.location || '';
  for (const area of AREA_CENTERS) {
    if (place.includes(area.match)) {
      return { lat: area.lat, lng: area.lng, approximate: true };
    }
  }
  return null;
}
