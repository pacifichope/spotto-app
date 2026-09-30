export const CHECKED_IN_STATUS = 'checked_in' as const;

export type CheckInStatus = typeof CHECKED_IN_STATUS;

export type CheckInRecord = {
  attendeeId: string;
  status: CheckInStatus;
  checkedInAt: number;
};

export type CheckInsByEvent = Record<string, CheckInRecord[]>;

const STORAGE_KEY = '@spotto/event-checkins';

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

function parseRecords(raw: unknown): CheckInRecord[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const records: CheckInRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const attendeeId =
      typeof row.attendeeId === 'string' ? row.attendeeId.trim() : '';
    if (!attendeeId || seen.has(attendeeId)) continue;
    seen.add(attendeeId);
    records.push({
      attendeeId,
      status: CHECKED_IN_STATUS,
      checkedInAt:
        typeof row.checkedInAt === 'number' && Number.isFinite(row.checkedInAt)
          ? row.checkedInAt
          : 0,
    });
  }
  return records;
}

export function parseCheckInsByEvent(raw: unknown): CheckInsByEvent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next: CheckInsByEvent = {};
  for (const [eventId, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = eventId.trim();
    if (!id) continue;
    const records = parseRecords(value);
    if (records.length) next[id] = records;
  }
  return next;
}

export async function loadCheckInsByEvent(): Promise<CheckInsByEvent> {
  const storage = getAsyncStorage();
  if (!storage) return {};
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return parseCheckInsByEvent(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function saveCheckInsByEvent(
  checkIns: CheckInsByEvent,
): Promise<void> {
  const storage = getAsyncStorage();
  await storage?.setItem(STORAGE_KEY, JSON.stringify(checkIns));
}

export function checkInIdSet(records: CheckInRecord[] | undefined): Set<string> {
  return new Set((records ?? []).map((item) => item.attendeeId));
}

export function toggleCheckInRecords(
  checkIns: CheckInsByEvent,
  eventId: string,
  attendeeId: string,
): { next: CheckInsByEvent; checkedIn: boolean } {
  const id = eventId.trim();
  const personId = attendeeId.trim();
  if (!id || !personId) {
    return { next: checkIns, checkedIn: false };
  }
  const current = checkIns[id] ?? [];
  const exists = current.some((item) => item.attendeeId === personId);
  const records = exists
    ? current.filter((item) => item.attendeeId !== personId)
    : [
        ...current,
        {
          attendeeId: personId,
          status: CHECKED_IN_STATUS,
          checkedInAt: Date.now(),
        },
      ];
  const next = { ...checkIns };
  if (records.length === 0) delete next[id];
  else next[id] = records;
  return { next, checkedIn: !exists };
}
