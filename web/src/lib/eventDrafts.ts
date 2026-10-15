/** Web 版イベント下書き（localStorage。アプリ版 AsyncStorage と同等の用途） */

import {
  defaultEventSchedule,
  LEVEL_OPTIONS,
  SPORT_OPTIONS,
  type CreateEventPayload,
  type EventSession,
  type FeeType,
  type PreQuestion,
  type RegistrationDeadlineOffset,
  type ScheduleType,
  type SkillLevel,
} from '@/lib/createEventModel';

export type WebEventDraft = {
  id: string;
  title: string;
  sport: string;
  customSport: string;
  emoji: string;
  level: SkillLevel;
  date: string;
  time: string;
  endDate: string;
  endTime: string;
  scheduleType: ScheduleType;
  sessions: EventSession[];
  location: string;
  locationNote: string;
  latitude: number;
  longitude: number;
  description: string;
  capacity: number;
  feeType: FeeType;
  priceYen: number;
  cancelPolicy: string;
  registrationDeadlineOffset: RegistrationDeadlineOffset;
  enablePreQuestions: boolean;
  preQuestions: PreQuestion[];
  itemsToBring: string[];
  includedItems: string[];
  targetAgeGroups: string[];
  imageUris: string[];
  /** @deprecated imageUris[0] を使う */
  imageUri?: string;
  updatedAt: number;
};

const PREFIX = 'spotto:event-drafts:';

function key(userId: string) {
  return `${PREFIX}${userId.trim()}`;
}

function normalizeDraft(raw: Record<string, unknown>): WebEventDraft | null {
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const schedule = defaultEventSchedule();
  const imageUris = Array.isArray(raw.imageUris)
    ? raw.imageUris.filter((uri): uri is string => typeof uri === 'string' && !!uri.trim())
    : typeof raw.imageUri === 'string' && raw.imageUri.trim()
      ? [raw.imageUri.trim()]
      : [];
  const levelRaw = String(raw.level || '');
  const level = (LEVEL_OPTIONS.includes(levelRaw as SkillLevel)
    ? levelRaw
    : '誰でも歓迎') as SkillLevel;
  return {
    id: raw.id,
    title: String(raw.title || ''),
    sport: String(raw.sport || SPORT_OPTIONS[3].label),
    customSport: String(raw.customSport || ''),
    emoji: String(raw.emoji || '🏅'),
    level,
    date: String(raw.date || schedule.date),
    time: String(raw.time || schedule.time),
    endDate: String(raw.endDate || schedule.endDate),
    endTime: String(raw.endTime || schedule.endTime),
    scheduleType: raw.scheduleType === 'recurring' ? 'recurring' : 'single',
    sessions: Array.isArray(raw.sessions)
      ? (raw.sessions as EventSession[])
      : [],
    location: String(raw.location || ''),
    locationNote: String(raw.locationNote || ''),
    latitude: Number(raw.latitude) || 35.6895,
    longitude: Number(raw.longitude) || 139.6917,
    description: String(raw.description || ''),
    capacity: Math.max(1, Math.floor(Number(raw.capacity) || 10)),
    feeType: raw.feeType === 'paid' || Number(raw.priceYen) > 0 ? 'paid' : 'free',
    priceYen: Math.max(0, Math.floor(Number(raw.priceYen) || 0)),
    cancelPolicy: String(raw.cancelPolicy || ''),
    registrationDeadlineOffset:
      raw.registrationDeadlineOffset === 'end'
        ? 'end'
        : Number.isFinite(Number(raw.registrationDeadlineOffset))
          ? Number(raw.registrationDeadlineOffset)
          : 0,
    enablePreQuestions: Boolean(raw.enablePreQuestions),
    preQuestions: Array.isArray(raw.preQuestions)
      ? (raw.preQuestions as PreQuestion[])
      : [],
    itemsToBring: Array.isArray(raw.itemsToBring)
      ? (raw.itemsToBring as string[])
      : [],
    includedItems: Array.isArray(raw.includedItems)
      ? (raw.includedItems as string[])
      : [],
    targetAgeGroups: Array.isArray(raw.targetAgeGroups)
      ? (raw.targetAgeGroups as string[])
      : [],
    imageUris,
    imageUri: imageUris[0],
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export function loadEventDrafts(userId: string): WebEventDraft[] {
  if (typeof window === 'undefined') return [];
  const uid = userId.trim();
  if (!uid) return [];
  try {
    const raw = window.localStorage.getItem(key(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) =>
        item && typeof item === 'object'
          ? normalizeDraft(item as Record<string, unknown>)
          : null,
      )
      .filter((item): item is WebEventDraft => Boolean(item))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveEventDrafts(userId: string, drafts: WebEventDraft[]) {
  if (typeof window === 'undefined') return;
  const uid = userId.trim();
  if (!uid) return;
  window.localStorage.setItem(key(uid), JSON.stringify(drafts.slice(0, 50)));
}

export function upsertEventDraft(userId: string, draft: WebEventDraft): WebEventDraft[] {
  const list = loadEventDrafts(userId);
  const next = [draft, ...list.filter((item) => item.id !== draft.id)].slice(0, 50);
  saveEventDrafts(userId, next);
  return next;
}

export function deleteEventDraft(userId: string, draftId: string): WebEventDraft[] {
  const next = loadEventDrafts(userId).filter((item) => item.id !== draftId);
  saveEventDrafts(userId, next);
  return next;
}

export function createEmptyDraftPartial(): Omit<WebEventDraft, 'id' | 'updatedAt'> {
  const schedule = defaultEventSchedule();
  const sport = SPORT_OPTIONS[3];
  return {
    title: '',
    sport: sport.label,
    customSport: '',
    emoji: sport.emoji,
    level: '誰でも歓迎',
    date: schedule.date,
    time: schedule.time,
    endDate: schedule.endDate,
    endTime: schedule.endTime,
    scheduleType: 'single',
    sessions: [],
    location: '',
    locationNote: '',
    latitude: 35.6895,
    longitude: 139.6917,
    description: '',
    capacity: 10,
    feeType: 'free',
    priceYen: 0,
    cancelPolicy: '',
    registrationDeadlineOffset: 0,
    enablePreQuestions: false,
    preQuestions: [],
    itemsToBring: [],
    includedItems: [],
    targetAgeGroups: [],
    imageUris: [],
    imageUri: undefined,
  };
}

export function draftToPayload(draft: WebEventDraft): CreateEventPayload {
  const imageUris = draft.imageUris.length
    ? draft.imageUris
    : draft.imageUri
      ? [draft.imageUri]
      : [];
  return {
    title: draft.title,
    sport: draft.sport,
    emoji: draft.emoji,
    level: draft.level,
    date: draft.date,
    time: draft.time,
    endDate: draft.endDate,
    endTime: draft.endTime,
    sessions: draft.sessions,
    location: draft.location,
    locationNote: draft.locationNote || undefined,
    description: draft.description,
    imageUri: imageUris[0] || '',
    imageUris,
    capacity: draft.capacity,
    priceYen: draft.feeType === 'paid' ? draft.priceYen : 0,
    cancelPolicy: draft.feeType === 'paid' ? draft.cancelPolicy : '',
    protection: '主催者サポートのみ',
    scheduleType: draft.scheduleType,
    latitude: draft.latitude,
    longitude: draft.longitude,
    registrationDeadlineOffset: draft.registrationDeadlineOffset,
    enablePreQuestions: draft.enablePreQuestions,
    preQuestions: draft.preQuestions,
    itemsToBring: draft.itemsToBring,
    includedItems: draft.includedItems,
    targetAgeGroups: draft.targetAgeGroups,
  };
}
