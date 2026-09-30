/** spotto — アイコン準拠（シアン × サンセットオレンジ）デザインシステム */

const ICON_INACTIVE = '#8A9199';

/**
 * スポーツ / カテゴリ別の識別色（マップピン・チップ非選択時など）
 */
export const CATEGORY_COLORS = {
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
  all: ICON_INACTIVE,
  hot: '#FF8B3D',
} as const;

export type CategoryColorKey = keyof typeof CATEGORY_COLORS;

export function categoryColor(key: string | undefined | null): string {
  if (!key) return ICON_INACTIVE;
  const trimmed = key.trim();
  if (trimmed in CATEGORY_COLORS) {
    return CATEGORY_COLORS[trimmed as CategoryColorKey];
  }
  return ICON_INACTIVE;
}

/** アイコン左上のシアン / スカイブルー */
const BRAND_CYAN = '#29D1E8';
const BRAND_CYAN_DEEP = '#12B8D0';
/** アイコン右下のサンセットオレンジ */
const BRAND_ORANGE = '#FF9533';
const BRAND_ORANGE_SOFT = '#FFE4CC';
/** グラデーション中間（ミント寄り） */
const BRAND_MID = '#A8E8D8';

/**
 * アイコンと同じ斜めグラデーション（左上シアン → 右下オレンジ）
 * LinearGradient の colors / start / end にそのまま渡す
 */
export const brandGradient = {
  /** CTA・FAB・選択中チップ用 */
  cta: [BRAND_CYAN, BRAND_ORANGE] as const,
  /** 画面背景用（やや淡め・3色） */
  soft: ['#7EEAF2', '#E8F8F2', '#FFD4B0'] as const,
  /** マーカー・細いアクセント用 */
  vivid: [BRAND_CYAN, BRAND_MID, BRAND_ORANGE] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
} as const;

export const theme = {
  colors: {
    /** メインアクセント（シアン）— リンク・選択中タブなど単色箇所 */
    primary: BRAND_CYAN,
    primaryDark: BRAND_CYAN_DEEP,
    primarySoft: '#E5F9FC',
    primaryMuted: '#F2FCFE',
    /** プライマリ面上の文字（白の S ロゴに合わせる） */
    onPrimary: '#FFFFFF',
    /** サブアクセント（オレンジ）— 主催バッジ・強調ラベル */
    accent: BRAND_ORANGE,
    accentSoft: BRAND_ORANGE_SOFT,
    accentDark: '#E8742A',
    onAccent: '#FFFFFF',
    /** ライト基調（アイコンの明るい印象に合わせる） */
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F4F7F8',
    surfaceElevated: '#FFFFFF',
    search: '#FFFFFF',
    text: '#12202A',
    textSecondary: '#5B6B75',
    textMuted: '#8A9199',
    border: '#E4EBEE',
    shadow: '#0B1A22',
    danger: '#EF4444',
    accentUnderline: BRAND_CYAN,
    iconInactive: ICON_INACTIVE,
    iconActive: BRAND_CYAN,
    iconActiveBg: '#E5F9FC',
    iconEmpty: '#9AA3AA',
    genderMale: '#38BDF8',
    genderMaleSoft: '#EAF7FB',
    genderMaleBorder: '#7DD3E8',
    genderFemale: '#F472B6',
    genderFemaleSoft: '#FDEFF4',
    genderFemaleBorder: '#F9A8C8',
    /** ホーム背景：アイコン寄りに鮮やかなシアン → ミント → オレンジ */
    homeGradientTop: '#7EEAF2',
    homeGradientMid: '#E8F8F2',
    homeGradientBottom: '#FFD4B0',
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    pill: 999,
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
} as const;
