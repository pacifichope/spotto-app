import type { CreateEventPayload } from '@/lib/createEventModel';
import { normalizeSearchText } from '@/lib/searchText';

/** アプリ版 lib/ngWords.ts と同一リスト */
export const NG_WORDS = [
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

const NORMALIZED_NG_WORDS = NG_WORDS.map((word) =>
  normalizeSearchText(word),
).filter(Boolean);

export const NG_WORD_ERROR_MESSAGE =
  '不適切な表現またはスパムとみなされる文言が含まれているため、送信できません。内容を見直してください。';

export function findNgWord(text: string): { word: string } | null {
  const normalized = normalizeSearchText(text);
  if (!normalized) return null;
  for (let i = 0; i < NORMALIZED_NG_WORDS.length; i += 1) {
    const needle = NORMALIZED_NG_WORDS[i];
    if (needle && normalized.includes(needle)) {
      return { word: NG_WORDS[i]! };
    }
  }
  return null;
}

export function findNgWordInCreatePayload(
  payload: CreateEventPayload,
): { word: string } | null {
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
  for (const text of texts) {
    if (!text) continue;
    const hit = findNgWord(text);
    if (hit) return hit;
  }
  return null;
}
