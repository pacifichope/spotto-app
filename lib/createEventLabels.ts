/**
 * イベント作成フロー用の表示ラベル変換。
 *
 * 保存される値（スポーツ名・レベル・キャンセルポリシー文言・年齢層プリセットなど）は
 * 従来どおり日本語の ID 文字列のまま。ここでは「画面に表示するときだけ」翻訳する。
 * コンポーネント側で useTranslation() して再レンダーを購読したうえで呼び出すこと。
 */
import i18n, { getCurrentAppLanguage } from '@/lib/i18n';
import {
  formatSessionSlot,
  sortEventSessions,
  type EventSession,
  type RegistrationDeadlineOffset,
} from '@/lib/events';

const SPORT_KEYS: Record<string, string> = {
  サッカー: 'soccer',
  バスケットボール: 'basketball',
  テニス: 'tennis',
  ランニング: 'running',
  野球: 'baseball',
  バレーボール: 'volleyball',
  バドミントン: 'badminton',
  フットサル: 'futsal',
  その他: 'other',
};

const LEVEL_KEYS: Record<string, string> = {
  初心者: 'beginner',
  中級: 'intermediate',
  上級: 'advanced',
  誰でも歓迎: 'everyone',
};

const AGE_GROUP_KEYS: Record<string, string> = {
  全世代ウェルカム: 'allGenerations',
  学生向け: 'students',
  '20代中心': 'twenties',
  '20〜30代中心': 'twentiesThirties',
  '30〜40代中心': 'thirtiesForties',
  '40代以上歓迎': 'fortiesPlus',
};

/** 保存済みの CANCEL_POLICY_OPTIONS[].label（ID）→ 翻訳キー */
const CANCEL_POLICY_KEYS: Record<string, string> = {
  '開催の2日前までキャンセル無料、以降は返金なし': 'twoDays',
  '開催の3日前までキャンセル無料、以降は返金なし': 'threeDays',
  '開催の24時間前まで全額返金、以降は返金なし': 'oneDay',
  返金不可: 'none',
};

export const WEEKDAY_KEYS = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
] as const;

export const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

function translateOrRaw(
  map: Record<string, string>,
  prefix: string,
  raw: string,
  suffix = '',
) {
  const key = map[raw];
  if (!key) return raw;
  return i18n.t(`${prefix}.${key}${suffix}`, { defaultValue: raw });
}

/** スポーツ名（保存値は日本語のまま）。自由入力カテゴリはそのまま返す */
export function sportDisplayLabel(label: string) {
  return translateOrRaw(SPORT_KEYS, 'create.sports', label);
}

export function levelDisplayLabel(level: string) {
  return translateOrRaw(LEVEL_KEYS, 'create.levels', level);
}

export function ageGroupDisplayLabel(preset: string) {
  return translateOrRaw(AGE_GROUP_KEYS, 'create.ageGroups', preset);
}

/** キャンセルポリシー: 保存 ID（日本語ラベル）→ 表示ラベル */
export function cancelPolicyDisplayLabel(policyId: string) {
  return translateOrRaw(
    CANCEL_POLICY_KEYS,
    'create.cancelPolicies',
    policyId,
    '.label',
  );
}

export function cancelPolicyDisplayHint(policyId: string, fallback = '') {
  const key = CANCEL_POLICY_KEYS[policyId];
  if (!key) return fallback;
  return i18n.t(`create.cancelPolicies.${key}.hint`, { defaultValue: fallback });
}

export function deadlineDisplayLabel(offset: RegistrationDeadlineOffset) {
  return i18n.t(`create.deadline.options.${String(offset)}.label`, {
    defaultValue: i18n.t('create.deadline.unset'),
  });
}

export function deadlineDisplaySublabel(offset: RegistrationDeadlineOffset) {
  return i18n.t(`create.deadline.options.${String(offset)}.sublabel`, {
    defaultValue: '',
  });
}

export function weekdayShortLabel(dayIndex: number) {
  return i18n.t(`create.weekdaysShort.${WEEKDAY_KEYS[dayIndex] ?? 'sun'}`);
}

export function monthShortLabel(monthIndex: number) {
  return i18n.t(`create.monthsShort.${MONTH_KEYS[monthIndex] ?? 'jan'}`);
}

/** 数値の桁区切りロケール */
export function numberLocale() {
  return getCurrentAppLanguage() === 'en' ? 'en-US' : 'ja-JP';
}

/** "M/D" 形式。日付が不正なら「日程未定」 */
export function formatMonthDay(date: string | null | undefined) {
  const parts = String(date || '')
    .trim()
    .split(/[-/.]/);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!parts[0] || !Number.isFinite(month) || !Number.isFinite(day)) {
    return i18n.t('create.form.scheduleUndecided');
  }
  return `${month}/${day}`;
}

/** 複数開催日の要約（件数超過時の「ほか N 件」を翻訳） */
export function formatSessionsSummaryLocalized(
  sessions: EventSession[],
  max = 3,
) {
  const labels = sortEventSessions(sessions).map(formatSessionSlot);
  if (labels.length <= max) return labels.join(', ');
  return i18n.t('create.sessions.more', {
    list: labels.slice(0, max).join(', '),
    count: labels.length - max,
  });
}
