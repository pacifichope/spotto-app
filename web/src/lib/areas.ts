/**
 * 全都道府県（北海道〜沖縄）の選択・絞り込み用データ。
 * アプリ版 lib/areas.ts と座標・エイリアスを揃える。
 */

export type Prefecture = {
  id: string;
  /** 正式名（東京都） */
  label: string;
  /** 短縮名（東京）— UI / フィルタのキーにも使用 */
  shortLabel: string;
  /** 英語表示名 */
  nameEn: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  /** マップズーム目安の半径 km */
  radiusKm: number;
};

export const NEARBY_AREA = '現在地付近';

function pref(
  id: string,
  label: string,
  shortLabel: string,
  nameEn: string,
  aliases: string[],
  latitude: number,
  longitude: number,
  radiusKm: number,
): Prefecture {
  return { id, label, shortLabel, nameEn, aliases, latitude, longitude, radiusKm };
}

export const PREFECTURES: Prefecture[] = [
  pref('hokkaido', '北海道', '北海道', 'Hokkaido', ['北海道', 'Hokkaido', 'Sapporo'], 43.0642, 141.3469, 220),
  pref('aomori', '青森県', '青森', 'Aomori', ['青森県', '青森', 'Aomori'], 40.8244, 140.74, 70),
  pref('iwate', '岩手県', '岩手', 'Iwate', ['岩手県', '岩手', 'Iwate', 'Morioka'], 39.7036, 141.1527, 80),
  pref('miyagi', '宮城県', '宮城', 'Miyagi', ['宮城県', '宮城', 'Miyagi', 'Sendai'], 38.2682, 140.8694, 60),
  pref('akita', '秋田県', '秋田', 'Akita', ['秋田県', '秋田', 'Akita'], 39.7186, 140.1024, 70),
  pref('yamagata', '山形県', '山形', 'Yamagata', ['山形県', '山形', 'Yamagata'], 38.2404, 140.3633, 65),
  pref('fukushima', '福島県', '福島', 'Fukushima', ['福島県', '福島', 'Fukushima'], 37.75, 140.4678, 80),
  pref('ibaraki', '茨城県', '茨城', 'Ibaraki', ['茨城県', '茨城', 'Ibaraki', 'Mito'], 36.3418, 140.4468, 55),
  pref('tochigi', '栃木県', '栃木', 'Tochigi', ['栃木県', '栃木', 'Tochigi', 'Utsunomiya'], 36.5658, 139.8836, 55),
  pref('gunma', '群馬県', '群馬', 'Gunma', ['群馬県', '群馬', 'Gunma', 'Maebashi'], 36.3911, 139.0608, 55),
  pref('saitama', '埼玉県', '埼玉', 'Saitama', ['埼玉県', '埼玉', 'Saitama'], 35.8569, 139.6489, 40),
  pref('chiba', '千葉県', '千葉', 'Chiba', ['千葉県', '千葉', 'Chiba'], 35.6047, 140.1233, 50),
  pref('tokyo', '東京都', '東京', 'Tokyo', ['東京都', '東京', 'Tokyo'], 35.6895, 139.6917, 40),
  pref('kanagawa', '神奈川県', '神奈川', 'Kanagawa', ['神奈川県', '神奈川', 'Kanagawa', 'Yokohama', 'Kawasaki'], 35.4478, 139.6425, 28),
  pref('niigata', '新潟県', '新潟', 'Niigata', ['新潟県', '新潟', 'Niigata'], 37.9022, 139.0236, 90),
  pref('toyama', '富山県', '富山', 'Toyama', ['富山県', '富山', 'Toyama'], 36.6953, 137.2113, 50),
  pref('ishikawa', '石川県', '石川', 'Ishikawa', ['石川県', '石川', 'Ishikawa', 'Kanazawa'], 36.5946, 136.6256, 55),
  pref('fukui', '福井県', '福井', 'Fukui', ['福井県', '福井', 'Fukui'], 36.0652, 136.2216, 50),
  pref('yamanashi', '山梨県', '山梨', 'Yamanashi', ['山梨県', '山梨', 'Yamanashi', 'Kofu'], 35.6642, 138.5684, 50),
  pref('nagano', '長野県', '長野', 'Nagano', ['長野県', '長野', 'Nagano'], 36.6513, 138.181, 80),
  pref('gifu', '岐阜県', '岐阜', 'Gifu', ['岐阜県', '岐阜', 'Gifu'], 35.3912, 136.7223, 60),
  pref('shizuoka', '静岡県', '静岡', 'Shizuoka', ['静岡県', '静岡', 'Shizuoka', 'Hamamatsu'], 34.9769, 138.3831, 70),
  pref('aichi', '愛知県', '愛知', 'Aichi', ['愛知県', '愛知', 'Aichi', 'Nagoya'], 35.1802, 136.9066, 45),
  pref('mie', '三重県', '三重', 'Mie', ['三重県', '三重', 'Mie', 'Tsu'], 34.7303, 136.5086, 60),
  pref('shiga', '滋賀県', '滋賀', 'Shiga', ['滋賀県', '滋賀', 'Shiga', 'Otsu'], 35.0045, 135.8686, 40),
  pref('kyoto', '京都府', '京都', 'Kyoto', ['京都府', '京都', 'Kyoto'], 35.0214, 135.7556, 45),
  pref('osaka', '大阪府', '大阪', 'Osaka', ['大阪府', '大阪', 'Osaka'], 34.6863, 135.52, 32),
  pref('hyogo', '兵庫県', '兵庫', 'Hyogo', ['兵庫県', '兵庫', 'Hyogo', 'Kobe'], 34.6913, 135.183, 55),
  pref('nara', '奈良県', '奈良', 'Nara', ['奈良県', '奈良', 'Nara'], 34.6851, 135.805, 40),
  pref('wakayama', '和歌山県', '和歌山', 'Wakayama', ['和歌山県', '和歌山', 'Wakayama'], 34.226, 135.1675, 55),
  pref('tottori', '鳥取県', '鳥取', 'Tottori', ['鳥取県', '鳥取', 'Tottori'], 35.5039, 134.2378, 55),
  pref('shimane', '島根県', '島根', 'Shimane', ['島根県', '島根', 'Shimane', 'Matsue'], 35.4723, 133.0505, 70),
  pref('okayama', '岡山県', '岡山', 'Okayama', ['岡山県', '岡山', 'Okayama'], 34.6618, 133.9347, 50),
  pref('hiroshima', '広島県', '広島', 'Hiroshima', ['広島県', '広島', 'Hiroshima'], 34.3963, 132.4596, 60),
  pref('yamaguchi', '山口県', '山口', 'Yamaguchi', ['山口県', '山口', 'Yamaguchi'], 34.1859, 131.4706, 60),
  pref('tokushima', '徳島県', '徳島', 'Tokushima', ['徳島県', '徳島', 'Tokushima'], 34.0658, 134.5593, 45),
  pref('kagawa', '香川県', '香川', 'Kagawa', ['香川県', '香川', 'Kagawa', 'Takamatsu'], 34.3401, 134.0434, 35),
  pref('ehime', '愛媛県', '愛媛', 'Ehime', ['愛媛県', '愛媛', 'Ehime', 'Matsuyama'], 33.8416, 132.7661, 60),
  pref('kochi', '高知県', '高知', 'Kochi', ['高知県', '高知', 'Kochi'], 33.5597, 133.5311, 60),
  pref('fukuoka', '福岡県', '福岡', 'Fukuoka', ['福岡県', '福岡', 'Fukuoka', 'Kitakyushu'], 33.6064, 130.4183, 50),
  pref('saga', '佐賀県', '佐賀', 'Saga', ['佐賀県', '佐賀', 'Saga'], 33.2494, 130.2988, 35),
  pref('nagasaki', '長崎県', '長崎', 'Nagasaki', ['長崎県', '長崎', 'Nagasaki'], 32.7503, 129.8777, 60),
  pref('kumamoto', '熊本県', '熊本', 'Kumamoto', ['熊本県', '熊本', 'Kumamoto'], 32.7898, 130.7417, 55),
  pref('oita', '大分県', '大分', 'Oita', ['大分県', '大分', 'Oita'], 33.2382, 131.6126, 55),
  pref('miyazaki', '宮崎県', '宮崎', 'Miyazaki', ['宮崎県', '宮崎', 'Miyazaki'], 31.9111, 131.4239, 60),
  pref('kagoshima', '鹿児島県', '鹿児島', 'Kagoshima', ['鹿児島県', '鹿児島', 'Kagoshima'], 31.5602, 130.5581, 80),
  pref('okinawa', '沖縄県', '沖縄', 'Okinawa', ['沖縄県', '沖縄', 'Okinawa', 'Naha'], 26.2124, 127.6809, 70),
];

export const PREFECTURE_GROUPS: { titleJa: string; titleEn: string; ids: string[] }[] = [
  {
    titleJa: '北海道・東北',
    titleEn: 'Hokkaido / Tohoku',
    ids: ['hokkaido', 'aomori', 'iwate', 'miyagi', 'akita', 'yamagata', 'fukushima'],
  },
  {
    titleJa: '関東',
    titleEn: 'Kanto',
    ids: ['ibaraki', 'tochigi', 'gunma', 'saitama', 'chiba', 'tokyo', 'kanagawa'],
  },
  {
    titleJa: '中部',
    titleEn: 'Chubu',
    ids: [
      'niigata',
      'toyama',
      'ishikawa',
      'fukui',
      'yamanashi',
      'nagano',
      'gifu',
      'shizuoka',
      'aichi',
    ],
  },
  {
    titleJa: '近畿',
    titleEn: 'Kinki',
    ids: ['mie', 'shiga', 'kyoto', 'osaka', 'hyogo', 'nara', 'wakayama'],
  },
  {
    titleJa: '中国',
    titleEn: 'Chugoku',
    ids: ['tottori', 'shimane', 'okayama', 'hiroshima', 'yamaguchi'],
  },
  {
    titleJa: '四国',
    titleEn: 'Shikoku',
    ids: ['tokushima', 'kagawa', 'ehime', 'kochi'],
  },
  {
    titleJa: '九州・沖縄',
    titleEn: 'Kyushu / Okinawa',
    ids: [
      'fukuoka',
      'saga',
      'nagasaki',
      'kumamoto',
      'oita',
      'miyazaki',
      'kagoshima',
      'okinawa',
    ],
  },
];

/** ドロップダウン用: 現在地 + 全都道府県の shortLabel */
export const AREA_OPTIONS: string[] = [
  NEARBY_AREA,
  ...PREFECTURES.map((item) => item.shortLabel),
];

const BY_SHORT = new Map(
  PREFECTURES.map((item) => [item.shortLabel, item] as const),
);
const BY_ID = new Map(PREFECTURES.map((item) => [item.id, item] as const));

export function getPrefectureByShortLabel(
  shortLabel: string,
): Prefecture | undefined {
  return BY_SHORT.get(shortLabel.trim());
}

export function getPrefectureById(id: string): Prefecture | undefined {
  return BY_ID.get(id.trim());
}

export function prefectureCenter(
  shortLabel: string,
): { lat: number; lng: number } | null {
  const prefecture = getPrefectureByShortLabel(shortLabel);
  if (!prefecture) return null;
  return { lat: prefecture.latitude, lng: prefecture.longitude };
}

function distanceKmApprox(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function locationMatchesPrefecture(
  location: string,
  prefecture: Prefecture,
): boolean {
  const haystack = location.trim();
  if (!haystack) return false;
  const lower = haystack.toLowerCase();
  for (const alias of [prefecture.label, prefecture.shortLabel, ...prefecture.aliases]) {
    const needle = alias.trim();
    if (!needle) continue;
    if (haystack.includes(needle) || lower.includes(needle.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * 都道府県フィルタ: 住所エイリアス一致、または座標が県庁所在地の最寄り判定。
 */
export function eventBelongsToPrefectureArea(
  event: {
    location: string;
    latitude: number | null;
    longitude: number | null;
  },
  areaShortLabel: string,
): boolean {
  const prefecture = getPrefectureByShortLabel(areaShortLabel);
  if (!prefecture) {
    return event.location.includes(areaShortLabel);
  }

  if (locationMatchesPrefecture(event.location, prefecture)) {
    return true;
  }

  // 他県名が明示されていれば除外
  for (const other of PREFECTURES) {
    if (other.id === prefecture.id) continue;
    if (locationMatchesPrefecture(event.location, other)) return false;
  }

  if (event.latitude != null && event.longitude != null) {
    let bestId = prefecture.id;
    let bestDist = distanceKmApprox(
      event.latitude,
      event.longitude,
      prefecture.latitude,
      prefecture.longitude,
    );
    for (const other of PREFECTURES) {
      if (other.id === prefecture.id) continue;
      const dist = distanceKmApprox(
        event.latitude,
        event.longitude,
        other.latitude,
        other.longitude,
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestId = other.id;
      }
    }
    return bestId === prefecture.id;
  }

  return false;
}

/** resolveEventCoords 用: 県名・主要都市のフォールバック座標 */
export const AREA_CENTERS: { match: string; lat: number; lng: number }[] = [
  ...PREFECTURES.flatMap((item) => [
    { match: item.label, lat: item.latitude, lng: item.longitude },
    { match: item.shortLabel, lat: item.latitude, lng: item.longitude },
  ]),
  { match: '札幌', lat: 43.0618, lng: 141.3545 },
  { match: '渋谷', lat: 35.6595, lng: 139.7004 },
  { match: '新宿', lat: 35.6938, lng: 139.7034 },
  { match: '横浜', lat: 35.4437, lng: 139.638 },
  { match: '名古屋', lat: 35.1709, lng: 136.8815 },
  { match: '神戸', lat: 34.6901, lng: 135.1955 },
  { match: '仙台', lat: 38.2682, lng: 140.8694 },
  { match: '那覇', lat: 26.2124, lng: 127.6809 },
];
