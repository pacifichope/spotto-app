/**
 * アプリ版 CreateEventPayload / buildEventInsertRow 相当。
 * Web は Expo の lib/ を直接 import できないため、同じデータ構造・正規化をここへ移植する。
 */

import { theme } from '@/constants/theme';
import { sanitizeSnsLinks } from '@/lib/snsLinks';
import type { WebOrganizerProfile } from '@/lib/organizerProfile';

export type SkillLevel = '初心者' | '中級' | '上級' | '誰でも歓迎';
export type ScheduleType = 'single' | 'recurring';
export type RegistrationDeadlineOffset = number | 'end';
export type PreQuestionType = 'text' | 'single' | 'multi';
export type FeeType = 'free' | 'paid';

export type EventSession = {
  date: string;
  time: string;
  endDate?: string;
  endTime?: string;
};

export type PreQuestion = {
  id: string;
  title: string;
  type: PreQuestionType;
  required: boolean;
  enabled: boolean;
  options: string[];
};

export type CreateEventPayload = {
  title: string;
  sport: string;
  emoji: string;
  level: SkillLevel;
  date: string;
  time: string;
  endDate?: string;
  endTime?: string;
  sessions?: EventSession[];
  location: string;
  locationNote?: string;
  description: string;
  imageUri: string;
  imageUris: string[];
  capacity: number;
  priceYen: number;
  cancelPolicy: string;
  protection: string;
  scheduleType: ScheduleType;
  latitude: number;
  longitude: number;
  registrationDeadlineOffset?: RegistrationDeadlineOffset;
  enablePreQuestions?: boolean;
  preQuestions?: PreQuestion[];
  itemsToBring?: string[];
  includedItems?: string[];
  targetAgeGroups?: string[];
};

export const MAX_EVENT_PHOTOS = 5;
export const MAX_EVENT_ITEMS = 8;
export const MAX_EVENT_ITEM_LENGTH = 24;
export const MAX_TARGET_AGE_GROUP_LENGTH = 24;
export const MAX_TARGET_AGE_GROUPS = 6;
export const MAX_PRE_QUESTIONS = 15;
export const MAX_PRE_QUESTION_OPTIONS = 8;
export const TITLE_MAX_LENGTH = 20;
export const OTHER_SPORT_LABEL = 'その他';

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

export const TARGET_AGE_PRESETS = [
  '全世代ウェルカム',
  '学生向け',
  '20代中心',
  '20〜30代中心',
  '30〜40代中心',
  '40代以上歓迎',
] as const;

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

export const REGISTRATION_DEADLINE_OPTIONS: {
  value: RegistrationDeadlineOffset;
  labelJa: string;
  labelEn: string;
}[] = [
  { value: 0, labelJa: 'イベント開始時まで', labelEn: 'Until activity starts' },
  { value: 'end', labelJa: 'イベント終了まで', labelEn: 'Until activity ends' },
  { value: 1, labelJa: '1時間前', labelEn: '1 hour before' },
  { value: 2, labelJa: '2時間前', labelEn: '2 hours before' },
  { value: 3, labelJa: '3時間前', labelEn: '3 hours before' },
  { value: 4, labelJa: '4時間前', labelEn: '4 hours before' },
  { value: 5, labelJa: '5時間前', labelEn: '5 hours before' },
  { value: 6, labelJa: '6時間前', labelEn: '6 hours before' },
  { value: 8, labelJa: '8時間前', labelEn: '8 hours before' },
  { value: 10, labelJa: '10時間前', labelEn: '10 hours before' },
  { value: 12, labelJa: '12時間前', labelEn: '12 hours before' },
  { value: 24, labelJa: '24時間前（1日前）', labelEn: '24 hours before (1 day)' },
  { value: 36, labelJa: '36時間前', labelEn: '36 hours before' },
  { value: 48, labelJa: '48時間前（2日前）', labelEn: '48 hours before (2 days)' },
  { value: 72, labelJa: '72時間前（3日前）', labelEn: '72 hours before (3 days)' },
];

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
    const value = String(raw)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_EVENT_ITEM_LENGTH);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
    if (next.length >= MAX_EVENT_ITEMS) break;
  }
  return next;
}

export function parseEventItemDraft(draft: string): string[] {
  return draft
    .split(/[,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isChoiceType(type: PreQuestionType) {
  return type === 'single' || type === 'multi';
}

export function sanitizePreQuestions(
  questions: Array<PreQuestion & { preset?: boolean }> | undefined,
): PreQuestion[] {
  if (!questions?.length) return [];
  return questions
    .map((question) => {
      const title = String(question.title || '').trim();
      const options = isChoiceType(question.type)
        ? question.options.map((option) => option.trim()).filter(Boolean)
        : [];
      return {
        id: question.id,
        title,
        type: question.type,
        required: question.required !== false,
        enabled: question.enabled ?? true,
        options,
      };
    })
    .filter((question) => question.enabled && question.title.length > 0)
    .slice(0, MAX_PRE_QUESTIONS);
}

export function createEmptyQuestion(): PreQuestion {
  return {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    type: 'text',
    required: true,
    enabled: true,
    options: ['', ''],
  };
}

function isFeeOrPolicyNoiseLine(line: string) {
  const t = line.trim();
  if (!t) return false;
  if (/^参加費(\s|$|[:：]|無料|[¥￥0-9])/.test(t)) return true;
  if (/^キャンセルポリシー/.test(t)) return true;
  if (/参加費\s*[¥￥]/.test(t) && t.length < 80) return true;
  return false;
}

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

export function deriveEventVibe(description: string, title?: string): string {
  const cleaned = sanitizeEventContentText(description);
  const first = cleaned
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (first) return first.slice(0, 80);
  return String(title || '').trim().slice(0, 40) || 'イベント';
}

export function sortEventSessions(sessions: EventSession[]): EventSession[] {
  return [...sessions].sort((a, b) =>
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
  );
}

export function occurrencesFromCreatePayload(
  payload: CreateEventPayload,
): EventSession[] {
  if (
    payload.scheduleType === 'recurring' &&
    Array.isArray(payload.sessions) &&
    payload.sessions.length > 0
  ) {
    return sortEventSessions(payload.sessions);
  }
  return [
    {
      date: payload.date,
      time: payload.time,
      endDate: payload.endDate,
      endTime: payload.endTime,
    },
  ];
}

function encodeDeadlineOffset(offset: RegistrationDeadlineOffset | undefined) {
  if (offset === 'end') return 'end';
  if (typeof offset === 'number' && Number.isFinite(offset)) {
    return String(offset);
  }
  return '0';
}

export function buildEventInsertRow(input: {
  hostId: string;
  payload: CreateEventPayload;
  organizer: WebOrganizerProfile;
  occurrence?: EventSession;
  seriesId?: string | null;
  sourceLang?: 'ja' | 'en';
}): Record<string, unknown> {
  const { hostId, payload, organizer } = input;
  const displayName = organizer.name.trim() || '主催者';
  const capacity = Math.max(1, Math.floor(payload.capacity) || 1);
  const priceYen = Math.max(0, Math.floor(payload.priceYen) || 0);
  const imageUris = (
    payload.imageUris[0]
      ? payload.imageUris
      : payload.imageUri
        ? [payload.imageUri]
        : []
  )
    .map((uri) => uri.trim())
    .filter(Boolean)
    .slice(0, MAX_EVENT_PHOTOS);
  const imageUri = imageUris[0] ?? payload.imageUri ?? '';
  const snsLinks = sanitizeSnsLinks(organizer.snsLinks);
  const occurrence =
    input.occurrence ??
    ({
      date: payload.date,
      time: payload.time,
      endDate: payload.endDate,
      endTime: payload.endTime,
    } satisfies EventSession);

  const title = payload.title.trim().slice(0, 80);
  const description = sanitizeEventContentText(payload.description);
  const sourceLang = input.sourceLang === 'en' ? 'en' : 'ja';

  return {
    host_id: hostId,
    title,
    sport: payload.sport,
    emoji: payload.emoji,
    location: payload.location.trim(),
    location_note: payload.locationNote?.trim() || null,
    event_date: occurrence.date,
    event_time: occurrence.time,
    end_date: occurrence.endDate || null,
    end_time: occurrence.endTime || null,
    schedule_type: 'single',
    sessions: null,
    series_id: input.seriesId?.trim() || null,
    level: payload.level,
    target_age_groups: sanitizeTargetAgeGroups(payload.targetAgeGroups),
    latitude: payload.latitude,
    longitude: payload.longitude,
    capacity,
    joined_count: 1,
    host_name: displayName,
    host_image_uri: organizer.imageUri?.trim() || null,
    host_sns_links: snsLinks,
    vibe: deriveEventVibe(description, title),
    description,
    source_lang: sourceLang,
    title_ja: sourceLang === 'ja' ? title : null,
    title_en: sourceLang === 'en' ? title : null,
    description_ja: sourceLang === 'ja' ? description || null : null,
    description_en: sourceLang === 'en' ? description || null : null,
    translated_at: null,
    image_uri: imageUri,
    image_uris: imageUris,
    accent: theme.colors.primary,
    registration_deadline_offset: encodeDeadlineOffset(
      payload.registrationDeadlineOffset ?? 0,
    ),
    waitlist_enabled: false,
    waitlist_count: 0,
    enable_pre_questions:
      Boolean(payload.enablePreQuestions) &&
      sanitizePreQuestions(payload.preQuestions ?? []).length > 0,
    pre_questions:
      payload.enablePreQuestions && payload.preQuestions
        ? sanitizePreQuestions(payload.preQuestions)
        : null,
    items_to_bring: sanitizeEventItems(payload.itemsToBring),
    included_items: sanitizeEventItems(payload.includedItems),
    price_yen: priceYen,
    cancel_policy:
      priceYen > 0
        ? payload.cancelPolicy?.trim() || DEFAULT_CANCEL_POLICY
        : null,
  };
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
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const next = new Date(y || 1970, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  next.setMinutes(next.getMinutes() + minutes);
  return {
    date: formatDateStamp(next),
    time: formatTimeStamp(next),
  };
}

/** アプリ版と同じく 5 分刻みに切り上げたデフォルト日程 */
export function defaultEventSchedule(from = new Date()) {
  const stepMs = 5 * 60 * 1000;
  const start = new Date(Math.ceil(from.getTime() / stepMs) * stepMs);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    date: formatDateStamp(start),
    time: formatTimeStamp(start),
    endDate: formatDateStamp(end),
    endTime: formatTimeStamp(end),
  };
}

export function defaultSessionForDate(date: string): EventSession {
  const fallback = defaultEventSchedule();
  const end = addMinutesToEventTime(date, fallback.time, 120);
  const sameDay = end.date === date;
  return {
    date,
    time: fallback.time,
    endDate: sameDay ? end.date : date,
    endTime: sameDay ? end.time : '23:55',
  };
}

/** 一覧表示用（例: 10/15 (木) 12:35-14:35） */
export function formatSessionRowLabel(
  session: EventSession,
  locale: 'ja' | 'en' = 'ja',
) {
  const [y, m, d] = session.date.split('-').map(Number);
  const dt = new Date(y || 1970, (m || 1) - 1, d || 1);
  const weekday =
    locale === 'en'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()]
      : ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
  const datePart = `${m}/${d}${locale === 'en' ? ` ${weekday}` : ` (${weekday})`}`;
  if (!session.endTime) return `${datePart} ${session.time}`;
  if (session.endDate && session.endDate !== session.date) {
    const [, em, ed] = session.endDate.split('-').map(Number);
    return `${datePart} ${session.time}-${em}/${ed} ${session.endTime}`;
  }
  return `${datePart} ${session.time}-${session.endTime}`;
}

export function sportEmojiForLabel(label: string) {
  const found = SPORT_OPTIONS.find((item) => item.label === label);
  return found?.emoji ?? '🏅';
}
