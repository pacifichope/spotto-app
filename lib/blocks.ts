import { Alert, Platform } from 'react-native';

import i18n from '@/lib/i18n';
import { hostUserIdFromName, type EventAttendee } from '@/lib/attendees';
import type { ChatMessage } from '@/lib/chats';
import { MY_ORGANIZER_ID } from '@/lib/organizerProfile';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type BlockedUser = {
  id: string;
  name: string;
  imageUri?: string;
  blockedAt: number;
};

export type BlockUserInput = {
  id: string;
  name: string;
  imageUri?: string;
};

export type BlocksSnapshot = {
  /** 自分がブロックしているユーザー（プロフィール付き） */
  blockedUsers: BlockedUser[];
  /** 自分をブロックしているユーザー ID */
  blockedMeIds: string[];
};

const STORAGE_KEY = '@spotto/blocked-users';
const STORAGE_BLOCKED_ME_KEY = '@spotto/blocked-me-ids';

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

export function eventHostUserId(event: {
  host?: string | null;
  hostId?: string | null;
}) {
  const hostId = String(event?.hostId || '').trim();
  if (hostId && hostId !== MY_ORGANIZER_ID && hostId !== 'me') {
    return hostId;
  }
  if (hostId === MY_ORGANIZER_ID || hostId === 'me') return MY_ORGANIZER_ID;
  return hostUserIdFromName(event?.host);
}

export function isSelfUserId(id: string) {
  return id === MY_ORGANIZER_ID || id === 'me';
}

export function parseBlockedUsers(raw: unknown): BlockedUser[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const list: BlockedUser[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!id || !name || seen.has(id) || isSelfUserId(id)) continue;
    seen.add(id);
    list.push({
      id,
      name,
      imageUri:
        typeof record.imageUri === 'string' && record.imageUri.trim()
          ? record.imageUri
          : undefined,
      blockedAt:
        typeof record.blockedAt === 'number' && Number.isFinite(record.blockedAt)
          ? record.blockedAt
          : 0,
    });
  }
  return list.sort((a, b) => b.blockedAt - a.blockedAt);
}

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || seen.has(id) || isSelfUserId(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function loadBlockedUsers(): Promise<BlockedUser[]> {
  const storage = getAsyncStorage();
  if (!storage) return [];
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return parseBlockedUsers(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveBlockedUsers(users: BlockedUser[]): Promise<void> {
  const storage = getAsyncStorage();
  await storage?.setItem(STORAGE_KEY, JSON.stringify(users));
}

export async function loadBlockedMeIds(): Promise<string[]> {
  const storage = getAsyncStorage();
  if (!storage) return [];
  try {
    const raw = await storage.getItem(STORAGE_BLOCKED_ME_KEY);
    if (!raw) return [];
    return parseIdList(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveBlockedMeIds(ids: string[]): Promise<void> {
  const storage = getAsyncStorage();
  await storage?.setItem(STORAGE_BLOCKED_ME_KEY, JSON.stringify(ids));
}

export async function loadBlocksSnapshot(): Promise<BlocksSnapshot> {
  const [blockedUsers, blockedMeIds] = await Promise.all([
    loadBlockedUsers(),
    loadBlockedMeIds(),
  ]);
  return { blockedUsers, blockedMeIds };
}

export async function saveBlocksSnapshot(snapshot: BlocksSnapshot) {
  await Promise.all([
    saveBlockedUsers(snapshot.blockedUsers),
    saveBlockedMeIds(snapshot.blockedMeIds),
  ]);
}

/** 非表示にすべきユーザー ID（自分がブロック / 相手が自分をブロック） */
export function hiddenUserIdSet(
  blockedUsers: BlockedUser[],
  blockedMeIds: string[],
) {
  const set = new Set(blockedMeIds);
  for (const user of blockedUsers) set.add(user.id);
  return set;
}

export function blockedIdSet(users: BlockedUser[]) {
  return new Set(users.map((user) => user.id));
}

export function isUserBlocked(
  userId: string | null | undefined,
  hiddenIds: Set<string>,
) {
  if (!userId || isSelfUserId(userId)) return false;
  return hiddenIds.has(userId);
}

export function isEventHostBlocked(
  event: { host: string; hostId?: string },
  hiddenIds: Set<string>,
) {
  return isUserBlocked(eventHostUserId(event), hiddenIds);
}

export function filterBlockedEvents<T extends { host: string; hostId?: string }>(
  events: T[],
  hiddenIds: Set<string>,
) {
  return events.filter((event) => !isEventHostBlocked(event, hiddenIds));
}

export function filterBlockedAttendees(
  attendees: EventAttendee[],
  hiddenIds: Set<string>,
) {
  return attendees.filter(
    (person) => person.self || !isUserBlocked(person.id, hiddenIds),
  );
}

export function visibleChatMessages(
  messages: ChatMessage[],
  hiddenIds: Set<string>,
  fallbackHostId?: string,
) {
  return messages.filter((message) => {
    if (message.role === 'me') return true;
    const senderId =
      message.senderId ??
      (message.role === 'host' ? fallbackHostId : undefined);
    return !isUserBlocked(senderId, hiddenIds);
  });
}

async function currentAuthUserId(): Promise<string | null> {
  try {
    const { getCurrentFirebaseUid } = await import('@/lib/currentUser');
    return getCurrentFirebaseUid();
  } catch {
    return null;
  }
}

/** Supabase からブロック関係を取得（未ログイン / 未設定時は null） */
export async function fetchBlocksFromSupabase(): Promise<BlocksSnapshot | null> {
  if (!isSupabaseConfigured()) return null;
  const client = getSupabaseClient();
  const myId = await currentAuthUserId();
  if (!client || !myId) return null;

  const [{ data: outgoing, error: outError }, { data: incoming, error: inError }] =
    await Promise.all([
      client
        .from('blocks')
        .select('blocked_id, blocked_name, blocked_image_uri, created_at')
        .eq('blocker_id', myId),
      client
        .from('blocks')
        .select('blocker_id')
        .eq('blocked_id', myId),
    ]);

  if (outError || inError) {
    console.warn('[blocks] supabase fetch failed', outError ?? inError);
    return null;
  }

  const blockedUsers = parseBlockedUsers(
    (outgoing ?? []).map((row) => ({
      id: row.blocked_id,
      name: row.blocked_name || row.blocked_id,
      imageUri: row.blocked_image_uri || undefined,
      blockedAt: row.created_at
        ? new Date(row.created_at).getTime()
        : Date.now(),
    })),
  );

  const blockedMeIds = parseIdList(
    (incoming ?? []).map((row) => row.blocker_id),
  );

  return { blockedUsers, blockedMeIds };
}

export async function insertBlockInSupabase(
  input: BlockUserInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: true };
  const client = getSupabaseClient();
  const myId = await currentAuthUserId();
  if (!client || !myId) {
    return { ok: false, error: i18n.t('errors.loginRequired') };
  }

  const blockedId = input.id.trim();
  if (!blockedId || blockedId === myId) {
    return { ok: false, error: 'invalid target' };
  }

  const { error } = await client.from('blocks').upsert(
    {
      blocker_id: myId,
      blocked_id: blockedId,
      blocked_name: input.name.trim() || null,
      blocked_image_uri: input.imageUri?.trim() || null,
    },
    { onConflict: 'blocker_id,blocked_id' },
  );

  if (error) {
    console.warn('[blocks] supabase insert failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteBlockInSupabase(
  blockedId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: true };
  const client = getSupabaseClient();
  const myId = await currentAuthUserId();
  if (!client || !myId) {
    return { ok: false, error: i18n.t('errors.loginRequired') };
  }

  const { error } = await client
    .from('blocks')
    .delete()
    .eq('blocker_id', myId)
    .eq('blocked_id', blockedId.trim());

  if (error) {
    console.warn('[blocks] supabase delete failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function confirmBlockUser(name: string, onConfirm: () => void) {
  const title = i18n.t('safety.blockTitle', { name });
  const message = i18n.t('safety.blockMessage');
  if (Platform.OS === 'web') {
    if (
      typeof window !== 'undefined' &&
      window.confirm(`${title}\n\n${message}`)
    ) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: i18n.t('safety.cancel'), style: 'cancel' },
    {
      text: i18n.t('safety.blockConfirm'),
      style: 'destructive',
      onPress: onConfirm,
    },
  ]);
}

export function confirmUnblockUser(name: string, onConfirm: () => void) {
  const title = i18n.t('safety.unblockTitle', { name });
  const message = i18n.t('safety.unblockMessage');
  if (Platform.OS === 'web') {
    if (
      typeof window !== 'undefined' &&
      window.confirm(`${title}\n\n${message}`)
    ) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: i18n.t('safety.cancel'), style: 'cancel' },
    { text: i18n.t('safety.unblockConfirm'), onPress: onConfirm },
  ]);
}
