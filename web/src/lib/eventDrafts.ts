/** Web 版イベント下書き（localStorage。アプリ版 AsyncStorage と同等の用途） */

export type WebEventDraft = {
  id: string;
  title: string;
  sport: string;
  level: string;
  date: string;
  time: string;
  endDate: string;
  endTime: string;
  location: string;
  locationNote: string;
  latitude: number;
  longitude: number;
  description: string;
  capacity: number;
  priceYen: number;
  imageUri?: string;
  updatedAt: number;
};

const PREFIX = 'spotto:event-drafts:';

function key(userId: string) {
  return `${PREFIX}${userId.trim()}`;
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
      .filter((item): item is WebEventDraft => !!item && typeof item === 'object' && typeof (item as WebEventDraft).id === 'string')
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
  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    title: '',
    sport: 'ランニング',
    level: '初心者歓迎',
    date: stamp,
    time: '10:00',
    endDate: stamp,
    endTime: '12:00',
    location: '',
    locationNote: '',
    latitude: 35.6895,
    longitude: 139.6917,
    description: '',
    capacity: 10,
    priceYen: 0,
    imageUri: undefined,
  };
}
