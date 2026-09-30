const STORAGE_KEY_PREFIX = '@spotto/chat-reads';
const LEGACY_STORAGE_KEY = '@spotto/chat-reads';

export type ChatReads = Record<string, number>;

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

function storageKeyForUser(userId?: string | null) {
  const id = String(userId || '').trim();
  return id ? `${STORAGE_KEY_PREFIX}:${id}` : LEGACY_STORAGE_KEY;
}

export function parseChatReads(raw: unknown): ChatReads {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next: ChatReads = {};
  for (const [threadId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    const id = threadId.trim();
    if (!id) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    next[id] = value;
  }
  return next;
}

export async function loadChatReads(
  userId?: string | null,
): Promise<ChatReads> {
  const storage = getAsyncStorage();
  if (!storage) return {};
  try {
    const key = storageKeyForUser(userId);
    const raw = await storage.getItem(key);
    if (raw) return parseChatReads(JSON.parse(raw));

    // 旧グローバルキーからの移行（ユーザー指定時のみ）
    if (userId?.trim()) {
      const legacy = await storage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsed = parseChatReads(JSON.parse(legacy));
        if (Object.keys(parsed).length > 0) {
          await storage.setItem(key, JSON.stringify(parsed));
          return parsed;
        }
      }
    }
    return {};
  } catch {
    return {};
  }
}

export async function saveChatReads(
  reads: ChatReads,
  userId?: string | null,
): Promise<void> {
  const storage = getAsyncStorage();
  await storage?.setItem(storageKeyForUser(userId), JSON.stringify(reads));
}
