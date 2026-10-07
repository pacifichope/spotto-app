import type { PreQuestion } from '@/lib/preQuestions';
import type { EventAttendee } from '@/lib/attendees';
import type { SnsLink } from '@/lib/snsLinks';
import { shouldShowDemoEvents } from '@/lib/devTestFlags';
import { compactLocationAddress } from '@/lib/formatLocationAddress';
import i18n from '@/lib/i18n';

export { compactLocationAddress };

export type SkillLevel = '初心者' | '中級' | '上級' | '誰でも歓迎';

export type EventSession = {
  date: string;
  time: string;
  endDate?: string;
  endTime?: string;
};

export type SportEvent = {
  id: string;
  title: string;
  sport: string;
  emoji: string;
  location: string;
  /** 集合場所の補足（例: 体育館2階、正面入り口集合） */
  locationNote?: string;
  date: string;
  time: string;
  level: SkillLevel;
  /** 参加しやすい年齢層・雰囲気の目安（任意・複数可） */
  targetAgeGroups?: string[];
  latitude: number;
  longitude: number;
  spotsLeft: number;
  capacity: number;
  joinedCount: number;
  host: string;
  /** 自分の主催イベントなら 'me' */
  hostId?: string;
  hostImageUri?: string;
  hostBio?: string;
  /** @deprecated 連絡先フィールドは廃止。互換のため残置 */
  hostContact?: string;
  /** @deprecated hostSnsLinks を優先 */
  hostSnsUrl?: string;
  /** 主催者の SNS / Web リンク */
  hostSnsLinks?: SnsLink[];
  /** 一言の雰囲気（カード用の短い要約。参加費などは入れない） */
  vibe: string;
  /** 主催者による詳しい説明（イベント内容の本文） */
  description: string;
  /** 作成時の原文言語（ja / en） */
  sourceLang?: 'ja' | 'en';
  /** 表示用タイトル（日本語） */
  titleJa?: string;
  /** 表示用タイトル（英語） */
  titleEn?: string;
  /** 表示用説明（日本語） */
  descriptionJa?: string;
  /** 表示用説明（英語） */
  descriptionEn?: string;
  /** 自動翻訳完了日時（ISO） */
  translatedAt?: string;
  /** バナー / サムネイル画像 URL（先頭写真） */
  imageUri: string;
  /** ギャラリー画像（最大 MAX_EVENT_PHOTOS 枚）。未設定時は imageUri のみ */
  imageUris?: string[];
  accent: string;
  /** イベント開始の何時間前に締め切るか。0 = 開始時、'end' = 終了時 */
  registrationDeadlineOffset?: RegistrationDeadlineOffset;
  /** @deprecated キャンセル待ち廃止。常に false として扱う */
  waitlistEnabled?: boolean;
  /** @deprecated キャンセル待ち廃止。常に 0 */
  waitlistCount?: number;
  /** 参加メンバー。未設定時はサンプル参加者を生成 */
  attendees?: EventAttendee[];
  enablePreQuestions?: boolean;
  preQuestions?: PreQuestion[];
  /** 終了時刻 HH:mm。未設定時は開始時刻のみ表示 */
  endTime?: string;
  /** 終了日 YYYY-MM-DD。未設定または開始日と同じなら同日扱い */
  endDate?: string;
  /** 単発/複数回（作成時の指定。公開後は開催回ごとに独立行になる） */
  scheduleType?: 'single' | 'recurring';
  /**
   * レガシー: 1イベントに複数セッションをぶら下げる形式。
   * 新規作成では展開して空になり、各日程は別 events 行になる。
   */
  sessions?: EventSession[];
  /**
   * 同一作成から展開した開催回を束ねる ID。
   * 参加・定員は event id ごとに独立。詳細の日付切替で兄弟開催へ遷移する。
   */
  seriesId?: string;
  /** 参加者が持参するもの */
  itemsToBring?: string[];
  /** 参加費・会場側に含まれているもの */
  includedItems?: string[];
  /** 1人あたりの参加費（円）。0 または未設定は無料 */
  priceYen?: number;
  /** キャンセル・返金ポリシー（例: 開催の2日前までキャンセル無料、以降は返金なし） */
  cancelPolicy?: string;
  /** 主催者がイベントを中止した日時（ISO）。未設定なら開催中 */
  cancelledAt?: string;
  /** 主催者による中止理由（任意） */
  cancelReason?: string;
};

export const MAX_EVENT_PHOTOS = 5;
export const MAX_EVENT_ITEMS = 8;
export const MAX_EVENT_ITEM_LENGTH = 24;
export const MAX_TARGET_AGE_GROUP_LENGTH = 24;
export const MAX_TARGET_AGE_GROUPS = 6;

export const TARGET_AGE_PRESETS = [
  '全世代ウェルカム',
  '学生向け',
  '20代中心',
  '20〜30代中心',
  '30〜40代中心',
  '40代以上歓迎',
] as const;

export function sanitizeTargetAgeGroups(
  raw?: string | string[] | null,
): string[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of list) {
    const value = String(item)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TARGET_AGE_GROUP_LENGTH);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
    if (next.length >= MAX_TARGET_AGE_GROUPS) break;
  }
  return next;
}

export function sanitizeEventItems(items?: string[] | null): string[] {
  if (!items?.length) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of items) {
    const value = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_EVENT_ITEM_LENGTH);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
    if (next.length >= MAX_EVENT_ITEMS) break;
  }
  return next;
}

export function parseEventItemDraft(raw: string): string[] {
  return sanitizeEventItems(raw.split(/[、,]/));
}

export const SHIBUYA_CENTER = {
  latitude: 35.6595,
  longitude: 139.7005,
} as const;

export const TOKYO_REGION = {
  latitude: SHIBUYA_CENTER.latitude,
  longitude: SHIBUYA_CENTER.longitude,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

export const NEARBY_DELTA = {
  latitudeDelta: 0.035,
  longitudeDelta: 0.035,
};

export const TOKYO_NEARBY_KM = 40; // @deprecated NEARBY_RADIUS_KM（lib/areas）を使用


export const OTHER_SPORT_LABEL = 'その他';

export const CATEGORIES = [
  { id: 'all', label: 'すべて', emoji: '✨' },
  { id: 'hot', label: '人気', emoji: '🔥' },
  { id: 'サッカー', label: 'サッカー', emoji: '⚽️' },
  { id: 'バスケットボール', label: 'バスケ', emoji: '🏀' },
  { id: 'テニス', label: 'テニス', emoji: '🎾' },
  { id: 'ランニング', label: 'ランニング', emoji: '🏃' },
  { id: 'フットサル', label: 'フットサル', emoji: '⚽️' },
  { id: 'バドミントン', label: 'バドミントン', emoji: '🏸' },
  { id: 'バレーボール', label: 'バレー', emoji: '🏐' },
  { id: OTHER_SPORT_LABEL, label: 'その他', emoji: '📌' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

/** DB 保存値（日本語のスポーツ名）→ i18n キー */
const SPORT_LABEL_KEYS: Record<string, string> = {
  サッカー: 'soccer',
  バスケットボール: 'basketball',
  テニス: 'tennis',
  ランニング: 'running',
  フットサル: 'futsal',
  バドミントン: 'badminton',
  バレーボール: 'volleyball',
  野球: 'baseball',
  その他: 'other',
};

/** スポーツ名（データ値）の表示ラベル。未知の値はそのまま返す。 */
export function sportLabel(sport?: string | null) {
  const raw = String(sport || '').trim();
  if (!raw) return i18n.t('events.sport.other');
  const key = SPORT_LABEL_KEYS[raw];
  return key ? i18n.t(`events.sport.${key}`) : raw;
}

/** カテゴリチップ用ラベル（短縮名）。id はデータ値のまま。 */
export function categoryLabel(id: CategoryId) {
  switch (id) {
    case 'all':
      return i18n.t('events.category.all');
    case 'hot':
      return i18n.t('events.category.hot');
    case 'バスケットボール':
      return i18n.t('events.category.basketball');
    case 'バレーボール':
      return i18n.t('events.category.volleyball');
    default:
      return sportLabel(id);
  }
}

const LEVEL_LABEL_KEYS: Record<string, string> = {
  初心者: 'beginner',
  中級: 'intermediate',
  上級: 'advanced',
  誰でも歓迎: 'everyone',
};

/** レベル（SkillLevel・データ値）の表示ラベル。 */
export function levelLabel(level?: string | null) {
  const raw = String(level || '').trim();
  if (!raw) return i18n.t('events.level.everyone');
  const key = LEVEL_LABEL_KEYS[raw];
  return key ? i18n.t(`events.level.${key}`) : raw;
}

const AGE_GROUP_LABEL_KEYS: Record<string, string> = {
  全世代ウェルカム: 'all',
  学生向け: 'students',
  '20代中心': 'twenties',
  '20〜30代中心': 'twentiesThirties',
  '30〜40代中心': 'thirtiesForties',
  '40代以上歓迎': 'fortiesPlus',
};

/** 対象年齢層（プリセットのみ翻訳。自由入力はそのまま）。 */
export function ageGroupLabel(value: string) {
  const key = AGE_GROUP_LABEL_KEYS[String(value || '').trim()];
  return key ? i18n.t(`events.ageGroup.${key}`) : value;
}

const PRIMARY_SPORT_SET = new Set<string>(
  CATEGORIES.filter(
    (category) => category.id !== 'all' && category.id !== 'hot' && category.id !== OTHER_SPORT_LABEL,
  ).map((category) => category.id),
);

export function eventMatchesCategory(
  event: Pick<SportEvent, 'sport' | 'joinedCount'>,
  category: CategoryId,
) {
  if (category === 'all') return true;
  if (category === 'hot') return (event.joinedCount ?? 0) >= 8;
  if (category === OTHER_SPORT_LABEL) {
    return !PRIMARY_SPORT_SET.has(event.sport);
  }
  return event.sport === category;
}

function unsplashPhoto(id: string) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;
}

/** フォールバック用のスポーツ画像プリセット */
export const SPORT_IMAGE_PRESETS: Record<string, string> = {
  サッカー: unsplashPhoto('photo-1579952363873-27f3bade9f55'),
  バスケットボール: unsplashPhoto('photo-1546519638-68e109498ffc'),
  テニス: unsplashPhoto('photo-1554068865-24cecd4e34b8'),
  ランニング:
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-sakura.jpg',
  フットサル:
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-futsal-1.jpg',
  バレーボール: unsplashPhoto('photo-1612872087720-bb876e2e67d1'),
  バドミントン: unsplashPhoto('photo-1775993167393-f2add1f8eec2'),
  野球: unsplashPhoto('photo-1529768167801-9173d94c2a42'),
  その他: unsplashPhoto('photo-1544367567-0f2fcb009e0b'),
  default: unsplashPhoto('photo-1579952363873-27f3bade9f55'),
};

/** 詳細ギャラリー用。各スポーツ 3 枚 */
export const SPORT_IMAGE_GALLERIES: Record<string, string[]> = {
  サッカー: [
    unsplashPhoto('photo-1579952363873-27f3bade9f55'),
    unsplashPhoto('photo-1431324155629-1a6deb1dec8d'),
    unsplashPhoto('photo-1560272564-c83b66b1ad12'),
  ],
  バスケットボール: [
    unsplashPhoto('photo-1546519638-68e109498ffc'),
    unsplashPhoto('photo-1519861531473-9200262188bf'),
    unsplashPhoto('photo-1518611012118-696072aa579a'),
  ],
  テニス: [
    unsplashPhoto('photo-1554068865-24cecd4e34b8'),
    unsplashPhoto('photo-1622163642998-1ea32b0bbc67'),
    unsplashPhoto('photo-1622279457486-62dcc4a431d6'),
  ],
  ランニング: [
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-sakura.jpg',
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-feet.jpg',
    unsplashPhoto('photo-1476480862126-209bfaa8edc8'),
  ],
  フットサル: [
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-futsal-1.jpg',
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-futsal-2.jpg',
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-futsal-3.jpg',
  ],
  バレーボール: [
    unsplashPhoto('photo-1612872087720-bb876e2e67d1'),
    unsplashPhoto('photo-1547347298-4074fc3086f0'),
    unsplashPhoto('photo-1592656094267-764a45160876'),
  ],
  バドミントン: [
    unsplashPhoto('photo-1775993167393-f2add1f8eec2'),
    unsplashPhoto('photo-1599474924187-334a4ae5bd3c'),
    unsplashPhoto('photo-1775993167284-8e6a6e56ab69'),
  ],
  野球: [
    unsplashPhoto('photo-1529768167801-9173d94c2a42'),
    unsplashPhoto('photo-1508344928928-7165b67de128'),
    unsplashPhoto('photo-1659132252130-5dc2962bc425'),
  ],
  その他: [
    unsplashPhoto('photo-1544367567-0f2fcb009e0b'),
    unsplashPhoto('photo-1506126613408-eca07ce68773'),
    unsplashPhoto('photo-1571019614242-c5c5dee9f50b'),
  ],
};

export function eventGallery(sport: string) {
  const imageUris = (
    SPORT_IMAGE_GALLERIES[sport] ?? [SPORT_IMAGE_PRESETS.default]
  ).slice(0, MAX_EVENT_PHOTOS);
  return {
    imageUri: imageUris[0] ?? SPORT_IMAGE_PRESETS.default,
    imageUris,
  };
}

export function sportFallbackUri(sport?: string) {
  if (sport && SPORT_IMAGE_PRESETS[sport]) return SPORT_IMAGE_PRESETS[sport];
  return SPORT_IMAGE_PRESETS.default;
}

/** カード下部ギャラリー用。登録されている写真だけを左から最大 count 枚返す */
export function eventPreviewUris(
  event: Pick<SportEvent, 'imageUri' | 'imageUris' | 'sport'>,
  count = 3,
) {
  const unique: string[] = [];
  for (const uri of [...(event.imageUris ?? []), event.imageUri]) {
    if (!uri || unique.includes(uri)) continue;
    unique.push(uri);
    if (unique.length >= count) break;
  }
  return unique;
}

/**
 * 詳細・一覧表示用の生 URI 一覧（重複除去）。
 * 公開 URL への正規化は resolveDisplayImageUrl（lib/storage）側で行う。
 */
export function eventDisplayPhotoUris(
  event: Pick<SportEvent, 'imageUri' | 'imageUris'>,
  count = MAX_EVENT_PHOTOS,
): string[] {
  const unique: string[] = [];
  for (const uri of [...(event.imageUris ?? []), event.imageUri]) {
    const raw = String(uri || '').trim();
    if (!raw || unique.includes(raw)) continue;
    unique.push(raw);
    if (unique.length >= count) break;
  }
  return unique;
}

export function hasEventPhotos(
  event: Pick<SportEvent, 'imageUri' | 'imageUris'>,
) {
  return eventPreviewUris(event, 1).length > 0;
}

export const SAMPLE_EVENTS: SportEvent[] = [
  {
    id: 'demo-badminton',
    title: '原宿ナイトバドミントン',
    sport: 'バドミントン',
    emoji: '🏸',
    location: '原宿・表参道エリア体育館',
    locationNote: '1階エントランス集合',
    date: '2026-08-26',
    time: '19:00',
    endTime: '21:00',
    level: '中級',
    targetAgeGroups: ['20代中心', '30〜40代中心'],
    latitude: 35.6692,
    longitude: 139.7055,
    spotsLeft: 3,
    capacity: 16,
    joinedCount: 13,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Harajuku Shuttle',
    vibe: '夜の軽やかラリー。あと3席。定員に達したら受付終了。',
    description:
      '🏸 仕事終わりの原宿バドミントン\n\nダブルス中心で、定期的にペアを入れ替えます。勝敗よりラリーの気持ちよさを大切にする会です。\n\n🔥 こんな雰囲気\n・20〜30代中心のフレンドリーなメンバー\n・ラケットレンタルあり（数本）\n・終了後、表参道でお茶も歓迎\n\n定員間近です。満員になり次第、受付終了となります。',
    itemsToBring: ['インドアシューズ', 'タオル', '飲み物'],
    includedItems: ['コート代込み', 'ラケットレンタル（数本）'],
    ...eventGallery('バドミントン'),
    accent: '#EC4899',
  },
  {
    id: 'demo-futsal',
    title: '恵比寿ナイトフットサル 🌙',
    sport: 'フットサル',
    emoji: '⚽️',
    location: '恵比寿ガーデンプレイス付近コート',
    locationNote: 'インドアコートB',
    date: '2026-08-27',
    time: '20:30',
    endTime: '22:30',
    level: '初心者',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.6467,
    longitude: 139.7101,
    spotsLeft: 1,
    capacity: 10,
    joinedCount: 9,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Ebisu Night',
    vibe: '残り1席。久しぶりにボールを触りたい人向け。',
    description:
      '🌙 恵比寿ナイトフットサル\n\nポジション固定なし、楽しさ優先。初心者・ブランクあり大歓迎です。\n\nコート代は事前決済（¥1,200 / 人）。終了後、近隣で軽く飲む人もいます🍻',
    itemsToBring: ['インドアシューズ', 'タオル', '飲み物'],
    includedItems: ['ボール用意'],
    priceYen: 1200,
    cancelPolicy: '開催の24時間前まで全額返金、以降は返金なし',
    ...eventGallery('フットサル'),
    accent: '#10B981',
  },
  {
    id: 'demo-tennis',
    title: '外苑テニスダブルス募集',
    sport: 'テニス',
    emoji: '🎾',
    location: '明治神宮外苑テニスコート',
    locationNote: 'コート3・正面受付',
    date: '2026-08-28',
    time: '09:00',
    endTime: '11:00',
    level: '中級',
    targetAgeGroups: ['30〜40代中心'],
    latitude: 35.6764,
    longitude: 139.7172,
    spotsLeft: 0,
    capacity: 4,
    joinedCount: 4,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Gaien Tennis',
    vibe: '満員のため受付終了。',
    description:
      '🎾 朝の外苑でダブルス\n\nラリー中心→ゲーム形式。ストロークが安定している方向けです。コートは事前予約済み、ボールはこちらで用意します。\n\n定員4名で満席のため受付終了です。',
    itemsToBring: ['テニスシューズ', 'ラケット'],
    includedItems: ['コート予約済み', 'ボール用意'],
    ...eventGallery('テニス'),
    accent: '#84CC16',
  },
  {
    id: 'demo-run',
    title: '代々木パークラン · 朝',
    sport: 'ランニング',
    emoji: '🏃',
    location: '代々木公園ランニングコース',
    locationNote: '中央ゲート前',
    date: '2026-08-30',
    time: '07:30',
    endTime: '09:00',
    level: '誰でも歓迎',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.6735,
    longitude: 139.7001,
    spotsLeft: 14,
    capacity: 20,
    joinedCount: 6,
    host: 'Morning Pace',
    vibe: '会話できるペースの5km。コーヒー終わりつき。',
    description:
      '🏃‍♂️ 週末の代々木ゆるラン\n\nペースは会話できるくらい（キロ7分前後）。距離は約5km。初めての方も大歓迎です。\n\n最後にコンビニコーヒーで軽く雑談して解散します。写真多めのコースなので、雰囲気をギャラリーでチェックしてください。',
    itemsToBring: ['走りやすいシューズ', '飲み物'],
    includedItems: ['コース案内'],
    ...eventGallery('ランニング'),
    accent: '#06B6D4',
  },
  {
    id: 'demo-hoops',
    title: '渋谷ナイトバスケ練習会 🏀',
    sport: 'バスケットボール',
    emoji: '🏀',
    location: '渋谷区スポーツセンター',
    locationNote: '3階フルコート',
    date: '2026-08-29',
    time: '18:30',
    endTime: '20:30',
    level: '誰でも歓迎',
    targetAgeGroups: ['20代中心'],
    latitude: 35.6628,
    longitude: 139.6983,
    spotsLeft: 2,
    capacity: 12,
    joinedCount: 10,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Shibuya Hoops',
    vibe: '人気回。残り2席、3on3〜5on5。',
    description:
      '🌙 仕事終わりのナイトバスケ\n\nフルコートで3on3〜5on5をローテ。シュート練習の時間もあります。レベル分けしてマッチングするので、初めての方も参加しやすいです。\n\nコート代は事前決済（¥1,500 / 人）。人気のため残りわずかです。',
    itemsToBring: ['室内用シューズ', 'タオル', '飲み物'],
    includedItems: ['ボール用意'],
    priceYen: 1500,
    cancelPolicy: '開催の3日前までキャンセル無料、以降は返金なし',
    ...eventGallery('バスケットボール'),
    accent: '#F97316',
  },
  {
    id: 'demo-soccer',
    title: '代々木ピックアップサッカー',
    sport: 'サッカー',
    emoji: '⚽️',
    location: '代々木公園グラウンド',
    locationNote: '中央ゲート付近',
    date: '2026-08-31',
    time: '10:00',
    endTime: '12:00',
    level: '中級',
    targetAgeGroups: ['20〜30代中心'],
    latitude: 35.6717,
    longitude: 139.6949,
    spotsLeft: 4,
    capacity: 14,
    joinedCount: 10,
    host: 'Yoyogi FC',
    vibe: '芝生の朝。楽しさ優先のピックアップ。',
    description:
      '💖 週末の朝、代々木で気軽にキックオフ！\n\nフォーメーションにこだわりすぎず、楽しさ優先のピックアップゲームです。途中参加・見学OK。試合後に近くのカフェで軽く交流もできます。',
    itemsToBring: ['スニーカー', '飲み物', 'タオル'],
    includedItems: ['ボール用意'],
    priceYen: 1000,
    cancelPolicy: '開催の2日前までキャンセル無料、以降は返金なし',
    ...eventGallery('サッカー'),
    accent: '#22C55E',
  },
  {
    id: '1',
    title: '週末ピックアップサッカー ⚽️',
    sport: 'サッカー',
    emoji: '⚽️',
    location: '代々木公園グラウンド',
    date: '2026-08-16',
    time: '10:00',
    endTime: '12:00',
    level: '中級',
    latitude: 35.6717,
    longitude: 139.6949,
    spotsLeft: 4,
    capacity: 14,
    joinedCount: 10,
    host: 'Yoyogi FC',
    vibe: '芝生の匂いと晴れ空。初心者歓迎のゆるめキックオフ。',
    description:
      '💖 週末の朝、代々木で気軽にキックオフ！\n\n仕事や日常をいったんリセットして、芝生の上で思いっきり走りましょう。フォーメーションにこだわりすぎず、楽しさ優先のピックアップゲームです。\n\n🔥 こんな雰囲気\n・20〜30代中心のフレンドリーなメンバー\n・途中参加・見学OK\n・試合後に近くのカフェで軽く交流も\n\n持ち物: スニーカー / 飲み物 / タオル\n集合: 代々木公園中央ゲート付近',
    ...eventGallery('サッカー'),
    accent: '#22C55E',
  },
  {
    id: '2',
    title: 'ナイトバスケ練習会 🏀✨',
    sport: 'バスケットボール',
    emoji: '🏀',
    location: '渋谷区スポーツセンター',
    date: '2026-08-17',
    time: '18:30',
    endTime: '20:30',
    level: '誰でも歓迎',
    latitude: 35.6628,
    longitude: 139.6983,
    spotsLeft: 6,
    capacity: 12,
    joinedCount: 6,
    host: 'Shibuya Hoops',
    vibe: '屋内コートで汗を流そう。気軽にどうぞ。',
    description:
      '🌙 仕事終わりのナイトバスケ\n\nフルコートで3on3〜5on5をローテしながらプレイ。シュート練習の時間も用意しています。\n\n🔥 参加しやすい理由\n・レベル分けしてマッチング\n・初めての方も歓迎\n・コート代は割り勘（目安 ¥800）\n\n「今日動きたかった」を叶える会です。気軽にどうぞ！',
    ...eventGallery('バスケットボール'),
    accent: '#F97316',
  },
  {
    id: '3',
    title: 'テニスダブルス募集',
    sport: 'テニス',
    emoji: '🎾',
    location: '明治神宮外苑テニスコート',
    date: '2026-08-18',
    time: '09:00',
    endTime: '11:00',
    level: '中級',
    latitude: 35.6764,
    longitude: 139.7172,
    spotsLeft: 0,
    capacity: 4,
    joinedCount: 4,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Gaien Tennis',
    vibe: '朝の外苑、ラリーを楽しむダブルス。',
    description:
      '🎾 朝の外苑でダブルス\n\nラリー中心→ゲーム形式の流れ。ストロークが安定している方向けです。\n\nコートは事前予約済み。ボールはこちらで用意します。\n終了後、外苑いちょう並木あたりでコーヒーも歓迎☕',
    ...eventGallery('テニス'),
    accent: '#84CC16',
  },
  {
    id: '4',
    title: '朝ランニング · 代々木',
    sport: 'ランニング',
    emoji: '🏃',
    location: '代々木公園ランニングコース',
    date: '2026-08-19',
    time: '07:00',
    endTime: '08:30',
    level: '誰でも歓迎',
    latitude: 35.6735,
    longitude: 139.7001,
    spotsLeft: 12,
    capacity: 20,
    joinedCount: 8,
    host: 'Morning Pace',
    vibe: 'ゆっくり5km。コーヒー終わりつき。',
    description:
      '🏃‍♂️ 朝の代々木ゆるラン\n\nペースは会話できるくらい（キロ7分前後）。距離は約5km。\n\n最後にコンビニコーヒーで軽く雑談して解散します。\n初めての方も大歓迎 — iもeもOKな空気感です✨',
    ...eventGallery('ランニング'),
    accent: '#06B6D4',
  },
  {
    id: '5',
    title: 'フットサル夜練 🌙',
    sport: 'フットサル',
    emoji: '⚽️',
    location: '恵比寿ガーデンプレイス付近コート',
    date: '2026-08-20',
    time: '20:00',
    endTime: '22:00',
    level: '初心者',
    latitude: 35.6467,
    longitude: 139.7101,
    spotsLeft: 5,
    capacity: 10,
    joinedCount: 5,
    host: 'Ebisu Night',
    vibe: '仕事終わりの汗。初心者OK。',
    description:
      '🌙 恵比寿ナイトフットサル\n\n「久しぶりにボールを触りたい」方向け。ポジション固定なし、楽しさ優先。\n\n初心者・ブランクあり大歓迎。\nシューズはインドア推奨。終了後、近隣で軽く飲む人もいます🍻',
    ...eventGallery('フットサル'),
    accent: '#10B981',
  },
  {
    id: '6',
    title: 'バレー練習マッチ',
    sport: 'バレーボール',
    emoji: '🏐',
    location: '目黒区民センター',
    date: '2026-08-21',
    time: '19:00',
    endTime: '21:00',
    level: '上級',
    latitude: 35.6415,
    longitude: 139.6981,
    spotsLeft: 0,
    capacity: 12,
    joinedCount: 12,
    waitlistEnabled: false,
    host: 'Meguro Spike',
    vibe: '本気ラリー歓迎。経験者向け。',
    description:
      '🏐 本気寄りの練習マッチ\n\nサーブ・レシーブ・スパイクの基礎ドリル後、セットマッチ。\n経験者向け（高校・サークル経験があると安心）。\n\n汗をかいたあとはシャワー可。熱量高めの夜にしましょう🔥',
    ...eventGallery('バレーボール'),
    accent: '#8B5CF6',
  },
  {
    id: '7',
    title: 'バドミントン交流会',
    sport: 'バドミントン',
    emoji: '🏸',
    location: '原宿・表参道エリア体育館',
    date: '2026-08-22',
    time: '14:00',
    endTime: '16:00',
    level: '中級',
    latitude: 35.6692,
    longitude: 139.7055,
    spotsLeft: 7,
    capacity: 16,
    joinedCount: 9,
    host: 'Harajuku Shuttle',
    vibe: '午後の軽やかラリー。交流重視。',
    description:
      '🏸 原宿で午後バドミントン\n\nダブルス中心、定期的にペア替え。勝敗よりラリーの気持ちよさを大切に。\n\nラケットレンタルあり（数本）。\n終わったあと表参道でお茶も歓迎 — 新しいつながりをつくりましょう✨',
    ...eventGallery('バドミントン'),
    accent: '#EC4899',
  },
  {
    id: '8',
    title: '大通公園で朝サッカー',
    sport: 'サッカー',
    emoji: '⚽️',
    location: '札幌・大通公園付近',
    date: '2026-08-27',
    time: '10:00',
    endTime: '12:00',
    level: '誰でも歓迎',
    latitude: 43.0596,
    longitude: 141.3545,
    spotsLeft: 6,
    capacity: 14,
    joinedCount: 8,
    host: 'Sapporo Kick',
    vibe: '札幌の朝。ゆるめピックアップ。',
    description:
      '⚽️ 大通公園周辺で気軽な朝サッカー。\n\n初心者歓迎。試合後に近くのカフェで一息も歓迎です。',
    ...eventGallery('サッカー'),
    accent: '#22C55E',
  },
  {
    id: '9',
    title: '中島公園ランニング',
    sport: 'ランニング',
    emoji: '🏃',
    location: '札幌・中島公園',
    date: '2026-08-28',
    time: '07:30',
    endTime: '08:45',
    level: '誰でも歓迎',
    latitude: 43.0483,
    longitude: 141.3535,
    spotsLeft: 10,
    capacity: 18,
    joinedCount: 8,
    host: 'Odori Pace',
    vibe: '会話できるペースの朝ラン。',
    description:
      '🏃 中島公園をゆっくり周回。初めての方もどうぞ。',
    ...eventGallery('ランニング'),
    accent: '#06B6D4',
  },
  {
    id: 'demo-sapporo-futsal',
    title: '札幌駅前ナイトフットサル',
    sport: 'フットサル',
    emoji: '⚽️',
    location: '札幌・北区インドアコート',
    date: '2026-08-29',
    time: '20:00',
    endTime: '22:00',
    level: '初心者',
    latitude: 43.0885,
    longitude: 141.3402,
    spotsLeft: 4,
    capacity: 10,
    joinedCount: 6,
    host: 'Sapporo Night FS',
    vibe: '駅近インドア。ブランク歓迎。',
    description:
      '⚽️ 札幌駅周辺のナイトフットサル。楽しさ優先でまわします。',
    ...eventGallery('フットサル'),
    accent: '#10B981',
  },
  {
    id: 'demo-sapporo-badminton',
    title: '円山バドミントン交流会',
    sport: 'バドミントン',
    emoji: '🏸',
    location: '札幌・円山体育館',
    date: '2026-08-30',
    time: '14:00',
    endTime: '16:00',
    level: '中級',
    latitude: 43.0548,
    longitude: 141.3145,
    spotsLeft: 5,
    capacity: 12,
    joinedCount: 7,
    host: 'Maruyama Smash',
    vibe: 'ダブルス中心の午後練。',
    description:
      '🏸 円山で気軽なバドミントン交流。ラケットレンタル相談可。',
    ...eventGallery('バドミントン'),
    accent: '#EC4899',
  },
  {
    id: 'demo-sapporo-yoga',
    title: '大通パークヨガ',
    sport: 'ヨガ',
    emoji: '🧘',
    location: '札幌・大通公園西側',
    date: '2026-08-31',
    time: '09:00',
    endTime: '10:00',
    level: '誰でも歓迎',
    latitude: 43.0608,
    longitude: 141.3462,
    spotsLeft: 12,
    capacity: 20,
    joinedCount: 8,
    host: 'Odori Breath',
    vibe: '青空の下で朝ヨガ。マット持参。',
    description:
      '🧘 大通公園での屋外ヨガ。初心者歓迎、雨天中止。',
    ...eventGallery('ヨガ'),
    accent: '#A78BFA',
  },
  {
    id: 'demo-sapporo-tennis',
    title: '豊平川テニス申し込み',
    sport: 'テニス',
    emoji: '🎾',
    location: '札幌・豊平川緑地テニスコート',
    date: '2026-09-01',
    time: '11:00',
    endTime: '13:00',
    level: '中級',
    latitude: 43.0412,
    longitude: 141.3688,
    spotsLeft: 2,
    capacity: 4,
    joinedCount: 2,
    host: 'Toyohira Rally',
    vibe: 'ダブルス募集。ボールはこちらで用意。',
    description:
      '🎾 豊平川緑地でテニス。中級者向けにテンポよく回します。',
    ...eventGallery('テニス'),
    accent: '#F59E0B',
  },
  {
    id: '10',
    title: '大阪城ナイトラン',
    sport: 'ランニング',
    emoji: '🏃',
    location: '大阪城公園ランニングコース',
    date: '2026-08-29',
    time: '19:00',
    endTime: '20:30',
    level: '中級',
    latitude: 34.6873,
    longitude: 135.5262,
    spotsLeft: 8,
    capacity: 20,
    joinedCount: 12,
    host: 'Osaka Castle Run',
    vibe: '夜の大阪城。ライトアップを眺めながら。',
    description:
      '🏃 大阪城公園を夜ラン。キロ6分前後。終了後に水分補給して解散。',
    ...eventGallery('ランニング'),
    accent: '#F97316',
  },
  {
    id: '11',
    title: 'フットサル · 大阪西区',
    sport: 'フットサル',
    emoji: '⚽️',
    location: '大阪市西区インドアコート',
    date: '2026-08-30',
    time: '20:00',
    endTime: '22:00',
    level: '初心者',
    latitude: 34.6765,
    longitude: 135.486,
    spotsLeft: 4,
    capacity: 10,
    joinedCount: 6,
    host: 'Nishi Futsal',
    vibe: '仕事終わりのインドア。初心者OK。',
    description:
      '⚽️ 大阪市内のナイトフットサル。楽しさ優先、途中参加相談可。',
    ...eventGallery('フットサル'),
    accent: '#10B981',
  },
  {
    id: '12',
    title: '大濠公園で朝ラン',
    sport: 'ランニング',
    emoji: '🏃',
    location: '福岡・大濠公園',
    date: '2026-08-31',
    time: '07:00',
    endTime: '08:15',
    level: '誰でも歓迎',
    latitude: 33.5861,
    longitude: 130.3768,
    spotsLeft: 11,
    capacity: 20,
    joinedCount: 9,
    host: 'Ohori Morning',
    vibe: '池のまわりをゆるく一周。',
    description:
      '🏃 大濠公園の周回コース。会話できるペースで。',
    ...eventGallery('ランニング'),
    accent: '#06B6D4',
  },
  {
    id: 'demo-baseball',
    title: '神宮外苑キャッチボール',
    sport: '野球',
    emoji: '⚾️',
    location: '明治神宮外苑',
    locationNote: '軟式グラウンド脇',
    date: '2026-08-29',
    time: '10:00',
    endTime: '12:00',
    level: '誰でも歓迎',
    latitude: 35.6745,
    longitude: 139.7166,
    spotsLeft: 6,
    capacity: 12,
    joinedCount: 6,
    host: 'Jingu Catch',
    vibe: 'キャッチボールから軽くノックまで。グローブ持参歓迎。',
    description:
      '⚾️ 神宮外苑で気軽なキャッチボール。\n\n試合形式ではなく、投げる・捕るを楽しむ会です。グローブがあれば持ってきてください。',
    itemsToBring: ['グローブ', '帽子', '飲み物'],
    includedItems: ['ボール用意'],
    ...eventGallery('野球'),
    accent: '#3B82F6',
  },
  {
    id: 'demo-volleyball-sep',
    title: '目黒ナイトバレー練習',
    sport: 'バレーボール',
    emoji: '🏐',
    location: '目黒区民センター',
    locationNote: '体育館Aコート',
    date: '2026-09-10',
    time: '19:30',
    endTime: '21:30',
    level: '中級',
    targetAgeGroups: ['20〜30代中心'],
    latitude: 35.6415,
    longitude: 139.6981,
    spotsLeft: 5,
    capacity: 12,
    joinedCount: 7,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Meguro Spike',
    vibe: 'ドリル→ゲームの流れ。経験者歓迎の夜練。',
    description:
      '🏐 目黒のナイトバレー\n\nサーブ・レシーブのウォームアップ後、6人制の練習マッチを回します。\n高校・サークル経験があると安心ですが、基礎が分かれば大歓迎です。\n\nコート代は事前決済（¥1,300 / 人）。シャワーあり。',
    itemsToBring: ['インドアシューズ', 'タオル', '飲み物'],
    includedItems: ['ボール用意', 'ネット設営'],
    priceYen: 1300,
    cancelPolicy: '開催の24時間前まで全額返金、以降は返金なし',
    ...eventGallery('バレーボール'),
    accent: '#8B5CF6',
  },
  {
    id: 'demo-tennis-sep',
    title: '駒沢テニス · シングルス練習',
    sport: 'テニス',
    emoji: '🎾',
    location: '駒沢オリンピック公園テニスコート',
    locationNote: '中央管理事務所前',
    date: '2026-09-13',
    time: '14:00',
    endTime: '16:00',
    level: '中級',
    targetAgeGroups: ['30〜40代中心'],
    latitude: 35.6247,
    longitude: 139.6602,
    spotsLeft: 2,
    capacity: 6,
    joinedCount: 4,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Komazawa Rally',
    vibe: 'シングルス中心。ストロークを磨く午後。',
    description:
      '🎾 駒沢でシングルス練習\n\nラリー→タイブレーク形式。ストロークとサーブを丁寧にやりたい方向けです。\nボールはこちらで用意します。コート予約済み。\n\n参加費 ¥2,000 / 人（コート代込み）。',
    itemsToBring: ['テニスシューズ', 'ラケット', 'タオル'],
    includedItems: ['コート予約済み', 'ボール用意'],
    priceYen: 2000,
    cancelPolicy: '開催の2日前までキャンセル無料、以降は返金なし',
    ...eventGallery('テニス'),
    accent: '#84CC16',
  },
  {
    id: 'demo-futsal-sep',
    title: '五反田インドアフットサル',
    sport: 'フットサル',
    emoji: '⚽️',
    location: '五反田インドアコート',
    locationNote: 'コート2・受付で名前を伝える',
    date: '2026-09-16',
    time: '20:00',
    endTime: '22:00',
    level: '誰でも歓迎',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.6265,
    longitude: 139.7235,
    spotsLeft: 6,
    capacity: 12,
    joinedCount: 6,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Gotanda Kick',
    vibe: '仕事終わりのインドア。レベル分けあり。',
    description:
      '🌙 五反田ナイトフットサル\n\nポジション固定なし。前半はウォームアップゲーム、後半は少し本気寄りのマッチです。\n初心者・ブランクあり大歓迎。シューズはインドア推奨。\n\n参加費 ¥1,400 / 人。',
    itemsToBring: ['インドアシューズ', 'タオル', '飲み物'],
    includedItems: ['ボール用意', 'ビブス'],
    priceYen: 1400,
    cancelPolicy: '開催の3日前までキャンセル無料、以降は返金なし',
    ...eventGallery('フットサル'),
    accent: '#10B981',
  },
  {
    id: 'demo-run-sep',
    title: '皇居ナイトジョグ',
    sport: 'ランニング',
    emoji: '🏃',
    location: '皇居外苑ランニングコース',
    locationNote: '桜田門前集合',
    date: '2026-09-18',
    time: '19:00',
    endTime: '20:30',
    level: '中級',
    targetAgeGroups: ['20代中心', '30〜40代中心'],
    latitude: 35.6778,
    longitude: 139.7525,
    spotsLeft: 12,
    capacity: 24,
    joinedCount: 12,
    host: 'Palace Pace',
    vibe: '皇居1周くらい。キロ6分前後の夜ラン。',
    description:
      '🏃 皇居ナイトジョグ\n\n桜田門スタートで外苑を周回。目安は約5〜6km、会話できるペース寄りです。\nヘッドライトや反射材があると安心。終了後はその場で軽くストレッチして解散します。',
    itemsToBring: ['走りやすいシューズ', '飲み物', '反射材（推奨）'],
    includedItems: ['コース案内'],
    ...eventGallery('ランニング'),
    accent: '#06B6D4',
  },
  {
    id: 'demo-badminton-sep',
    title: '吉祥寺バドミントン交流',
    sport: 'バドミントン',
    emoji: '🏸',
    location: '武蔵野総合体育館',
    locationNote: '第2競技場入口',
    date: '2026-09-20',
    time: '13:00',
    endTime: '15:30',
    level: '初心者',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.7033,
    longitude: 139.5795,
    spotsLeft: 8,
    capacity: 16,
    joinedCount: 8,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Kichijoji Shuttle',
    vibe: '午後のゆるラリー。初心者・再開歓迎。',
    description:
      '🏸 吉祥寺で午後バドミントン\n\nダブルス中心、こまめにペア替え。勝敗よりラリーの気持ちよさを大事にします。\nラケットレンタルあり（数本）。終わったあと井の頭公園方面でお茶も歓迎です。',
    itemsToBring: ['インドアシューズ', 'タオル', '飲み物'],
    includedItems: ['コート代込み', 'ラケットレンタル（数本）'],
    priceYen: 900,
    cancelPolicy: '開催の24時間前まで全額返金、以降は返金なし',
    ...eventGallery('バドミントン'),
    accent: '#EC4899',
  },
  {
    id: 'demo-hoops-sep',
    title: '高田馬場バスケ半面練',
    sport: 'バスケットボール',
    emoji: '🏀',
    location: '高田馬場スポーツセンター',
    locationNote: '2階半面コート',
    date: '2026-09-24',
    time: '18:00',
    endTime: '20:00',
    level: '誰でも歓迎',
    targetAgeGroups: ['20代中心'],
    latitude: 35.7128,
    longitude: 139.7036,
    spotsLeft: 3,
    capacity: 10,
    joinedCount: 7,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Takadanobaba Ballers',
    vibe: '半面で3on3中心。シュート練つき。',
    description:
      '🏀 高田馬場ナイトバスケ\n\n半面コートで3on3をローテ。最初にシュート＆パスドリルを入れます。\nレベル分けして組むので、久しぶりの方も参加しやすいです。\n\n参加費 ¥1,200 / 人。',
    itemsToBring: ['室内用シューズ', 'タオル', '飲み物'],
    includedItems: ['ボール用意'],
    priceYen: 1200,
    cancelPolicy: '開催の2日前までキャンセル無料、以降は返金なし',
    ...eventGallery('バスケットボール'),
    accent: '#F97316',
  },
  {
    id: 'demo-soccer-sep',
    title: '砧公園ピックアップサッカー',
    sport: 'サッカー',
    emoji: '⚽️',
    location: '砧公園グラウンド',
    locationNote: '正門側芝生エリア',
    date: '2026-09-27',
    time: '10:00',
    endTime: '12:00',
    level: '誰でも歓迎',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.627,
    longitude: 139.6225,
    spotsLeft: 7,
    capacity: 16,
    joinedCount: 9,
    host: 'Kinuta FC',
    vibe: '秋の朝。楽しさ優先のピックアップ。',
    description:
      '⚽️ 砧公園で朝サッカー\n\nフォーメーションにこだわりすぎず、楽しさ優先。途中参加・見学OKです。\n試合後に近くで水分補給して解散。芝生のコンディションを見ながら進めます。',
    itemsToBring: ['スニーカー', '飲み物', 'タオル'],
    includedItems: ['ボール用意', 'ビブス'],
    ...eventGallery('サッカー'),
    accent: '#22C55E',
  },
  {
    id: 'demo-baseball-oct',
    title: '多摩川キャッチボール会',
    sport: '野球',
    emoji: '⚾️',
    location: '二子玉川・多摩川河川敷',
    locationNote: '二子橋下流側の広場',
    date: '2026-10-04',
    time: '09:30',
    endTime: '11:30',
    level: '誰でも歓迎',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.6115,
    longitude: 139.6268,
    spotsLeft: 9,
    capacity: 14,
    joinedCount: 5,
    host: 'Tama Catch',
    vibe: '投げる・捕るを楽しむ朝。グローブ歓迎。',
    description:
      '⚾️ 多摩川河川敷でキャッチボール\n\n試合形式ではなく、キャッチボールと軽いノック中心。家族連れ・久しぶりの方もどうぞ。\nグローブがあれば持参してください。ボールはこちらで用意します。',
    itemsToBring: ['グローブ', '帽子', '飲み物'],
    includedItems: ['ボール用意'],
    ...eventGallery('野球'),
    accent: '#3B82F6',
  },

  // --- UIテスト用: 開催終了（2026-09 より過去） ---
  {
    id: 'demo-past-run-july',
    title: '夏の代々木朝ラン（アーカイブ）',
    sport: 'ランニング',
    emoji: '🏃',
    location: '代々木公園ランニングコース',
    locationNote: '中央ゲート前',
    date: '2026-07-12',
    time: '07:00',
    endTime: '08:30',
    level: '誰でも歓迎',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.6732,
    longitude: 139.6998,
    spotsLeft: 0,
    capacity: 20,
    joinedCount: 18,
    waitlistEnabled: false,
    host: 'Morning Pace',
    vibe: '開催済み。お気に入り・履歴の「開催終了」表示確認用。',
    description:
      '🏃 夏の代々木朝ラン（終了済みデモ）\n\nこのイベントは開催済みです。マイページのお気に入り／参加履歴で「開催終了」ラベルの確認にご利用ください。',
    itemsToBring: ['走りやすいシューズ', '飲み物'],
    includedItems: ['コース案内'],
    ...eventGallery('ランニング'),
    accent: '#06B6D4',
  },
  {
    id: 'demo-past-badminton-aug',
    title: '原宿バドミントン夏祭り',
    sport: 'バドミントン',
    emoji: '🏸',
    location: '原宿・表参道エリア体育館',
    locationNote: '2階コートA',
    date: '2026-08-09',
    time: '18:00',
    endTime: '20:30',
    level: '中級',
    targetAgeGroups: ['20代中心', '30〜40代中心'],
    latitude: 35.6688,
    longitude: 139.7051,
    spotsLeft: 0,
    capacity: 16,
    joinedCount: 16,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Harajuku Shuttle',
    vibe: '満員で終了した夏の回。同一クラブの過去投稿デモ。',
    description:
      '🏸 Harajuku Shuttle 主催の夏祭り回（終了済み）\n\n同一クラブが複数イベントを出している状態のテスト用データです。',
    itemsToBring: ['インドアシューズ', 'タオル'],
    includedItems: ['コート代込み'],
    priceYen: 1500,
    ...eventGallery('バドミントン'),
    accent: '#EC4899',
  },
  {
    id: 'demo-past-yoga-sept',
    title: '表参道サンセットヨガ',
    sport: 'ヨガ',
    emoji: '🧘',
    location: '表参道ヒルズ付近スタジオ',
    locationNote: 'B1 スタジオ2',
    date: '2026-09-10',
    time: '18:30',
    endTime: '19:45',
    level: '初心者',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.6655,
    longitude: 139.7122,
    spotsLeft: 2,
    capacity: 12,
    joinedCount: 10,
    host: 'Omotesando Flow',
    vibe: '9月上旬に終了。無料ヨガの履歴デモ。',
    description:
      '🧘 サンセットヨガ（終了済み・無料）\n\n参加費無料の終了イベントです。履歴カードの表示確認用。',
    itemsToBring: ['動きやすい服', 'ヨガマット（貸出あり）'],
    includedItems: ['マット貸出'],
    priceYen: 0,
    ...eventGallery('ヨガ'),
    accent: '#A78BFA',
  },

  // --- UIテスト用: 同一クラブの複数イベント（Harajuku Shuttle） ---
  {
    id: 'demo-harajuku-morning',
    title: '原宿モーニングバドミントン',
    sport: 'バドミントン',
    emoji: '🏸',
    location: '原宿・千駄ヶ谷スポーツセンター',
    locationNote: '1階受付集合',
    date: '2026-09-25',
    time: '09:00',
    endTime: '11:00',
    level: '初心者',
    targetAgeGroups: ['20代中心'],
    latitude: 35.6718,
    longitude: 139.7032,
    spotsLeft: 6,
    capacity: 12,
    joinedCount: 6,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Harajuku Shuttle',
    vibe: '朝活バド。同一クラブの別会場・別日時。',
    description:
      '🏸 Harajuku Shuttle 朝回\n\n夜の原宿ナイトとは別日程・別会場です。マップ上の同一クラブ複数ピン確認用。',
    itemsToBring: ['インドアシューズ', 'タオル', '飲み物'],
    includedItems: ['コート代込み', 'シャトル用意'],
    priceYen: 1200,
    ...eventGallery('バドミントン'),
    accent: '#EC4899',
  },
  {
    id: 'demo-harajuku-weekend',
    title: '週末・明治公園オープンバド',
    sport: 'バドミントン',
    emoji: '🏸',
    location: '明治公園屋外コート付近',
    locationNote: '神宮橋側エントランス',
    date: '2026-10-05',
    time: '14:00',
    endTime: '16:30',
    level: '誰でも歓迎',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.6751,
    longitude: 139.7164,
    spotsLeft: 8,
    capacity: 20,
    joinedCount: 12,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Harajuku Shuttle',
    vibe: '週末の屋外寄りオープン。無料・気軽参加。',
    description:
      '🏸 Harajuku Shuttle 週末オープン回（無料）\n\n参加費無料。雨天時は屋内に振替の場合があります。',
    itemsToBring: ['動きやすい服', 'タオル'],
    includedItems: ['ラケット貸出（数本）'],
    priceYen: 0,
    ...eventGallery('バドミントン'),
    accent: '#EC4899',
  },

  // --- UIテスト用: 同一クラブ複数（Ebisu Night） ---
  {
    id: 'demo-ebisu-friday',
    title: '恵比寿フライデーフットサル',
    sport: 'フットサル',
    emoji: '⚽️',
    location: '恵比寿・屋内コートA',
    locationNote: 'ビル3階・受付で「Ebisu Night」と伝える',
    date: '2026-09-26',
    time: '20:00',
    endTime: '22:00',
    level: '中級',
    targetAgeGroups: ['20代中心', '30〜40代中心'],
    latitude: 35.6478,
    longitude: 139.7092,
    spotsLeft: 2,
    capacity: 10,
    joinedCount: 8,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Ebisu Night',
    vibe: '金曜ナイト。同一クラブの別コート。',
    description:
      '⚽️ Ebisu Night 金曜回\n\n中級以上向けのゲーム多め。コート代込み。',
    itemsToBring: ['インドアシューズ', 'タオル'],
    includedItems: ['ボール用意', 'ビブス'],
    priceYen: 1800,
    cancelPolicy: '開催の24時間前まで全額返金、以降は返金なし',
    ...eventGallery('フットサル'),
    accent: '#10B981',
  },
  {
    id: 'demo-ebisu-sunday',
    title: '恵比寿サンデー初心者フットサル',
    sport: 'フットサル',
    emoji: '⚽️',
    location: '中目黒・屋内コートC',
    locationNote: '駅から徒歩7分・青い看板の建物',
    date: '2026-10-12',
    time: '10:00',
    endTime: '12:00',
    level: '初心者',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.6439,
    longitude: 139.6988,
    spotsLeft: 5,
    capacity: 12,
    joinedCount: 7,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Ebisu Night',
    vibe: '日曜午前の初心者回。場所を変えた同一クラブ投稿。',
    description:
      '⚽️ Ebisu Night 日曜初心者回\n\n説明多め・交代多め。ブランクあり歓迎。',
    itemsToBring: ['インドアシューズ', '飲み物'],
    includedItems: ['ボール用意'],
    priceYen: 1000,
    ...eventGallery('フットサル'),
    accent: '#10B981',
  },

  // --- UIテスト用: 満員（受付終了） ---
  {
    id: 'demo-full-closed-hoops',
    title: '渋谷スリーオン三昧（満員）',
    sport: 'バスケットボール',
    emoji: '🏀',
    location: '渋谷区スポーツセンター',
    locationNote: '体育館2階コート',
    date: '2026-09-28',
    time: '19:00',
    endTime: '21:00',
    level: '中級',
    targetAgeGroups: ['20代中心'],
    latitude: 35.6591,
    longitude: 139.7008,
    spotsLeft: 0,
    capacity: 12,
    joinedCount: 12,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Shibuya Hoops',
    vibe: '満員（受付終了）。UI確認用。',
    description:
      '🏀 スリーオン中心の練習会（満員デモ）\n\n定員に達しているため受付終了です。参加費あり。',
    itemsToBring: ['インドアシューズ', 'タオル'],
    includedItems: ['ボール用意'],
    priceYen: 1500,
    cancelPolicy: '開催の2日前までキャンセル無料、以降は返金なし',
    ...eventGallery('バスケットボール'),
    accent: '#F97316',
  },

  // --- UIテスト用: 無料イベント ---
  {
    id: 'demo-free-yoga-omotesando',
    title: '表参道ランチタイムヨガ（無料）',
    sport: 'ヨガ',
    emoji: '🧘',
    location: '表参道コミュニティスペース',
    locationNote: '2階・茶色のドア',
    date: '2026-09-24',
    time: '12:15',
    endTime: '13:00',
    level: '誰でも歓迎',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.6662,
    longitude: 139.7115,
    spotsLeft: 9,
    capacity: 15,
    joinedCount: 6,
    waitlistEnabled: false,
    host: 'Omotesando Flow',
    vibe: '昼休み45分。完全無料。',
    description:
      '🧘 ランチタイムのショートヨガ（無料）\n\nマット貸出あり。仕事帰り前のリセットに。参加費はかかりません。',
    itemsToBring: ['動きやすい服'],
    includedItems: ['マット貸出', '参加費無料'],
    priceYen: 0,
    ...eventGallery('ヨガ'),
    accent: '#A78BFA',
  },
  {
    id: 'demo-free-catchball',
    title: '皇居周辺ゆるキャッチボール（無料）',
    sport: '野球',
    emoji: '⚾️',
    location: '北の丸公園付近広場',
    locationNote: '竹橋駅から徒歩8分',
    date: '2026-10-01',
    time: '17:30',
    endTime: '19:00',
    level: '誰でも歓迎',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.6912,
    longitude: 139.7514,
    spotsLeft: 11,
    capacity: 16,
    joinedCount: 5,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'Tama Catch',
    vibe: 'グローブ持参歓迎。参加費無料。',
    description:
      '⚾️ 夕方のゆるキャッチボール（無料）\n\n試合形式なし。ボールはこちらで用意します。',
    itemsToBring: ['グローブ（任意）', '帽子'],
    includedItems: ['ボール用意', '参加費無料'],
    priceYen: 0,
    ...eventGallery('野球'),
    accent: '#3B82F6',
  },
  // ---------------------------------------------------------------------------
  // 同一タイトル・複数開催日（8回）の独立開催回（日付切替で別IDに遷移する検証用）
  // ---------------------------------------------------------------------------
  ...([
    '2026-09-27',
    '2026-09-29',
    '2026-10-01',
    '2026-10-03',
    '2026-10-05',
    '2026-10-07',
    '2026-10-09',
    '2026-10-11',
  ] as const).map((date, index): SportEvent => {
    const joinedCounts = [3, 8, 5, 14, 2, 10, 6, 12];
    const joinedCount = joinedCounts[index] ?? 4;
    const capacity = 16;
    return {
      id: `demo-bball-multi-${index + 1}`,
      title: '平日夜バスケ練習',
      sport: 'バスケ',
      emoji: '🏀',
      location: '渋谷区立体育館',
      locationNote: '1階受付',
      date,
      time: '19:30',
      endTime: '21:30',
      level: '誰でも歓迎',
      targetAgeGroups: ['20代中心', '30〜40代中心'],
      latitude: 35.6612,
      longitude: 139.7042,
      spotsLeft: Math.max(0, capacity - joinedCount),
      capacity,
      joinedCount,
      waitlistEnabled: false,
      waitlistCount: 0,
      host: 'バスケラボ',
      hostId: 'mock_host_bball_lab',
      hostImageUri:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
      hostBio: '渋谷周辺でバスケ練習会を開催しています。',
      vibe: 'パス回し中心のゆる練。',
      description: `🏀 平日夜バスケ練習（${date} 開催・第${index + 1}回）\n\n同一タイトルの他日付とは別イベントです。\n参加・定員・参加者リストは日付ごとに独立しています。`,
      itemsToBring: ['室内シューズ', 'タオル'],
      includedItems: ['ボール'],
      priceYen: 500,
      seriesId: 'demo-series-bball-week',
      ...eventGallery('バスケ'),
      accent: '#F97316',
    };
  }),
  // ---------------------------------------------------------------------------
  // 同一主催「おすし」による複数の独立イベント（詳細ページ分離の検証用）
  // ---------------------------------------------------------------------------
  {
    id: 'demo-osushi-soccer',
    title: 'おすしサッカー練習会',
    sport: 'サッカー',
    emoji: '⚽️',
    location: '代々木公園球技場A',
    locationNote: '西側ゲート集合',
    date: '2026-09-30',
    time: '19:00',
    endTime: '21:00',
    level: '誰でも歓迎',
    targetAgeGroups: ['20代中心', '30〜40代中心'],
    latitude: 35.6717,
    longitude: 139.6949,
    spotsLeft: 6,
    capacity: 18,
    joinedCount: 12,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'おすし',
    hostId: 'mock_host_osushi',
    hostImageUri:
      'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&q=80',
    hostBio:
      '渋谷・代々木周辺でスポーツイベントを主催。初心者歓迎・気軽にどうぞ。',
    vibe: '平日夜のゆる練習。パス回し中心。',
    description:
      '⚽️ おすし主催サッカー練習会\n\n勝ち負けよりタッチ数。初心者・ブランク大歓迎です。\nビブス貸出あり。終了後は近隣で軽く飲む人もいます。',
    itemsToBring: ['運動靴', 'タオル', '飲み物'],
    includedItems: ['ビブス', 'ボール'],
    priceYen: 800,
    cancelPolicy: '開催の2日前までキャンセル無料、以降は返金なし',
    ...eventGallery('サッカー'),
    accent: '#0EA5E9',
  },
  {
    id: 'demo-osushi-futsal',
    title: 'おすし週末フットサルマッチ',
    sport: 'フットサル',
    emoji: '⚽️',
    location: '渋谷インドアコートB',
    locationNote: '2階受付で「おすし」と伝える',
    date: '2026-10-04',
    time: '14:00',
    endTime: '16:00',
    level: '中級',
    targetAgeGroups: ['20代中心'],
    latitude: 35.6595,
    longitude: 139.7005,
    spotsLeft: 3,
    capacity: 12,
    joinedCount: 9,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'おすし',
    hostId: 'mock_host_osushi',
    hostImageUri:
      'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&q=80',
    hostBio:
      '渋谷・代々木周辺でスポーツイベントを主催。初心者歓迎・気軽にどうぞ。',
    vibe: '週末の試合形式。5vs5ローテーション。',
    description:
      '🌙 おすし主催フットサルマッチ\n\n試合形式でしっかり動けます。ポジション固定なし。\n室内シューズ必須。',
    itemsToBring: ['インドアシューズ', 'タオル', '飲み物'],
    includedItems: ['ビブス', 'ボール'],
    priceYen: 1500,
    cancelPolicy: '開催の24時間前まで全額返金、以降は返金なし',
    ...eventGallery('フットサル'),
    accent: '#10B981',
  },
  {
    id: 'demo-osushi-volley',
    title: 'おすしバレーゆる練',
    sport: 'バレーボール',
    emoji: '🏐',
    location: '原宿コミュニティ体育館',
    locationNote: '1階エントランス',
    date: '2026-10-08',
    time: '20:00',
    endTime: '22:00',
    level: '初心者',
    targetAgeGroups: ['全世代ウェルカム'],
    latitude: 35.6702,
    longitude: 139.7028,
    spotsLeft: 8,
    capacity: 16,
    joinedCount: 8,
    waitlistEnabled: false,
    waitlistCount: 0,
    host: 'おすし',
    hostId: 'mock_host_osushi',
    hostImageUri:
      'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&q=80',
    hostBio:
      '渋谷・代々木周辺でスポーツイベントを主催。初心者歓迎・気軽にどうぞ。',
    vibe: 'レシーブ練習中心。初参加OK。',
    description:
      '🏐 おすし主催バレーゆる練\n\nサーブ・レシーブの基礎から。試合は希望者のみ後半で。\n完全初心者歓迎です。',
    itemsToBring: ['インドアシューズ', 'タオル'],
    includedItems: ['ボール用意'],
    priceYen: 0,
    ...eventGallery('バレーボール'),
    accent: '#8B5CF6',
  },
];

/** SAMPLE_EVENTS の「いま開催中」群の基準日（相対シフトのアンカー） */
const DEV_SAMPLE_DATE_ANCHOR = '2026-08-26';

function shiftDateStamp(stamp: string | undefined, deltaDays: number): string | undefined {
  if (!stamp) return stamp;
  const base = parseEventDateTime(stamp, '12:00');
  if (!Number.isFinite(base.getTime())) return stamp;
  base.setDate(base.getDate() + deltaDays);
  return formatDateStamp(base);
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/**
 * 開発用モックを「今日」基準に日付シフトしたコピー。
 * リモート取得で上書きされないよう eventsContext からマージする。
 */
export function getDevSampleEvents(now = new Date()): SportEvent[] {
  if (!shouldShowDemoEvents()) return [];

  const anchor = startOfLocalDay(parseEventDateTime(DEV_SAMPLE_DATE_ANCHOR, '00:00'));
  const today = startOfLocalDay(now);
  if (!Number.isFinite(anchor.getTime())) return SAMPLE_EVENTS.slice();

  const deltaDays = Math.round(
    (today.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (deltaDays === 0) return SAMPLE_EVENTS.slice();

  return SAMPLE_EVENTS.map((event) => {
    const nextDate = shiftDateStamp(event.date, deltaDays) || event.date;
    const nextEndDate = shiftDateStamp(event.endDate, deltaDays);
    const nextSessions = Array.isArray(event.sessions)
      ? event.sessions.map((session) => ({
          ...session,
          date: shiftDateStamp(session.date, deltaDays) || session.date,
          endDate: shiftDateStamp(session.endDate, deltaDays),
        }))
      : event.sessions;

    let date = nextDate;
    let endDate = nextEndDate;
    let sessions = nextSessions;

    // 終了済みデモは必ず過去に残す
    if (String(event.id).startsWith('demo-past-')) {
      const start = parseEventDateTime(date, event.time || '12:00');
      if (Number.isFinite(start.getTime()) && start.getTime() >= today.getTime()) {
        const past = new Date(today);
        past.setDate(past.getDate() - 21);
        date = formatDateStamp(past);
        if (endDate) {
          const endPast = new Date(past);
          endPast.setDate(endPast.getDate());
          endDate = formatDateStamp(endPast);
        }
      }
    }

    return {
      ...event,
      date,
      endDate,
      sessions,
    };
  });
}

/** リモート一覧に開発モックを合成（demo-* は常に残す） */
export function mergeWithDevSampleEvents(
  remote: SportEvent[] | null | undefined,
  now = new Date(),
): SportEvent[] {
  const remoteList = Array.isArray(remote) ? remote : [];
  const samples = getDevSampleEvents(now);
  if (samples.length === 0) return remoteList;

  const sampleIds = new Set(samples.map((item) => item.id));
  return [
    ...samples,
    ...remoteList.filter((item) => {
      const id = String(item?.id || '');
      if (!id) return false;
      if (sampleIds.has(id)) return false;
      if (id.startsWith('demo-')) return false;
      return true;
    }),
  ];
}

export function getNearbyEvents(
  latitude: number,
  longitude: number,
  radiusKm = 40,
  events: SportEvent[] = SAMPLE_EVENTS,
): SportEvent[] {
  const source = Array.isArray(events) ? events : [];
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(radiusKm)
  ) {
    return source;
  }
  return source.filter((event) => {
    if (
      !Number.isFinite(event?.latitude) ||
      !Number.isFinite(event?.longitude)
    ) {
      return false;
    }
    const dLat = (event.latitude - latitude) * 111;
    const dLng =
      (event.longitude - longitude) *
      111 *
      Math.cos((latitude * Math.PI) / 180);
    const distance = Math.sqrt(dLat * dLat + dLng * dLng);
    return Number.isFinite(distance) && distance <= radiusKm;
  });
}

export function parseEventDateTime(date: string, time: string) {
  const dateRaw = String(date ?? '').trim();
  const timeRaw = String(time ?? '').trim();

  // YYYY-MM-DD / YYYY/MM/DD（ISO 先頭や余分な時刻付きでも先頭の日付を採用）
  const dateMatch = dateRaw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const year = dateMatch ? Number(dateMatch[1]) : NaN;
  const month = dateMatch ? Number(dateMatch[2]) : NaN;
  const day = dateMatch ? Number(dateMatch[3]) : NaN;

  let hour = 0;
  let minute = 0;
  const timeMatch = timeRaw.match(/(\d{1,2})[:：](\d{2})/);
  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
  } else if (!timeRaw) {
    // date 側に時刻が含まれる場合（例: 2026-09-27T21:10:00）
    const embedded = dateRaw.match(/T(\d{1,2}):(\d{2})/);
    if (embedded) {
      hour = Number(embedded[1]);
      minute = Number(embedded[2]);
    }
  }

  if (
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    Number.isFinite(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31
  ) {
    // 端末ローカル（日本向けアプリ想定）の壁時計で組み立て、TZ ずれを避ける
    return new Date(
      year,
      month - 1,
      day,
      Number.isFinite(hour) ? hour : 0,
      Number.isFinite(minute) ? minute : 0,
      0,
      0,
    );
  }

  const fallback = new Date(dateRaw);
  return Number.isFinite(fallback.getTime()) ? fallback : new Date(NaN);
}

function sessionEndAt(session: EventSession) {
  const start = parseEventDateTime(session.date, session.time);
  if (session.endTime?.trim()) {
    const end = parseEventDateTime(
      session.endDate ?? session.date,
      session.endTime,
    );
    // 終了が開始以前なら開始+2時間を終了とみなす
    if (end.getTime() > start.getTime()) return end;
  }
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

export function eventEarliestStartAt(
  event: Pick<SportEvent, 'date' | 'time' | 'sessions'>,
) {
  if (event.sessions && event.sessions.length > 0) {
    const starts = event.sessions.map((session) =>
      parseEventDateTime(session.date, session.time).getTime(),
    );
    return new Date(Math.min(...starts));
  }
  return parseEventDateTime(event.date, event.time);
}

export const CANCEL_POLICY_OPTIONS = [
  {
    label: '開催の2日前までキャンセル無料、以降は返金なし',
    hint: '開催48時間前まで全額自動返金。期限後は返金されません。',
  },
  {
    label: '開催の3日前までキャンセル無料、以降は返金なし',
    hint: '開催72時間前まで全額自動返金。期限後は返金されません。',
  },
  {
    label: '開催の24時間前まで全額返金、以降は返金なし',
    hint: '開催24時間前を過ぎると返金されません。',
  },
  {
    label: '返金不可',
    hint: 'キャンセルしても参加費は返金されません。',
  },
] as const;

export const DEFAULT_CANCEL_POLICY = CANCEL_POLICY_OPTIONS[0].label;
export const CANCEL_CONFIRM_TITLE = '本当にキャンセルしますか？';

/** CANCEL_CONFIRM_TITLE の表示用（言語切替対応） */
export function cancelConfirmTitle() {
  return i18n.t('events.cancelConfirmTitle');
}

/** キャンセルポリシー選択肢（データ値）の表示ラベル。カスタム文言はそのまま。 */
export function cancelPolicyOptionLabel(label?: string | null) {
  const raw = String(label ?? '').trim();
  const index = CANCEL_POLICY_OPTIONS.findIndex((option) => option.label === raw);
  if (index < 0) return raw;
  return i18n.t(`events.cancelPolicy.options.${index}.label`);
}

/** キャンセルポリシー選択肢の補足説明。 */
export function cancelPolicyOptionHint(label?: string | null) {
  const raw = String(label ?? '').trim();
  const index = CANCEL_POLICY_OPTIONS.findIndex((option) => option.label === raw);
  if (index < 0) return '';
  return i18n.t(`events.cancelPolicy.options.${index}.hint`);
}

export type CancelPolicyRule =
  | { kind: 'none' }
  | { kind: 'days'; days: number }
  | { kind: 'hours'; hours: number };

/**
 * 主催者のキャンセルポリシー文言 → ルール。
 * 「N日前」はカレンダー日（開催日時の N 日前・同時刻）、
 * 「N時間前」は正確な時間差で扱う。
 */
export function parseCancelPolicyRule(policy?: string): CancelPolicyRule {
  const text = String(policy ?? '').trim() || DEFAULT_CANCEL_POLICY;
  if (/(^|[、,。\s])返金不可/.test(text) || text === '返金不可') {
    return { kind: 'none' };
  }
  // 「前日まで」= 1日前（「3日前」と区別）
  if (/(^|[、。\s])前日/.test(text) && !/\d+\s*日前/.test(text)) {
    return { kind: 'days', days: 1 };
  }
  const dayMatch = text.match(/(\d+)\s*日前/);
  if (dayMatch) {
    return { kind: 'days', days: Math.max(0, Number(dayMatch[1]) || 0) };
  }
  const hourMatch = text.match(/(\d+)\s*時間前/);
  if (hourMatch) {
    return { kind: 'hours', hours: Math.max(0, Number(hourMatch[1]) || 0) };
  }
  // 未設定時の安全側デフォルト（2日前）
  return { kind: 'days', days: 2 };
}

/** 互換: ポリシーを「開催の何時間前まで全額返金か」に換算。返金不可は null */
export function refundHoursBeforeStart(policy?: string): number | null {
  const rule = parseCancelPolicyRule(policy);
  if (rule.kind === 'none') return null;
  if (rule.kind === 'hours') return rule.hours;
  return rule.days * 24;
}

export type RefundPolicyRow = {
  /** キャンセル申請期限（例: 2026/09/24 21:10 まで） */
  requestTimeLabel: string;
  /** 返金率（例: 100%） */
  refundRateLabel: string;
  /** 返金額（円）。購入合計金額に対する額 */
  refundAmountYen: number;
  /** 0–100 */
  refundRatePercent: number;
};

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime());
}

/** 返金締切日時。返金不可や日時不正時は null */
export function refundCutoffAt(
  event: Pick<SportEvent, 'date' | 'time' | 'sessions' | 'cancelPolicy'>,
): Date | null {
  const rule = parseCancelPolicyRule(event.cancelPolicy);
  if (rule.kind === 'none') return null;

  const start = eventEarliestStartAt(event);
  if (!isValidDate(start)) return null;

  if (rule.kind === 'hours') {
    return new Date(start.getTime() - rule.hours * 60 * 60 * 1000);
  }

  // 「N日前」= 開催日時からカレンダーで N 日戻した同時刻（DST でも日付が正確）
  const cutoff = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
    start.getHours(),
    start.getMinutes(),
    0,
    0,
  );
  cutoff.setDate(cutoff.getDate() - rule.days);
  return cutoff;
}

/** YYYY/MM/DD HH:mm */
export function formatRefundDeadline(date: Date) {
  if (!isValidDate(date)) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hh}:${mm}`;
}

function formatRefundWindowLead(rule: CancelPolicyRule) {
  if (rule.kind === 'none') return i18n.t('events.refund.leadNone');
  if (rule.kind === 'hours') {
    return i18n.t('events.refund.leadHours', { count: rule.hours });
  }
  if (rule.days === 1) return i18n.t('events.refund.leadDayBefore');
  return i18n.t('events.refund.leadDays', { count: rule.days });
}

function refundYenForRate(totalYen: number, ratePercent: number) {
  const paid = Math.max(0, Math.floor(Number(totalYen) || 0));
  const rate = Math.max(0, Math.min(100, Math.floor(Number(ratePercent) || 0)));
  return Math.floor((paid * rate) / 100);
}

/**
 * 参加確認画面用の返金ポリシー表行。
 * 主催者の cancelPolicy × イベント開催日時から期限を算出し、
 * amountYen（枚数×単価の合計）から各段階の返金額を算出する。
 */
export function buildRefundPolicyRows(
  event: Pick<
    SportEvent,
    'date' | 'time' | 'sessions' | 'cancelPolicy' | 'priceYen'
  >,
  amountYen: number,
): RefundPolicyRow[] {
  const paidYen = Math.max(0, Math.floor(Number(amountYen) || 0));
  const rule = parseCancelPolicyRule(event.cancelPolicy);

  if (rule.kind === 'none') {
    return [
      {
        requestTimeLabel: i18n.t('events.refund.always'),
        refundRateLabel: '0%',
        refundRatePercent: 0,
        refundAmountYen: 0,
      },
    ];
  }

  const start = eventEarliestStartAt(event);
  const cutoff = refundCutoffAt(event);
  const lead = formatRefundWindowLead(rule);

  if (!cutoff || !isValidDate(start)) {
    return [
      {
        requestTimeLabel: `${lead}\n${i18n.t('events.refund.unknownStart')}`,
        refundRateLabel: '100%',
        refundRatePercent: 100,
        refundAmountYen: refundYenForRate(paidYen, 100),
      },
      {
        requestTimeLabel: i18n.t('events.refund.afterDeadlineAbove'),
        refundRateLabel: '0%',
        refundRatePercent: 0,
        refundAmountYen: 0,
      },
    ];
  }

  const deadline = formatRefundDeadline(cutoff);

  return [
    {
      requestTimeLabel: i18n.t('events.refund.until', { deadline, lead }),
      refundRateLabel: '100%',
      refundRatePercent: 100,
      refundAmountYen: refundYenForRate(paidYen, 100),
    },
    {
      requestTimeLabel: i18n.t('events.refund.after', { deadline }),
      refundRateLabel: '0%',
      refundRatePercent: 0,
      refundAmountYen: 0,
    },
  ];
}

/** 有料イベントで、設定されたキャンセル期限を過ぎて返金できない状態か */
export function isRefundWindowClosed(
  event: Pick<SportEvent, 'date' | 'time' | 'sessions' | 'cancelPolicy' | 'priceYen'>,
  now = new Date(),
) {
  if (!(Math.floor(Number(event.priceYen) || 0) > 0)) return false;
  const rule = parseCancelPolicyRule(event.cancelPolicy);
  if (rule.kind === 'none') return true;
  const cutoff = refundCutoffAt(event);
  if (!cutoff) return true;
  return now.getTime() >= cutoff.getTime();
}

export function refundForfeitNotice() {
  return i18n.t('events.refund.forfeitNotice');
}

export function refundEligibleNotice() {
  return i18n.t('events.refund.eligibleNotice');
}

export function shouldAutoRefundOnCancel(
  event: Pick<SportEvent, 'date' | 'time' | 'sessions' | 'cancelPolicy' | 'priceYen'>,
  now = new Date(),
) {
  if (!(Math.floor(Number(event.priceYen) || 0) > 0)) return false;
  return !isRefundWindowClosed(event, now);
}

function isPaidEvent(event: Pick<SportEvent, 'priceYen'>) {
  return Math.floor(Number(event.priceYen) || 0) > 0;
}

/** 詳細画面上部タグ用の短いキャンセル表記（カード本文と同一ポリシーから生成） */
export function cancelPolicyTagLabel(
  event: Pick<SportEvent, 'cancelPolicy' | 'priceYen'>,
) {
  if (!isPaidEvent(event)) return i18n.t('events.cancelPolicy.tagSameDay');
  const policy = event.cancelPolicy?.trim() || DEFAULT_CANCEL_POLICY;
  const hours = refundHoursBeforeStart(policy);
  if (hours == null) return i18n.t('events.cancelPolicy.tagNoRefund');
  if (hours % 24 === 0) {
    const days = hours / 24;
    if (days <= 0) return i18n.t('events.cancelPolicy.tagSameDay');
    return i18n.t('events.cancelPolicy.tagDaysBefore', { count: days });
  }
  return i18n.t('events.cancelPolicy.tagHoursBefore', { count: hours });
}

export function cancelPolicyCardText(
  event: Pick<SportEvent, 'cancelPolicy' | 'priceYen'>,
) {
  const paid = isPaidEvent(event);
  const explicit = event.cancelPolicy?.trim() || '';
  if (paid) {
    return cancelPolicyOptionLabel(explicit || DEFAULT_CANCEL_POLICY);
  }
  // 無料イベントは返金ポリシー未設定が通常。タグ「当日キャンセル可」と揃える
  if (!explicit) return i18n.t('events.cancelPolicy.cardSameDay');
  const hours = refundHoursBeforeStart(explicit);
  if (hours == null) return i18n.t('events.cancelPolicy.cardBeforeStart');
  if (hours % 24 === 0) {
    return i18n.t('events.cancelPolicy.cardDays', { count: hours / 24 });
  }
  return i18n.t('events.cancelPolicy.cardHours', { count: hours });
}

export function eventEndAt(event: Pick<
  SportEvent,
  'date' | 'time' | 'endTime' | 'endDate' | 'sessions'
>) {
  if (event.sessions && event.sessions.length > 0) {
    const ends = event.sessions.map((session) => sessionEndAt(session).getTime());
    return new Date(Math.max(...ends));
  }
  const start = parseEventDateTime(event.date, event.time);
  if (event.endTime?.trim()) {
    const end = parseEventDateTime(
      event.endDate ?? event.date,
      event.endTime,
    );
    if (end.getTime() > start.getTime()) return end;
  }
  // 終了時刻未設定（または開始以前）は開始+2時間を終了とみなす
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

/** 現在日時と比較して、開催終了済みか */
export function isEventPast(
  event: Pick<SportEvent, 'date' | 'time' | 'endTime' | 'endDate' | 'sessions'>,
  now = new Date(),
) {
  return eventEndAt(event).getTime() < now.getTime();
}

export function isEventCancelled(
  event: Pick<SportEvent, 'cancelledAt'> | null | undefined,
) {
  return Boolean(event?.cancelledAt?.trim());
}

/** イベントの表示用ライフサイクル（開催中 / 終了 / 中止） */
export type EventLifecycleStatus = 'upcoming' | 'ended' | 'cancelled';

export function getEventLifecycleStatus(
  event: Pick<
    SportEvent,
    'date' | 'time' | 'endTime' | 'endDate' | 'sessions' | 'cancelledAt'
  >,
  now = new Date(),
): EventLifecycleStatus {
  if (isEventCancelled(event)) return 'cancelled';
  if (isEventPast(event, now)) return 'ended';
  return 'upcoming';
}

export function eventLifecycleLabel(status: EventLifecycleStatus) {
  switch (status) {
    case 'cancelled':
      return i18n.t('events.lifecycle.cancelled');
    case 'ended':
      return i18n.t('events.lifecycle.ended');
    default:
      return i18n.t('events.lifecycle.upcoming');
  }
}

/** 主催アーカイブ（終了・中止）に含めるか */
export function isHostedEventArchived(
  event: Pick<
    SportEvent,
    'date' | 'time' | 'endTime' | 'endDate' | 'sessions' | 'cancelledAt'
  >,
  now = new Date(),
) {
  return getEventLifecycleStatus(event, now) !== 'upcoming';
}

/** 参加受付を閉じる（終了または主催者中止） */
export function isEventJoinClosed(
  event: Pick<
    SportEvent,
    'date' | 'time' | 'endTime' | 'endDate' | 'sessions' | 'cancelledAt'
  >,
  now = new Date(),
) {
  return isEventPast(event, now) || isEventCancelled(event);
}

export function sortPastEventsNewestFirst(events: SportEvent[]) {
  return [...events].sort(
    (a, b) => eventEndAt(b).getTime() - eventEndAt(a).getTime(),
  );
}

/** お気に入り等: 開催前を先に、終了済みは新しい順で後ろへ */
export function sortEventsUpcomingThenPast(
  events: SportEvent[],
  now = new Date(),
) {
  return [...events].sort((a, b) => {
    const aPast = isEventPast(a, now);
    const bPast = isEventPast(b, now);
    if (aPast !== bPast) return aPast ? 1 : -1;
    if (aPast) {
      return eventEndAt(b).getTime() - eventEndAt(a).getTime();
    }
    return (
      eventEarliestStartAt(a).getTime() - eventEarliestStartAt(b).getTime()
    );
  });
}

export function formatDateStamp(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTimeStamp(value: Date) {
  const hour = String(value.getHours()).padStart(2, '0');
  const minute = String(value.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

export function addMinutesToEventTime(
  date: string,
  time: string,
  minutes: number,
) {
  const next = parseEventDateTime(date, time);
  next.setMinutes(next.getMinutes() + minutes);
  return {
    date: formatDateStamp(next),
    time: formatTimeStamp(next),
  };
}

export function roundUpToStep(value: Date, stepMinutes = 5) {
  const next = new Date(value);
  const stepMs = stepMinutes * 60 * 1000;
  return new Date(Math.ceil(next.getTime() / stepMs) * stepMs);
}

export function defaultEventSchedule(from = new Date()) {
  const start = roundUpToStep(from);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    date: formatDateStamp(start),
    time: formatTimeStamp(start),
    endDate: formatDateStamp(end),
    endTime: formatTimeStamp(end),
  };
}

export function formatTimeRange(
  date: string | null | undefined,
  time: string | null | undefined,
  endTime?: string | null,
  endDate?: string | null,
) {
  const startTime = String(time || '').trim() || '--:--';
  const end = String(endTime || '').trim();
  if (!end) return startTime;
  const startDate = String(date || '').trim();
  const endDayRaw = String(endDate || '').trim();
  if (endDayRaw && endDayRaw !== startDate) {
    const parts = endDayRaw.split(/[-/.]/);
    const endMonth = Number(parts[1]);
    const endDay = Number(parts[2]);
    if (Number.isFinite(endMonth) && Number.isFinite(endDay)) {
      return `${startTime} 〜 ${endMonth}/${endDay} ${end}`;
    }
    return `${startTime} 〜 ${end}`;
  }
  return `${startTime} 〜 ${end}`;
}

export function formatEventDate(
  date: string | null | undefined,
  time: string | null | undefined,
  endTime?: string | null,
  endDate?: string | null,
) {
  const dateRaw = String(date || '').trim();
  const parts = dateRaw.split(/[-/.]/);
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const hasDate =
    Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day);
  const monthDay = hasDate ? `${month}/${day}` : i18n.t('events.scheduleUndecided');
  const range = formatTimeRange(dateRaw, time, endTime, endDate);
  return {
    monthDay,
    time: range,
    full: hasDate ? `${year}/${month}/${day} ${range}` : range,
  };
}

export function formatLocationLabel(location: string, note?: string) {
  const raw = String(location || '').trim();
  const extra = note?.trim();
  if (!raw) return extra || '';
  // 緯度経度は表示しない（施設名・補足のみ）
  if (/^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(raw)) {
    return extra || '';
  }
  const compacted = compactLocationAddress(raw);
  const primary =
    compacted.split(/\s*[·•]\s*/u)[0]?.trim() || compacted || raw;
  if (!extra) return primary;
  if (primary.includes(extra)) return primary;
  return `${primary}-${extra}`;
}

/** 参加費・キャンセルポリシーなど、別セクションと重複する行か */
function isFeeOrPolicyNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t === '無料' || t === '参加費無料' || t === '参加費 無料') return true;
  if (/^参加費(\s|$|[:：]|無料|[¥￥0-9])/.test(t)) return true;
  if (/^キャンセルポリシー/.test(t)) return true;
  // 作成時に vibe へ入れていた形式: 「参加費 ¥1,200 / 人 · …」
  if (/参加費\s*[¥￥]/.test(t) && t.length < 80) return true;
  return false;
}

/**
 * イベント内容欄用: 入力された本文から参加費などの重複情報を除く。
 */
export function sanitizeEventContentText(raw: string | null | undefined): string {
  const input = String(raw || '');
  if (!input.trim()) return '';
  return input
    .split('\n')
    .filter((line) => !isFeeOrPolicyNoiseLine(line))
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 詳細画面「イベント内容」に出す本文（description のみ。vibe / 参加費は含めない） */
export function eventContentBody(
  event: Pick<SportEvent, 'description'>,
): string {
  return sanitizeEventContentText(event.description);
}

/** 一覧・検索用の短い vibe。本文の先頭行から生成（参加費は使わない） */
export function deriveEventVibe(
  description: string,
  title?: string,
): string {
  const cleaned = sanitizeEventContentText(description);
  const first = cleaned
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (first) return first.slice(0, 80);
  const fallback = String(title || '').trim();
  return fallback.slice(0, 40) || i18n.t('events.defaultTitle');
}

export type JoinActionResult =
  | 'joined'
  | 'left'
  | 'full'
  | 'unchanged';

export function eventSpotsLeft(event: Pick<SportEvent, 'capacity' | 'joinedCount'>) {
  const capacity = Math.max(0, Math.floor(Number(event?.capacity) || 0));
  const joined = Math.max(0, Math.floor(Number(event?.joinedCount) || 0));
  return Math.max(0, capacity - joined);
}

export function isEventFull(event: Pick<SportEvent, 'capacity' | 'joinedCount'>) {
  return eventSpotsLeft(event) <= 0;
}

export function withAttendance(
  event: SportEvent,
  joinedCount: number,
): SportEvent {
  const nextJoined = Math.max(0, joinedCount);
  const spotsLeft = Math.max(0, event.capacity - nextJoined);
  return {
    ...event,
    joinedCount: nextJoined,
    spotsLeft,
    waitlistCount: 0,
    waitlistEnabled: false,
  };
}

/**
 * 参加トグル。定員に達している場合は 'full'（受付終了）のみ。
 * キャンセル待ちは行わない。
 */
export function applyToggleJoin(
  event: SportEvent,
  isJoined: boolean,
  options?: { ticketQuantity?: number },
): {
  event: SportEvent;
  joined: boolean;
  result: JoinActionResult;
  ticketQuantity: number;
} {
  const seats = Math.max(
    1,
    Math.floor(Number(options?.ticketQuantity) || 1),
  );

  if (isEventPast(event) || isEventCancelled(event)) {
    return {
      event,
      joined: isJoined,
      result: 'unchanged',
      ticketQuantity: seats,
    };
  }

  if (isJoined) {
    return {
      event: withAttendance(event, event.joinedCount - seats),
      joined: false,
      result: 'left',
      ticketQuantity: seats,
    };
  }

  const spots = eventSpotsLeft(event);
  if (spots > 0) {
    const take = Math.min(seats, spots);
    return {
      event: withAttendance(event, event.joinedCount + take),
      joined: true,
      result: 'joined',
      ticketQuantity: take,
    };
  }

  return {
    event,
    joined: false,
    result: 'full',
    ticketQuantity: seats,
  };
}

export function formatSessionSlot(session: EventSession) {
  const dateRaw = String(session?.date || '').trim();
  const timeRaw = String(session?.time || '').trim() || '--:--';
  const parts = dateRaw.split(/[-/.]/);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const dayLabel =
    Number.isFinite(month) && Number.isFinite(day)
      ? `${month}/${day}`
      : i18n.t('events.scheduleUndecided');
  if (!session?.endTime) return `${dayLabel} ${timeRaw}`;
  if (session.endDate && session.endDate !== session.date) {
    const endParts = String(session.endDate || '').split(/[-/.]/);
    const endMonth = Number(endParts[1]);
    const endDay = Number(endParts[2]);
    if (Number.isFinite(endMonth) && Number.isFinite(endDay)) {
      return `${dayLabel} ${timeRaw}-${endMonth}/${endDay} ${session.endTime}`;
    }
  }
  return `${dayLabel} ${timeRaw}-${session.endTime}`;
}

export function sortEventSessions(sessions: EventSession[]) {
  return [...sessions].sort((a, b) =>
    `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
  );
}

export function formatSessionsSummary(sessions: EventSession[], max = 3) {
  const labels = sortEventSessions(sessions).map(formatSessionSlot);
  if (labels.length <= max) return labels.join(', ');
  return `${labels.slice(0, max).join(', ')} ${i18n.t('events.sessionsMore', { count: labels.length - max })}`;
}

export function formatEventSchedule(
  event: Pick<
    SportEvent,
    'date' | 'time' | 'endTime' | 'endDate' | 'sessions'
  > | null | undefined,
  /** ユーザーが選んだ単一開催。指定時は他の日程をまとめない */
  selectedSession?: EventSession | null,
) {
  if (!event) {
    return formatEventDate(undefined, undefined);
  }
  if (selectedSession) {
    return formatEventDate(
      selectedSession.date,
      selectedSession.time,
      selectedSession.endTime,
      selectedSession.endDate,
    );
  }
  const sessions = Array.isArray(event.sessions)
    ? event.sessions.filter(
        (session) => session && String(session.date || '').trim(),
      )
    : [];
  if (sessions.length > 1) {
    const sorted = sortEventSessions(sessions);
    return {
      monthDay: i18n.t('events.sessionsCount', { count: sorted.length }),
      time: formatSessionsSummary(sorted, 2),
      full: formatSessionsSummary(sorted, 8),
    };
  }
  return formatEventDate(event.date, event.time, event.endTime, event.endDate);
}

/** 同一シリーズの開催回（自分含む）。無い場合は [event] */
export function seriesOccurrenceEvents(
  event: SportEvent,
  allEvents: SportEvent[],
): SportEvent[] {
  const seriesId = String(event.seriesId || '').trim();
  if (!seriesId) return [event];
  const title = String(event.title || '').trim();
  return allEvents
    .filter((item) => {
      if (String(item.seriesId || '').trim() !== seriesId) return false;
      if (isEventCancelled(item)) return false;
      // タイトルが違う別イベントをシリーズに混ぜない
      if (title && String(item.title || '').trim() !== title) return false;
      return true;
    })
    .sort((a, b) =>
      `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
    );
}

function scheduleHostKey(
  event: Pick<SportEvent, 'hostId' | 'host'>,
): string {
  return String(event.hostId || event.host || '').trim();
}

/**
 * 詳細の日程ピッカー用（日付ごと別 event id のみ）。
 * - series_id または 同一タイトル＋同一主催の独立開催回を並べる
 * - レガシー sessions だけの別日は含めない（参加は 1 id のため独立に見せない）
 * - 主催が同じでもタイトルが違うイベントは独立した詳細ページのまま
 */
export function relatedScheduleEvents(
  event: SportEvent,
  allEvents: SportEvent[],
): SportEvent[] {
  const series = seriesOccurrenceEvents(event, allEvents);
  if (series.length > 1) return series;

  const title = String(event.title || '').trim();
  const hostKey = scheduleHostKey(event);
  if (!title || !hostKey) return [event];

  const peers = allEvents
    .filter((item) => {
      if (isEventCancelled(item)) return false;
      if (item.id === event.id) return true;
      // 同一タイトルかつ同一主催のみ（別タイトルは別詳細）
      if (String(item.title || '').trim() !== title) return false;
      return scheduleHostKey(item) === hostKey;
    })
    .sort((a, b) =>
      `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
    );

  // 日付が1種類しかない peers はピッカーを出さない（同一日の重複行）
  if (peers.length <= 1) return [event];
  const distinctDates = new Set(peers.map((item) => item.date));
  if (distinctDates.size <= 1) return [event];
  return peers;
}

/** 表示・決済用に、選んだ1回だけを持つイベント像を作る */
export function eventForSelectedOccurrence(
  event: SportEvent,
  session?: EventSession | null,
): SportEvent {
  const slot =
    session ??
    ({
      date: event.date,
      time: event.time,
      endDate: event.endDate,
      endTime: event.endTime,
    } satisfies EventSession);
  return {
    ...event,
    date: slot.date,
    time: slot.time,
    endDate: slot.endDate,
    endTime: slot.endTime,
    sessions: undefined,
    scheduleType: 'single',
  };
}

export function sessionFromEvent(
  event: Pick<SportEvent, 'date' | 'time' | 'endDate' | 'endTime'>,
): EventSession {
  return {
    date: event.date,
    time: event.time,
    endDate: event.endDate,
    endTime: event.endTime,
  };
}

export function occurrenceSlotKey(
  event: Pick<SportEvent, 'id' | 'date' | 'time' | 'endTime'>,
) {
  return `${event.id}|${event.date}|${event.time}|${event.endTime ?? ''}`;
}


export function formatCompactWhen(
  date: string | null | undefined,
  time: string | null | undefined,
) {
  const timeLabel = String(time || '').trim() || '--:--';
  const start = parseEventDateTime(String(date || ''), timeLabel);
  if (!Number.isFinite(start.getTime())) {
    return timeLabel === '--:--' ? i18n.t('events.scheduleUndecided') : timeLabel;
  }
  const weekday = i18n.t(`events.weekdayShort.${start.getDay()}`);
  const month = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${weekday} ${month}.${day}  ${timeLabel}`;
}

export function formatEventWhenCompact(
  event: Pick<SportEvent, 'date' | 'time' | 'sessions'> | null | undefined,
  now = new Date(),
) {
  if (!event) return i18n.t('events.scheduleUndecided');
  try {
    const sessions = Array.isArray(event.sessions)
      ? event.sessions.filter(
          (session) => session && String(session.date || '').trim(),
        )
      : [];
    if (sessions.length > 0) {
      const nowMs = now.getTime();
      const upcoming = sortEventSessions(sessions)
        .map((session) => ({
          session,
          start: parseEventDateTime(session.date, session.time).getTime(),
        }))
        .filter((item) => Number.isFinite(item.start) && item.start >= nowMs);
      const slot = (
        upcoming[0] ?? { session: sortEventSessions(sessions)[0] }
      ).session;
      if (slot) return formatCompactWhen(slot.date, slot.time);
    }
    return formatCompactWhen(event.date, event.time);
  } catch {
    return i18n.t('events.scheduleUndecided');
  }
}

export const SPORT_OPTIONS = [
  { label: 'サッカー', emoji: '⚽️' },
  { label: 'バスケットボール', emoji: '🏀' },
  { label: 'テニス', emoji: '🎾' },
  { label: 'ランニング', emoji: '🏃' },
  { label: '野球', emoji: '⚾️' },
  { label: 'バレーボール', emoji: '🏐' },
  { label: 'バドミントン', emoji: '🏸' },
  { label: 'フットサル', emoji: '⚽️' },
  { label: OTHER_SPORT_LABEL, emoji: '🏷️' },
] as const;

export const LEVEL_OPTIONS: SkillLevel[] = [
  '初心者',
  '中級',
  '上級',
  '誰でも歓迎',
];

export const TIME_OPTIONS = [
  '07:00',
  '09:00',
  '10:00',
  '14:00',
  '18:00',
  '19:00',
  '20:00',
] as const;

/** 申込締切: 開始の何時間前か。0 = 開始時、'end' = 終了時 */
export type RegistrationDeadlineOffset = number | 'end';

export const REGISTRATION_DEADLINE_OPTIONS: {
  value: RegistrationDeadlineOffset;
  label: string;
  sublabel: string;
  group: 'until' | 'before';
}[] = [
  {
    value: 0,
    label: 'イベント開始時まで',
    sublabel: 'Until activity starts',
    group: 'until',
  },
  {
    value: 'end',
    label: 'イベント終了まで',
    sublabel: 'Until activity ends',
    group: 'until',
  },
  { value: 1, label: '1時間前', sublabel: '1 hour before activity starts', group: 'before' },
  { value: 2, label: '2時間前', sublabel: '2 hours before activity starts', group: 'before' },
  { value: 3, label: '3時間前', sublabel: '3 hours before activity starts', group: 'before' },
  { value: 4, label: '4時間前', sublabel: '4 hours before activity starts', group: 'before' },
  { value: 5, label: '5時間前', sublabel: '5 hours before activity starts', group: 'before' },
  { value: 6, label: '6時間前', sublabel: '6 hours before activity starts', group: 'before' },
  { value: 8, label: '8時間前', sublabel: '8 hours before activity starts', group: 'before' },
  { value: 10, label: '10時間前', sublabel: '10 hours before activity starts', group: 'before' },
  { value: 12, label: '12時間前', sublabel: '12 hours before activity starts', group: 'before' },
  {
    value: 24,
    label: '24時間前（1日前）',
    sublabel: '24 hours before activity starts',
    group: 'before',
  },
  { value: 36, label: '36時間前', sublabel: '36 hours before activity starts', group: 'before' },
  {
    value: 48,
    label: '48時間前（2日前）',
    sublabel: '48 hours before activity starts',
    group: 'before',
  },
  {
    value: 72,
    label: '72時間前（3日前）',
    sublabel: '72 hours before activity starts',
    group: 'before',
  },
];

/** 申込締切オプションの表示ラベル（言語切替対応）。 */
export function deadlineOptionLabel(offset: RegistrationDeadlineOffset) {
  if (offset === 0) return i18n.t('events.deadline.atStart');
  if (offset === 'end') return i18n.t('events.deadline.atEnd');
  if (offset === 24 || offset === 48 || offset === 72) {
    return i18n.t('events.deadline.hoursBeforeDays', {
      count: offset,
      days: offset / 24,
    });
  }
  return i18n.t('events.deadline.hoursBefore', { count: offset });
}

export function formatDeadlineLabel(offset: RegistrationDeadlineOffset) {
  const found = REGISTRATION_DEADLINE_OPTIONS.some(
    (option) => option.value === offset,
  );
  return found ? deadlineOptionLabel(offset) : i18n.t('events.deadline.select');
}
