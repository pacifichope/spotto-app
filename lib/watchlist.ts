const STORAGE_KEY = '@spotto/event-watchlist';

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

export function parseWatchlistEventIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function loadWatchlistEventIds(): Promise<string[]> {
  const storage = getAsyncStorage();
  if (!storage) return [];
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return parseWatchlistEventIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveWatchlistEventIds(ids: string[]): Promise<void> {
  const storage = getAsyncStorage();
  await storage?.setItem(STORAGE_KEY, JSON.stringify(ids));
}
