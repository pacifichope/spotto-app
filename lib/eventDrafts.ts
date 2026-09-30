import type { ScheduleType } from '@/components/createEventSheetTypes';
import {
  LEVEL_OPTIONS,
  MAX_EVENT_PHOTOS,
  OTHER_SPORT_LABEL,
  SPORT_OPTIONS,
  sanitizeEventItems,
  sanitizeTargetAgeGroups,
  type EventSession,
  type RegistrationDeadlineOffset,
  type SkillLevel,
} from '@/lib/events';
import type { PreQuestion, PreQuestionType } from '@/lib/preQuestions';
import { stripProfilePresetQuestions } from '@/lib/preQuestions';
import { FALLBACK_COORDS } from '@/lib/userLocation';

const LEGACY_STORAGE_KEY = '@spotto/event-drafts';
const STORAGE_KEY_PREFIX = '@spotto/event-drafts:';
const MAX_DRAFTS = 50;

function storageKeyForUser(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId.trim()}`;
}

export type EventFeeType = 'free' | 'paid';

export type EventDraftSnapshot = {
  title: string;
  sportIndex: number;
  customSport: string;
  level: SkillLevel;
  targetAgeGroups: string[];
  ageCustomDraft: string;
  date: string;
  time: string;
  endDate: string;
  endTime: string;
  location: string;
  locationNote: string;
  latitude: number;
  longitude: number;
  description: string;
  itemsToBring: string[];
  itemsToBringDraft: string;
  includedItems: string[];
  includedItemsDraft: string;
  imageUris: string[];
  imageDraft: string;
  scheduleType: ScheduleType;
  capacity: string;
  priceYen: string;
  feeType: EventFeeType;
  deadlineOffset: RegistrationDeadlineOffset;
  cancelPolicy: string;
  enablePreQuestions: boolean;
  preQuestions: PreQuestion[];
  sessions: EventSession[];
};

export type EventDraft = EventDraftSnapshot & {
  id: string;
  status: 'draft';
  updatedAt: number;
};

type AsyncStorageType =
  typeof import('@react-native-async-storage/async-storage').default;

function getAsyncStorage(): AsyncStorageType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage')
      .default as AsyncStorageType;
  } catch {
    return null;
  }
}

function asString(raw: unknown, fallback = '') {
  return typeof raw === 'string' ? raw : fallback;
}

function asBoolean(raw: unknown, fallback = false) {
  return typeof raw === 'boolean' ? raw : fallback;
}

function asFiniteNumber(raw: unknown, fallback: number) {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

function parseSessions(raw: unknown): EventSession[] {
  if (!Array.isArray(raw)) return [];
  const sessions: EventSession[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const date = asString(record.date).trim();
    const time = asString(record.time).trim();
    if (!date || !time) continue;
    sessions.push({
      date,
      time,
      endDate: asString(record.endDate).trim() || undefined,
      endTime: asString(record.endTime).trim() || undefined,
    });
  }
  return sessions;
}

function parseDeadlineOffset(raw: unknown): RegistrationDeadlineOffset {
  if (raw === 'end') return 'end';
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  return 0;
}

function parseLevel(raw: unknown): SkillLevel {
  return LEVEL_OPTIONS.includes(raw as SkillLevel)
    ? (raw as SkillLevel)
    : '誰でも歓迎';
}

function parsePreQuestions(raw: unknown): PreQuestion[] {
  if (!Array.isArray(raw)) return [];
  const questions: Array<PreQuestion & { preset?: boolean }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = asString(record.id).trim();
    if (!id) continue;
    const type: PreQuestionType =
      record.type === 'single' || record.type === 'multi' || record.type === 'text'
        ? record.type
        : 'text';
    questions.push({
      id,
      title: asString(record.title),
      type,
      required: record.required !== false,
      enabled: record.enabled !== false,
      options: parseStringList(record.options),
      ...(record.preset === true ? { preset: true as const } : {}),
    });
  }
  return stripProfilePresetQuestions(questions);
}

export function sanitizeEventDraftSnapshot(
  raw: Partial<EventDraftSnapshot> | Record<string, unknown>,
): EventDraftSnapshot {
  const record = raw as Record<string, unknown>;
  const sportIndex = Math.min(
    SPORT_OPTIONS.length - 1,
    Math.max(0, Math.floor(asFiniteNumber(record.sportIndex, 0))),
  );
  const feeType: EventFeeType = record.feeType === 'paid' ? 'paid' : 'free';
  const scheduleType: ScheduleType =
    record.scheduleType === 'recurring' ? 'recurring' : 'single';
  const imageUris = parseStringList(record.imageUris)
    .map((uri) => uri.trim())
    .filter(Boolean)
    .slice(0, MAX_EVENT_PHOTOS);

  return {
    title: asString(record.title),
    sportIndex,
    customSport: asString(record.customSport),
    level: parseLevel(record.level),
    targetAgeGroups: sanitizeTargetAgeGroups(parseStringList(record.targetAgeGroups)),
    ageCustomDraft: asString(record.ageCustomDraft),
    date: asString(record.date),
    time: asString(record.time),
    endDate: asString(record.endDate),
    endTime: asString(record.endTime),
    location: asString(record.location),
    locationNote: asString(record.locationNote),
    latitude: asFiniteNumber(record.latitude, FALLBACK_COORDS.latitude),
    longitude: asFiniteNumber(record.longitude, FALLBACK_COORDS.longitude),
    description: asString(record.description),
    itemsToBring: sanitizeEventItems(parseStringList(record.itemsToBring)),
    itemsToBringDraft: asString(record.itemsToBringDraft),
    includedItems: sanitizeEventItems(parseStringList(record.includedItems)),
    includedItemsDraft: asString(record.includedItemsDraft),
    imageUris,
    imageDraft: asString(record.imageDraft),
    scheduleType,
    capacity: asString(record.capacity),
    priceYen: asString(record.priceYen, '0'),
    feeType,
    deadlineOffset: parseDeadlineOffset(record.deadlineOffset),
    cancelPolicy: asString(record.cancelPolicy),
    enablePreQuestions: asBoolean(record.enablePreQuestions),
    preQuestions: parsePreQuestions(record.preQuestions),
    sessions: parseSessions(record.sessions),
  };
}

export function parseEventDrafts(raw: unknown): EventDraft[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const list: EventDraft[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = asString(record.id).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push({
      ...sanitizeEventDraftSnapshot(record),
      id,
      status: 'draft',
      updatedAt: asFiniteNumber(record.updatedAt, 0),
    });
    if (list.length >= MAX_DRAFTS) break;
  }
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadEventDrafts(
  userId: string | null | undefined,
): Promise<EventDraft[]> {
  const uid = String(userId || '').trim();
  if (!uid) return [];

  const storage = getAsyncStorage();
  if (!storage) return [];
  try {
    const key = storageKeyForUser(uid);
    const raw = await storage.getItem(key);
    // 旧グローバルキーはアカウント混在の原因なので破棄（移行しない）
    try {
      await storage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (!raw) return [];
    return parseEventDrafts(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveEventDrafts(
  userId: string | null | undefined,
  drafts: EventDraft[],
): Promise<void> {
  const uid = String(userId || '').trim();
  if (!uid) return;
  const storage = getAsyncStorage();
  if (!storage) return;
  await storage.setItem(
    storageKeyForUser(uid),
    JSON.stringify(drafts.slice(0, MAX_DRAFTS)),
  );
  // 旧キーが残っていたら削除
  try {
    await storage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** 指定ユーザーの下書きを削除（ログアウト時など） */
export async function clearEventDrafts(
  userId: string | null | undefined,
): Promise<void> {
  const uid = String(userId || '').trim();
  const storage = getAsyncStorage();
  if (!storage) return;
  try {
    if (uid) await storage.removeItem(storageKeyForUser(uid));
    await storage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** レガシー（ユーザー非紐づけ）下書きキーのみ削除 */
export async function clearLegacyEventDrafts(): Promise<void> {
  const storage = getAsyncStorage();
  try {
    await storage?.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function upsertEventDraft(
  drafts: EventDraft[],
  snapshot: EventDraftSnapshot,
  id?: string,
): EventDraft[] {
  const nextId = id?.trim() || `draft-${Date.now()}`;
  const next: EventDraft = {
    ...sanitizeEventDraftSnapshot(snapshot),
    id: nextId,
    status: 'draft',
    updatedAt: Date.now(),
  };
  return [next, ...drafts.filter((draft) => draft.id !== nextId)].slice(
    0,
    MAX_DRAFTS,
  );
}

export function removeEventDraft(drafts: EventDraft[], id: string): EventDraft[] {
  return drafts.filter((draft) => draft.id !== id);
}

export function eventDraftSnapshotOf(draft: EventDraft): EventDraftSnapshot {
  return sanitizeEventDraftSnapshot(draft);
}

export function snapshotsMatch(
  a: EventDraftSnapshot,
  b: EventDraftSnapshot,
): boolean {
  return (
    JSON.stringify(sanitizeEventDraftSnapshot(a)) ===
    JSON.stringify(sanitizeEventDraftSnapshot(b))
  );
}

export function eventDraftHasContent(snapshot: EventDraftSnapshot): boolean {
  const s = sanitizeEventDraftSnapshot(snapshot);
  return (
    s.title.trim().length > 0 ||
    s.description.trim().length > 0 ||
    s.itemsToBring.length > 0 ||
    s.itemsToBringDraft.trim().length > 0 ||
    s.includedItems.length > 0 ||
    s.includedItemsDraft.trim().length > 0 ||
    s.location.trim().length > 0 ||
    s.locationNote.trim().length > 0 ||
    s.imageUris.length > 0 ||
    s.imageDraft.trim().length > 0 ||
    s.capacity.trim().length > 0 ||
    s.priceYen !== '0' ||
    s.feeType !== 'free' ||
    s.sportIndex !== 0 ||
    s.customSport.trim().length > 0 ||
    s.level !== '誰でも歓迎' ||
    s.targetAgeGroups.length > 0 ||
    s.ageCustomDraft.trim().length > 0 ||
    s.scheduleType !== 'single' ||
    s.sessions.length > 0 ||
    s.cancelPolicy !== '' ||
    s.enablePreQuestions ||
    s.preQuestions.length > 0 ||
    s.deadlineOffset !== 0
  );
}

export function formatDraftTitle(draft: EventDraft) {
  return draft.title.trim() || '無題の下書き';
}

export function formatDraftUpdatedAt(updatedAt: number) {
  const date = new Date(updatedAt);
  if (!Number.isFinite(date.getTime())) return '未保存';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes} 更新`;
}

export function formatDraftSportLabel(draft: EventDraft) {
  const sport = SPORT_OPTIONS[draft.sportIndex] ?? SPORT_OPTIONS[0];
  if (sport.label === OTHER_SPORT_LABEL) {
    return draft.customSport.trim() || '種目未設定';
  }
  return sport.label;
}

export function formatDraftMeta(draft: EventDraft) {
  return `${formatDraftSportLabel(draft)} · ${formatDraftUpdatedAt(draft.updatedAt)}`;
}

export function draftSportEmoji(draft: EventDraft) {
  return (SPORT_OPTIONS[draft.sportIndex] ?? SPORT_OPTIONS[0]).emoji;
}
