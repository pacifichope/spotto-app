import { getNearbyEvents, type SportEvent } from '@/lib/events';
import i18n from '@/lib/i18n';
import {
  regionFromCoords,
  type LatLng,
  type MapRegion,
} from '@/lib/userLocation';

/** 「現在地から探す」モードの検索半径 */
export const NEARBY_RADIUS_KM = 40;

export type AreaDistrict = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
};

export type Prefecture = {
  id: string;
  label: string;
  shortLabel: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  /** 地図ズーム用の目安半径（県フィルタの距離制限には使わない） */
  radiusKm: number;
  /** ステップ2用。現在の選択UIでは未使用 */
  districts: AreaDistrict[];
};

export type AreaMode = 'nearby' | 'prefecture';

export type AreaSelection = {
  mode: AreaMode;
  prefectureId: string;
  detectedLabel?: string;
  latitude?: number;
  longitude?: number;
};

/** 地図・イベント絞り込み用の既定（東京都）。現在地ラベルには使わない */
export const DEFAULT_AREA: AreaSelection = {
  mode: 'prefecture',
  prefectureId: 'tokyo',
};

export const AREA_LABEL_LOCATING = '現在地を取得中…';
export const AREA_LABEL_UNSET = 'エリア未設定';
export const AREA_LABEL_NEARBY = '現在地';

function pref(
  id: string,
  label: string,
  shortLabel: string,
  aliases: string[],
  latitude: number,
  longitude: number,
  radiusKm: number,
  districts: AreaDistrict[] = [],
): Prefecture {
  return {
    id,
    label,
    shortLabel,
    aliases,
    latitude,
    longitude,
    radiusKm,
    districts,
  };
}

const TOKYO_DISTRICTS: AreaDistrict[] = [
  { id: 'shibuya', label: '渋谷区', latitude: 35.664, longitude: 139.698, radiusKm: 5 },
  { id: 'shinjuku', label: '新宿区', latitude: 35.6938, longitude: 139.7034, radiusKm: 5 },
  { id: 'minato', label: '港区', latitude: 35.6581, longitude: 139.7514, radiusKm: 5 },
  { id: 'setagaya', label: '世田谷区', latitude: 35.6464, longitude: 139.6532, radiusKm: 7 },
  { id: 'meguro', label: '目黒区', latitude: 35.6415, longitude: 139.6981, radiusKm: 5 },
  { id: 'nakano', label: '中野区', latitude: 35.7074, longitude: 139.6638, radiusKm: 5 },
];

const HOKKAIDO_DISTRICTS: AreaDistrict[] = [
  { id: 'sapporo-chuo', label: '札幌市中央区', latitude: 43.055, longitude: 141.341, radiusKm: 6 },
  { id: 'sapporo-kita', label: '札幌市北区', latitude: 43.091, longitude: 141.341, radiusKm: 7 },
  { id: 'sapporo-higashi', label: '札幌市東区', latitude: 43.076, longitude: 141.364, radiusKm: 7 },
  { id: 'hakodate', label: '函館市', latitude: 41.7688, longitude: 140.729, radiusKm: 12 },
  { id: 'asahikawa', label: '旭川市', latitude: 43.7706, longitude: 142.365, radiusKm: 12 },
];

export const PREFECTURES: Prefecture[] = [
  pref('hokkaido', '北海道', '北海道', ['北海道', 'Hokkaido', 'Sapporo'], 43.0642, 141.3469, 220, HOKKAIDO_DISTRICTS),
  pref('aomori', '青森県', '青森', ['青森県', '青森', 'Aomori'], 40.8244, 140.74, 70),
  pref('iwate', '岩手県', '岩手', ['岩手県', '岩手', 'Iwate', 'Morioka'], 39.7036, 141.1527, 80),
  pref('miyagi', '宮城県', '宮城', ['宮城県', '宮城', 'Miyagi', 'Sendai'], 38.2682, 140.8694, 60),
  pref('akita', '秋田県', '秋田', ['秋田県', '秋田', 'Akita'], 39.7186, 140.1024, 70),
  pref('yamagata', '山形県', '山形', ['山形県', '山形', 'Yamagata'], 38.2404, 140.3633, 65),
  pref('fukushima', '福島県', '福島', ['福島県', '福島', 'Fukushima'], 37.75, 140.4678, 80),
  pref('ibaraki', '茨城県', '茨城', ['茨城県', '茨城', 'Ibaraki', 'Mito'], 36.3418, 140.4468, 55),
  pref('tochigi', '栃木県', '栃木', ['栃木県', '栃木', 'Tochigi', 'Utsunomiya'], 36.5658, 139.8836, 55),
  pref('gunma', '群馬県', '群馬', ['群馬県', '群馬', 'Gunma', 'Maebashi'], 36.3911, 139.0608, 55),
  pref('saitama', '埼玉県', '埼玉', ['埼玉県', '埼玉', 'Saitama'], 35.8569, 139.6489, 40),
  pref('chiba', '千葉県', '千葉', ['千葉県', '千葉', 'Chiba'], 35.6047, 140.1233, 50),
  pref('tokyo', '東京都', '東京', ['東京都', '東京', 'Tokyo'], 35.6895, 139.6917, 40, TOKYO_DISTRICTS),
  pref('kanagawa', '神奈川県', '神奈川', ['神奈川県', '神奈川', 'Kanagawa', 'Yokohama', 'Kawasaki'], 35.4478, 139.6425, 28),
  pref('niigata', '新潟県', '新潟', ['新潟県', '新潟', 'Niigata'], 37.9022, 139.0236, 90),
  pref('toyama', '富山県', '富山', ['富山県', '富山', 'Toyama'], 36.6953, 137.2113, 50),
  pref('ishikawa', '石川県', '石川', ['石川県', '石川', 'Ishikawa', 'Kanazawa'], 36.5946, 136.6256, 55),
  pref('fukui', '福井県', '福井', ['福井県', '福井', 'Fukui'], 36.0652, 136.2216, 50),
  pref('yamanashi', '山梨県', '山梨', ['山梨県', '山梨', 'Yamanashi', 'Kofu'], 35.6642, 138.5684, 50),
  pref('nagano', '長野県', '長野', ['長野県', '長野', 'Nagano'], 36.6513, 138.181, 80),
  pref('gifu', '岐阜県', '岐阜', ['岐阜県', '岐阜', 'Gifu'], 35.3912, 136.7223, 60),
  pref('shizuoka', '静岡県', '静岡', ['静岡県', '静岡', 'Shizuoka', 'Hamamatsu'], 34.9769, 138.3831, 70),
  pref('aichi', '愛知県', '愛知', ['愛知県', '愛知', 'Aichi', 'Nagoya'], 35.1802, 136.9066, 45),
  pref('mie', '三重県', '三重', ['三重県', '三重', 'Mie', 'Tsu'], 34.7303, 136.5086, 60),
  pref('shiga', '滋賀県', '滋賀', ['滋賀県', '滋賀', 'Shiga', 'Otsu'], 35.0045, 135.8686, 40),
  pref('kyoto', '京都府', '京都', ['京都府', '京都', 'Kyoto'], 35.0214, 135.7556, 45),
  pref('osaka', '大阪府', '大阪', ['大阪府', '大阪', 'Osaka'], 34.6863, 135.52, 32),
  pref('hyogo', '兵庫県', '兵庫', ['兵庫県', '兵庫', 'Hyogo', 'Kobe'], 34.6913, 135.183, 55),
  pref('nara', '奈良県', '奈良', ['奈良県', '奈良', 'Nara'], 34.6851, 135.805, 40),
  pref('wakayama', '和歌山県', '和歌山', ['和歌山県', '和歌山', 'Wakayama'], 34.226, 135.1675, 55),
  pref('tottori', '鳥取県', '鳥取', ['鳥取県', '鳥取', 'Tottori'], 35.5039, 134.2378, 55),
  pref('shimane', '島根県', '島根', ['島根県', '島根', 'Shimane', 'Matsue'], 35.4723, 133.0505, 70),
  pref('okayama', '岡山県', '岡山', ['岡山県', '岡山', 'Okayama'], 34.6618, 133.9347, 50),
  pref('hiroshima', '広島県', '広島', ['広島県', '広島', 'Hiroshima'], 34.3963, 132.4596, 60),
  pref('yamaguchi', '山口県', '山口', ['山口県', '山口', 'Yamaguchi'], 34.1859, 131.4706, 60),
  pref('tokushima', '徳島県', '徳島', ['徳島県', '徳島', 'Tokushima'], 34.0658, 134.5593, 45),
  pref('kagawa', '香川県', '香川', ['香川県', '香川', 'Kagawa', 'Takamatsu'], 34.3401, 134.0434, 35),
  pref('ehime', '愛媛県', '愛媛', ['愛媛県', '愛媛', 'Ehime', 'Matsuyama'], 33.8416, 132.7661, 60),
  pref('kochi', '高知県', '高知', ['高知県', '高知', 'Kochi'], 33.5597, 133.5311, 60),
  pref('fukuoka', '福岡県', '福岡', ['福岡県', '福岡', 'Fukuoka', 'Kitakyushu'], 33.6064, 130.4183, 50),
  pref('saga', '佐賀県', '佐賀', ['佐賀県', '佐賀', 'Saga'], 33.2494, 130.2988, 35),
  pref('nagasaki', '長崎県', '長崎', ['長崎県', '長崎', 'Nagasaki'], 32.7503, 129.8777, 60),
  pref('kumamoto', '熊本県', '熊本', ['熊本県', '熊本', 'Kumamoto'], 32.7898, 130.7417, 55),
  pref('oita', '大分県', '大分', ['大分県', '大分', 'Oita'], 33.2382, 131.6126, 55),
  pref('miyazaki', '宮崎県', '宮崎', ['宮崎県', '宮崎', 'Miyazaki'], 31.9111, 131.4239, 60),
  pref('kagoshima', '鹿児島県', '鹿児島', ['鹿児島県', '鹿児島', 'Kagoshima'], 31.5602, 130.5581, 80),
  pref('okinawa', '沖縄県', '沖縄', ['沖縄県', '沖縄', 'Okinawa', 'Naha'], 26.2124, 127.6809, 70),
];

export const PREFECTURE_GROUPS: { title: string; ids: string[] }[] = [
  {
    title: '北海道・東北',
    ids: ['hokkaido', 'aomori', 'iwate', 'miyagi', 'akita', 'yamagata', 'fukushima'],
  },
  {
    title: '関東',
    ids: ['ibaraki', 'tochigi', 'gunma', 'saitama', 'chiba', 'tokyo', 'kanagawa'],
  },
  {
    title: '中部',
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
    title: '近畿',
    ids: ['mie', 'shiga', 'kyoto', 'osaka', 'hyogo', 'nara', 'wakayama'],
  },
  {
    title: '中国',
    ids: ['tottori', 'shimane', 'okayama', 'hiroshima', 'yamaguchi'],
  },
  {
    title: '四国',
    ids: ['tokushima', 'kagawa', 'ehime', 'kochi'],
  },
  {
    title: '九州・沖縄',
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

export function getPrefectureById(id: string | null | undefined): Prefecture {
  const fallback =
    PREFECTURES.find((item) => item.id === 'tokyo') ?? PREFECTURES[0];
  if (!id) return fallback;
  return PREFECTURES.find((item) => item.id === id) ?? fallback;
}

export function getAreaLabel(selection?: AreaSelection | null) {
  if (!selection) {
    return i18n.t('areas.unset', { defaultValue: AREA_LABEL_UNSET });
  }
  if (selection.mode === 'nearby') {
    const detected = selection.detectedLabel?.trim();
    if (detected) return detected;
    if (
      selection.latitude != null &&
      selection.longitude != null &&
      Number.isFinite(selection.latitude) &&
      Number.isFinite(selection.longitude)
    ) {
      return i18n.t('areas.nearby', { defaultValue: AREA_LABEL_NEARBY });
    }
    return i18n.t('areas.unset', { defaultValue: AREA_LABEL_UNSET });
  }
  const prefecture = getPrefectureById(selection.prefectureId);
  return i18n.t(`areas.prefectures.${prefecture.id}`, {
    defaultValue: prefecture.label,
  });
}

export type GeocodeHint = {
  region?: string | null;
  subregion?: string | null;
  city?: string | null;
  district?: string | null;
  name?: string | null;
};

function normalizeAdmin(value: string) {
  return value
    .replace(/都$|府$|県$/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶ]/;

/** OS が返す英語の主要都市名 → 日本語表示 */
const PLACE_EN_TO_JA: Record<string, string> = {
  sapporo: '札幌',
  hakodate: '函館',
  asahikawa: '旭川',
  aomori: '青森',
  morioka: '盛岡',
  sendai: '仙台',
  akita: '秋田',
  yamagata: '山形',
  fukushima: '福島',
  mito: '水戸',
  utsunomiya: '宇都宮',
  maebashi: '前橋',
  saitama: '埼玉',
  chiba: '千葉',
  tokyo: '東京',
  yokohama: '横浜',
  kawasaki: '川崎',
  sagamihara: '相模原',
  niigata: '新潟',
  toyama: '富山',
  kanazawa: '金沢',
  fukui: '福井',
  kofu: '甲府',
  nagano: '長野',
  gifu: '岐阜',
  shizuoka: '静岡',
  hamamatsu: '浜松',
  nagoya: '名古屋',
  tsu: '津',
  otsu: '大津',
  kyoto: '京都',
  osaka: '大阪',
  kobe: '神戸',
  nara: '奈良',
  wakayama: '和歌山',
  tottori: '鳥取',
  matsue: '松江',
  okayama: '岡山',
  hiroshima: '広島',
  yamaguchi: '山口',
  tokushima: '徳島',
  takamatsu: '高松',
  matsuyama: '松山',
  kochi: '高知',
  fukuoka: '福岡',
  kitakyushu: '北九州',
  saga: '佐賀',
  nagasaki: '長崎',
  kumamoto: '熊本',
  oita: '大分',
  miyazaki: '宮崎',
  kagoshima: '鹿児島',
  naha: '那覇',
  okinawa: '沖縄',
  hokkaido: '北海道',
};

/** 英語の行政区サフィックスを除いた照合キー */
function englishPlaceKey(value: string): string {
  return normalizeAdmin(value)
    .replace(/[-_\s]/g, '')
    .replace(/(shi|city|ku|ward|gun|town|village|prefecture|to|fu|ken)$/g, '');
}

/** 日本語の市区名をホーム向けに短く（札幌市→札幌、札幌市中央区→札幌） */
function simplifyJapanesePlace(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const cityWard = trimmed.match(/^(.+?)市.+区$/);
  if (cityWard?.[1]) return cityWard[1];
  if (trimmed.endsWith('市') && trimmed.length > 1) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

/**
 * 逆ジオコードの地名を日本語表示に揃える。
 * OS 言語が英語だと "Sapporo" などになるため、既知の対応表と都道府県エイリアスで変換する。
 */
export function localizePlaceLabel(
  raw: string | null | undefined,
  prefecture?: Prefecture | null,
): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  if (HAS_JAPANESE.test(value)) {
    return simplifyJapanesePlace(value);
  }

  const key = englishPlaceKey(value);
  if (!key) return null;

  const mapped = PLACE_EN_TO_JA[key];
  if (mapped) return mapped;

  const searchList = prefecture ? [prefecture, ...PREFECTURES] : PREFECTURES;
  const seen = new Set<string>();
  for (const prefItem of searchList) {
    if (seen.has(prefItem.id)) continue;
    seen.add(prefItem.id);
    for (const alias of [
      prefItem.label,
      prefItem.shortLabel,
      ...prefItem.aliases,
    ]) {
      if (englishPlaceKey(alias) === key) {
        return prefItem.shortLabel;
      }
    }
    for (const district of prefItem.districts) {
      const districtJa = simplifyJapanesePlace(district.label);
      if (englishPlaceKey(district.label) === key) {
        return districtJa;
      }
      // "Sapporo" が「札幌市中央区」に含まれる場合
      if (
        districtJa &&
        englishPlaceKey(districtJa) === key
      ) {
        return districtJa;
      }
    }
  }

  return null;
}

function distanceKmApprox(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = (aLat - bLat) * 111;
  const dLng =
    (aLng - bLng) * 111 * Math.cos((bLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function prefectureTextNeedles(prefecture: Prefecture): string[] {
  return [
    prefecture.label,
    prefecture.shortLabel,
    ...prefecture.aliases,
    ...prefecture.districts.map((d) => d.label),
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
}

/** 住所テキストが都道府県に属するかどうか */
export function locationTextMatchesPrefecture(
  locationText: string,
  prefecture: Prefecture,
): boolean {
  const haystack = String(locationText || '').trim();
  if (!haystack) return false;
  const normalizedHay = normalizeAdmin(haystack);
  const rawLower = haystack.toLowerCase();
  for (const needle of prefectureTextNeedles(prefecture)) {
    const raw = needle.trim();
    if (!raw) continue;
    if (haystack.includes(raw) || rawLower.includes(raw.toLowerCase())) {
      return true;
    }
    const normalizedNeedle = normalizeAdmin(raw);
    if (
      normalizedNeedle.length >= 2 &&
      (normalizedHay.includes(normalizedNeedle) ||
        normalizedHay === normalizedNeedle)
    ) {
      return true;
    }
  }
  return false;
}

function eventLocationBlob(event: Pick<SportEvent, 'location' | 'locationNote' | 'title'>) {
  return [event.location, event.locationNote, event.title]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * 座標から最も近い都道府県を推定（住所に県名が無いイベント用）。
 */
export function nearestPrefectureId(
  latitude: number,
  longitude: number,
): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  let bestId: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const prefecture of PREFECTURES) {
    const dist = distanceKmApprox(
      latitude,
      longitude,
      prefecture.latitude,
      prefecture.longitude,
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestId = prefecture.id;
    }
  }
  return bestId;
}

/**
 * イベントが指定都道府県に属するか。
 * 距離上限は設けず、住所マッチ → 県庁所在地への最寄り推定の順で判定する。
 * （表示順はホーム側で県庁所在地からの距離を用いて並べ替える）
 */
export function eventBelongsToPrefecture(
  event: SportEvent,
  prefectureId: string,
): boolean {
  const prefecture = getPrefectureById(prefectureId);
  if (!prefecture) return false;

  const blob = eventLocationBlob(event);
  if (blob && locationTextMatchesPrefecture(blob, prefecture)) {
    return true;
  }

  // 他県名が明示されている場合は除外（誤マッチ防止）
  if (blob) {
    for (const other of PREFECTURES) {
      if (other.id === prefecture.id) continue;
      if (locationTextMatchesPrefecture(blob, other)) return false;
    }
  }

  if (
    Number.isFinite(event.latitude) &&
    Number.isFinite(event.longitude)
  ) {
    return nearestPrefectureId(event.latitude, event.longitude) === prefecture.id;
  }

  return false;
}

export function filterEventsByPrefecture(
  events: SportEvent[],
  prefectureId: string,
): SportEvent[] {
  return events.filter((event) => eventBelongsToPrefecture(event, prefectureId));
}

export function matchPrefectureFromGeocode(hint: GeocodeHint | null): Prefecture | null {
  if (!hint) return null;
  const parts = [hint.region, hint.subregion, hint.city, hint.district, hint.name]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.trim());
  if (parts.length === 0) return null;

  for (const prefecture of PREFECTURES) {
    const needles = [prefecture.label, prefecture.shortLabel, ...prefecture.aliases].map(
      normalizeAdmin,
    );
    if (
      parts.some((part) => {
        const normalized = normalizeAdmin(part);
        return needles.some(
          (needle) =>
            normalized === needle ||
            (needle.length >= 2 && normalized.includes(needle)),
        );
      })
    ) {
      return prefecture;
    }
  }
  return null;
}

export function formatDetectedLabel(hint: GeocodeHint | null, prefecture: Prefecture | null) {
  const candidates = [
    hint?.city,
    hint?.district,
    hint?.subregion,
    hint?.region,
  ];

  for (const part of candidates) {
    const localized = localizePlaceLabel(part, prefecture);
    if (localized) return localized;
  }

  if (prefecture) {
    return i18n.t(`areas.prefecturesShort.${prefecture.id}`, {
      defaultValue: prefecture.shortLabel || prefecture.label,
    });
  }
  return i18n.t('areas.nearby', { defaultValue: AREA_LABEL_NEARBY });
}

export function resolveSelectionCenter(
  selection?: AreaSelection | null,
): LatLng | null {
  if (!selection) return null;
  if (selection.mode === 'nearby') {
    if (
      selection.latitude == null ||
      selection.longitude == null ||
      !Number.isFinite(selection.latitude) ||
      !Number.isFinite(selection.longitude)
    ) {
      return null;
    }
    return { latitude: selection.latitude, longitude: selection.longitude };
  }
  const prefecture = getPrefectureById(selection.prefectureId);
  if (
    !Number.isFinite(prefecture?.latitude) ||
    !Number.isFinite(prefecture?.longitude)
  ) {
    return null;
  }
  return { latitude: prefecture.latitude, longitude: prefecture.longitude };
}

export function mapRegionForSelection(
  selection?: AreaSelection | null,
): MapRegion | null {
  const center = resolveSelectionCenter(selection);
  if (!center) return null;
  if (selection?.mode === 'nearby') {
    // 直径 ≈ 半径*2 を画面に収める
    const delta = Math.max(0.32, (NEARBY_RADIUS_KM / 111) * 2.1);
    return regionFromCoords(center, delta, delta);
  }
  const prefecture = getPrefectureById(selection?.prefectureId);
  const coverKm = prefecture?.radiusKm ?? 50;
  const delta = Math.max(0.28, (coverKm / 111) * 2.2);
  return regionFromCoords(center, delta, delta);
}

export function filterEventsByArea(
  events: SportEvent[] | null | undefined,
  selection?: AreaSelection | null,
): SportEvent[] {
  const source = Array.isArray(events) ? events : [];
  if (source.length === 0) return [];
  if (!selection?.mode) return source;

  try {
    if (selection.mode === 'prefecture') {
      // 選択都道府県のみ（QA モック含む。県外の東京イベントは出さない）
      return filterEventsByPrefecture(source, selection.prefectureId);
    }

    // nearby: GPS 半径 + 同じ都道府県（半径外でも県内の公開イベントは見える）
    const center = resolveSelectionCenter(selection);
    if (!center) {
      return [];
    }
    const nearby = getNearbyEvents(
      center.latitude,
      center.longitude,
      NEARBY_RADIUS_KM,
      source,
    );
    const inPrefecture = selection.prefectureId
      ? filterEventsByPrefecture(source, selection.prefectureId)
      : [];
    const byId = new Map<string, SportEvent>();
    for (const event of nearby) byId.set(event.id, event);
    for (const event of inPrefecture) byId.set(event.id, event);
    return [...byId.values()];
  } catch {
    // フィルタ失敗時は全国表示にフォールバックせず空にする
    return [];
  }
}

/**
 * マップ表示範囲（リージョン）内のイベント。
 * リストとマップの地理コンテキストを一致させるために使う。
 */
export function filterEventsByMapRegion(
  events: SportEvent[] | null | undefined,
  region?: MapRegion | null,
  options?: { padRatio?: number },
): SportEvent[] {
  const source = Array.isArray(events) ? events : [];
  if (source.length === 0) return [];
  if (
    !region ||
    !Number.isFinite(region.latitude) ||
    !Number.isFinite(region.longitude) ||
    !Number.isFinite(region.latitudeDelta) ||
    !Number.isFinite(region.longitudeDelta)
  ) {
    return source;
  }

  const pad = Math.max(0, options?.padRatio ?? 0.1);
  const latHalf = Math.max(region.latitudeDelta, 0.01) * (0.5 + pad * 0.5);
  const lngHalf = Math.max(region.longitudeDelta, 0.01) * (0.5 + pad * 0.5);
  const minLat = region.latitude - latHalf;
  const maxLat = region.latitude + latHalf;
  const minLng = region.longitude - lngHalf;
  const maxLng = region.longitude + lngHalf;

  return source.filter((event) => {
    if (
      !Number.isFinite(event?.latitude) ||
      !Number.isFinite(event?.longitude)
    ) {
      return false;
    }
    return (
      event.latitude >= minLat &&
      event.latitude <= maxLat &&
      event.longitude >= minLng &&
      event.longitude <= maxLng
    );
  });
}

/** マップ中心から表示用のエリア名（パン後のリストヘッダー用） */
export function labelForMapRegion(region?: MapRegion | null): string | null {
  if (
    !region ||
    !Number.isFinite(region.latitude) ||
    !Number.isFinite(region.longitude)
  ) {
    return null;
  }
  const prefectureId = nearestPrefectureId(region.latitude, region.longitude);
  if (!prefectureId) return null;
  const prefecture = getPrefectureById(prefectureId);
  return i18n.t(`areas.prefecturesShort.${prefecture.id}`, {
    defaultValue: prefecture.shortLabel,
  });
}

/** @deprecated filterEventsByArea を使ってください */
export function filterEventsBySelection(
  events: SportEvent[] | null | undefined,
  selection?: AreaSelection | null,
): SportEvent[] {
  return filterEventsByArea(events, selection);
}
