/**
 * 検索用テキスト正規化（ひらがな / カタカナ / 英字の表記揺れ吸収）
 */

/** カタカナ → ひらがな（長音記号はそのまま） */
export function katakanaToHiragana(input: string): string {
  return input.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/**
 * 比較用に正規化:
 * - NFKC（全角英数 → 半角など）
 * - 小文字化
 * - カタカナ → ひらがな
 * - 空白除去
 */
export function normalizeSearchText(input: string): string {
  return katakanaToHiragana(input.normalize('NFKC').toLowerCase()).replace(
    /[\s\u3000]+/g,
    '',
  );
}

/**
 * スポーツ名などで起きやすい表記ゆれグループ。
 * グループ内のいずれかを入力すれば、同グループの語を含むイベントにヒットする。
 */
const SEARCH_ALIAS_GROUPS: string[][] = [
  ['ヨガ', 'よが', 'yoga'],
  ['サッカー', 'さっかー', 'soccer', 'football', 'フットボール', 'ふっとぼーる'],
  ['フットサル', 'ふっとさる', 'futsal'],
  [
    'バスケットボール',
    'ばすけっとぼーる',
    'バスケ',
    'ばすけ',
    'basketball',
    'basket',
    'hoops',
  ],
  ['テニス', 'てにす', 'tennis'],
  ['バドミントン', 'ばどみんとん', 'バド', 'ばど', 'badminton'],
  [
    'ランニング',
    'らんにんぐ',
    'ジョギング',
    'じょぎんぐ',
    'running',
    'run',
    'jog',
    'jogging',
  ],
  ['野球', 'やきゅう', 'baseball'],
  [
    'バレーボール',
    'ばれーぼーる',
    'バレー',
    'ばれー',
    'volleyball',
    'volley',
  ],
  ['ゴルフ', 'ごるふ', 'golf'],
  ['卓球', 'たっきゅう', 'ピンポン', 'ぴんぽん', 'tabletennis', 'pingpong'],
  ['水泳', 'すいえい', 'スイミング', 'すいみんぐ', 'swimming', 'swim'],
];

const ALIAS_LOOKUP = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of SEARCH_ALIAS_GROUPS) {
    const norms = group.map((item) => normalizeSearchText(item));
    const shared = new Set(norms);
    for (const key of norms) {
      const existing = map.get(key) ?? new Set<string>();
      for (const item of shared) existing.add(item);
      map.set(key, existing);
    }
  }
  return map;
})();

/** 正規化文字列に紐づく別名も含めた検索キー集合 */
export function expandSearchForms(input: string): string[] {
  const normalized = normalizeSearchText(input);
  if (!normalized) return [];

  const forms = new Set<string>([normalized]);

  const exact = ALIAS_LOOKUP.get(normalized);
  if (exact) {
    for (const item of exact) forms.add(item);
  }

  // 部分一致（「ばすけ」が「ばすけっとぼーる」グループに入る等）
  for (const [key, group] of ALIAS_LOOKUP) {
    if (
      key.length >= 2 &&
      (normalized.includes(key) || key.includes(normalized))
    ) {
      for (const item of group) forms.add(item);
    }
  }

  return [...forms];
}

/** haystack が query のあいまい検索にヒットするか */
export function matchesFuzzySearch(
  haystack: string | null | undefined,
  query: string,
): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const hay = normalizeSearchText(haystack ?? '');
  if (!hay) return false;
  if (hay.includes(q)) return true;

  const queryForms = expandSearchForms(q);
  const hayForms = expandSearchForms(hay);
  return queryForms.some((qf) =>
    hayForms.some((hf) => hf.includes(qf) || (qf.length >= 2 && qf.includes(hf))),
  );
}

type SearchableEvent = {
  title?: string | null;
  sport?: string | null;
  location?: string | null;
  locationNote?: string | null;
  host?: string | null;
  vibe?: string | null;
  level?: string | null;
};

/** イベントの主要フィールドを横断してあいまい検索 */
export function eventMatchesSearchQuery(
  event: SearchableEvent,
  query: string,
): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;

  const blob = [
    event.title,
    event.sport,
    event.location,
    event.locationNote,
    event.host,
    event.vibe,
    event.level,
  ]
    .filter(Boolean)
    .join(' ');

  // スポーツ名の別名を明示的に足す（タイトルに英名が無い場合でも yoga → ヨガ）
  const withSportAliases = `${blob} ${expandSearchForms(event.sport ?? '').join(' ')}`;
  return matchesFuzzySearch(withSportAliases, q);
}
