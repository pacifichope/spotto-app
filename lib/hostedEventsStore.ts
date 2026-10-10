import { MY_ORGANIZER_ID, isHostedByMe } from '@/lib/organizerProfile';
import {
  sanitizeEventItems,
  sanitizeTargetAgeGroups,
  type SkillLevel,
  type SportEvent,
} from '@/lib/events';
import { sanitizePreQuestions } from '@/lib/preQuestions';
import { sanitizeSnsLinks } from '@/lib/snsLinks';

const LEGACY_STORAGE_KEY = '@spotto/hosted-events';
const STORAGE_KEY_PREFIX = '@spotto/hosted-events:';

type AsyncStorageType =
  typeof import('@react-native-async-storage/async-storage').default;

export type HostedEventsSnapshot = {
  events: SportEvent[];
  hostedIds: string[];
};

function getAsyncStorage(): AsyncStorageType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage')
      .default as AsyncStorageType;
  } catch {
    return null;
  }
}

function storageKeyForUser(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId.trim()}`;
}

function asString(raw: unknown, fallback = '') {
  return typeof raw === 'string' ? raw : fallback;
}

function asNumber(raw: unknown, fallback = 0) {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

function asSkillLevel(raw: unknown): SkillLevel {
  if (
    raw === '初心者' ||
    raw === '中級' ||
    raw === '上級' ||
    raw === '誰でも歓迎'
  ) {
    return raw;
  }
  return '誰でも歓迎';
}

export function sanitizeStoredSportEvent(raw: unknown): SportEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = asString(record.id).trim();
  const title = asString(record.title).trim();
  if (!id || !title) return null;

  const latitude = asNumber(record.latitude, NaN);
  const longitude = asNumber(record.longitude, NaN);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const date = asString(record.date).trim();
  const time = asString(record.time).trim();
  if (!date || !time) return null;

  const capacity = Math.max(1, Math.floor(asNumber(record.capacity, 1)));
  const joinedCount = Math.max(
    0,
    Math.min(capacity, Math.floor(asNumber(record.joinedCount, 1))),
  );
  const imageUri = asString(record.imageUri).trim();
  const imageUris = Array.isArray(record.imageUris)
    ? record.imageUris
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : imageUri
      ? [imageUri]
      : [];

  return {
    id,
    title,
    sport: asString(record.sport, 'その他').trim() || 'その他',
    emoji: asString(record.emoji, '🏅').trim() || '🏅',
    location: asString(record.location).trim() || '場所未設定',
    locationNote: asString(record.locationNote).trim() || undefined,
    date,
    time,
    endDate: asString(record.endDate).trim() || undefined,
    endTime: asString(record.endTime).trim() || undefined,
    scheduleType:
      record.scheduleType === 'recurring' ? 'recurring' : 'single',
    sessions: Array.isArray(record.sessions)
      ? (record.sessions as SportEvent['sessions'])
      : undefined,
    seriesId: asString(record.seriesId).trim() || undefined,
    level: asSkillLevel(record.level),
    targetAgeGroups: sanitizeTargetAgeGroups(
      record.targetAgeGroups as string[] | undefined,
    ),
    latitude,
    longitude,
    spotsLeft: Math.max(0, capacity - joinedCount),
    capacity,
    joinedCount,
    host: asString(record.host).trim() || 'マイサークル',
    hostId: asString(record.hostId).trim() || MY_ORGANIZER_ID,
    hostImageUri: asString(record.hostImageUri).trim() || undefined,
    hostSnsUrl: asString(record.hostSnsUrl).trim() || undefined,
    hostSnsLinks: sanitizeSnsLinks(record.hostSnsLinks),
    vibe: asString(record.vibe).trim() || '主催イベント',
    description: asString(record.description),
    imageUri: imageUri || imageUris[0] || '',
    imageUris,
    accent: asString(record.accent).trim() || '#0EA5E9',
    registrationDeadlineOffset:
      record.registrationDeadlineOffset === 'end'
        ? 'end'
        : typeof record.registrationDeadlineOffset === 'number'
          ? record.registrationDeadlineOffset
          : 0,
    waitlistEnabled: false,
    waitlistCount: 0,
    enablePreQuestions: record.enablePreQuestions === true,
    preQuestions:
      record.enablePreQuestions === true
        ? sanitizePreQuestions(record.preQuestions)
        : undefined,
    itemsToBring: sanitizeEventItems(record.itemsToBring as string[] | undefined),
    includedItems: sanitizeEventItems(
      record.includedItems as string[] | undefined,
    ),
    priceYen: Math.max(0, Math.floor(asNumber(record.priceYen, 0))),
    cancelPolicy: asString(record.cancelPolicy).trim() || undefined,
    cancelledAt: asString(record.cancelledAt).trim() || undefined,
    cancelReason: asString(record.cancelReason).trim() || undefined,
  };
}

export function parseHostedEventsSnapshot(raw: unknown): HostedEventsSnapshot {
  if (!raw || typeof raw !== 'object') {
    return { events: [], hostedIds: [] };
  }
  const record = raw as Record<string, unknown>;
  const events: SportEvent[] = [];
  const seen = new Set<string>();
  if (Array.isArray(record.events)) {
    for (const item of record.events) {
      const event = sanitizeStoredSportEvent(item);
      if (!event || seen.has(event.id)) continue;
      seen.add(event.id);
      events.push({
        ...event,
        hostId: event.hostId || MY_ORGANIZER_ID,
      });
    }
  }

  const hostedIds: string[] = [];
  const idSeen = new Set<string>();
  const pushId = (id: string) => {
    if (!id || idSeen.has(id)) return;
    idSeen.add(id);
    hostedIds.push(id);
  };
  if (Array.isArray(record.hostedIds)) {
    for (const item of record.hostedIds) {
      if (typeof item === 'string') pushId(item.trim());
    }
  }
  for (const event of events) pushId(event.id);

  return { events, hostedIds };
}

export async function loadHostedEventsSnapshot(
  userId: string | null | undefined,
): Promise<HostedEventsSnapshot> {
  const uid = String(userId || '').trim();
  if (!uid) return { events: [], hostedIds: [] };

  const storage = getAsyncStorage();
  if (!storage) return { events: [], hostedIds: [] };
  try {
    const key = storageKeyForUser(uid);
    const raw = await storage.getItem(key);
    // 旧グローバルキーはアカウント混在の原因なので破棄（移行しない）
    try {
      await storage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (!raw) return { events: [], hostedIds: [] };
    return parseHostedEventsSnapshot(JSON.parse(raw));
  } catch {
    return { events: [], hostedIds: [] };
  }
}

export async function saveHostedEventsSnapshot(
  userId: string | null | undefined,
  snapshot: HostedEventsSnapshot,
): Promise<void> {
  const uid = String(userId || '').trim();
  if (!uid) return;
  const storage = getAsyncStorage();
  if (!storage) return;
  const payload = parseHostedEventsSnapshot(snapshot);
  await storage.setItem(storageKeyForUser(uid), JSON.stringify(payload));
  try {
    await storage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function clearHostedEventsSnapshot(
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

/** サンプルと保存済み主催イベントを合成（主催側が同一 ID なら上書き） */
export function mergeSampleAndHostedEvents(
  samples: SportEvent[],
  hosted: SportEvent[],
): SportEvent[] {
  const sampleIds = new Set(samples.map((event) => event.id));
  const hostedById = new Map(hosted.map((event) => [event.id, event]));
  const custom = hosted.filter((event) => !sampleIds.has(event.id));
  const mergedSamples = samples.map(
    (event) => hostedById.get(event.id) ?? event,
  );
  return [...custom, ...mergedSamples];
}

export function collectHostedEventsForPersistence(
  events: SportEvent[],
  hostedIds: Set<string>,
): HostedEventsSnapshot {
  const hostedEvents = events.filter((event) =>
    isHostedByMe(event, hostedIds),
  );
  return {
    events: hostedEvents,
    hostedIds: [...hostedIds],
  };
}
