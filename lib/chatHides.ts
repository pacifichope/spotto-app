const STORAGE_KEY_PREFIX = '@spotto/chat-hides';
const LEGACY_STORAGE_KEY = '@spotto/chat-hides';

/** threadId → hidden_at（ms） */
export type ChatHides = Record<string, number>;

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

export function parseChatHides(raw: unknown): ChatHides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next: ChatHides = {};
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

export async function loadChatHides(
  userId?: string | null,
): Promise<ChatHides> {
  const storage = getAsyncStorage();
  if (!storage) return {};
  try {
    const key = storageKeyForUser(userId);
    const raw = await storage.getItem(key);
    if (raw) return parseChatHides(JSON.parse(raw));

    if (userId?.trim()) {
      const legacy = await storage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsed = parseChatHides(JSON.parse(legacy));
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

export async function saveChatHides(
  hides: ChatHides,
  userId?: string | null,
): Promise<void> {
  const storage = getAsyncStorage();
  await storage?.setItem(storageKeyForUser(userId), JSON.stringify(hides));
}
