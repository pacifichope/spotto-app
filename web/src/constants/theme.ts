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
