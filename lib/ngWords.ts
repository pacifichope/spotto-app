import type { CreateEventPayload } from '@/components/createEventSheetTypes';
import { normalizeSearchText } from '@/lib/searchText';

/**
 * NG ワード（暴言・性的表現・スパムなど）。
 * 表記ゆれは normalizeSearchText で吸収する。
 */
export const NG_WORDS = [
  // 1. 暴力・脅迫・差別的表現
  '死ね',
  'しね',
  '殺す',
  'ころす',
  'ぶっ殺す',
  '消えろ',
  'きえろ',
  'くたばれ',
  '障害者',
  '乞食',
  'バカ',
  '馬鹿',
  'アホ',
  'クソ野郎',
  'ばかやろう',

  // 2. 性的なスラング・不適切表現（追加分含む）
  'おっぱい',
  'クンニ',
  'くんに',
  'フェラ',
  'パイズリ',
  'ちんこ',
  'チンコ',
  'まんこ',
  'マンコ',
  'ちんぽ',
  'チンポ',
  'セックス',
  'エロ',
  'アダルト',
  '出会い',
  'パパ活',
  'ママ活',
  '裏垢',
  'セフレ',

  // 3. スパム・詐欺・悪質な誘導
  '今すぐクリック',
  '無料で稼げる',
  '副業',
  '楽して稼げる',
  '投資',
  'バイナリー',
  '暗号資産',
  '仮想通貨',
  '儲かる',
  'LINE追加して',
  'ライン交換',
  '架空請求',
  '当選しました',
] as const;

const NORMALIZED_NG_WORDS = NG_WORDS.map((word) => normalizeSearchText(word)).filter(
  Boolean,
);

export const NG_WORD_ERROR_MESSAGE =
  '不適切な表現またはスパムとみなされる文言が含まれているため、送信できません。内容を見直してください。';

export type NgWordHit = {
  word: string;
};

/** テキストに NG ワードが含まれるか（部分一致・正規化後） */
export function findNgWord(text: string): NgWordHit | null {
  const normalized = normalizeSearchText(text);
  if (!normalized) return null;
  for (let i = 0; i < NORMALIZED_NG_WORDS.length; i += 1) {
    const needle = NORMALIZED_NG_WORDS[i];
    if (needle && normalized.includes(needle)) {
      return { word: NG_WORDS[i] };
    }
  }
  return null;
}

export function containsNgWord(text: string): boolean {
  return findNgWord(text) != null;
}

/** 複数テキストをまとめて検査。最初にヒットしたものを返す */
export function findNgWordInTexts(texts: Array<string | null | undefined>): NgWordHit | null {
  for (const text of texts) {
    if (!text) continue;
    const hit = findNgWord(text);
    if (hit) return hit;
  }
  return null;
}

/** イベント作成ペイロード内のユーザー入力テキストを検査 */
export function findNgWordInCreatePayload(
  payload: CreateEventPayload,
): NgWordHit | null {
  const texts: Array<string | null | undefined> = [
    payload.title,
    payload.description,
    payload.location,
    payload.locationNote,
    payload.sport,
    ...(payload.itemsToBring ?? []),
    ...(payload.includedItems ?? []),
    ...(payload.targetAgeGroups ?? []),
  ];
  for (const question of payload.preQuestions ?? []) {
    texts.push(question.title);
    texts.push(...(question.options ?? []));
  }
  return findNgWordInTexts(texts);
}
