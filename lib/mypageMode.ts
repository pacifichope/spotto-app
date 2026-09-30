export type MyPageMode = 'participant' | 'organizer';

const STORAGE_KEY = '@spotto/mypage-mode';

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

export function parseMyPageMode(raw: unknown): MyPageMode {
  return raw === 'organizer' ? 'organizer' : 'participant';
}

export async function loadMyPageMode(): Promise<MyPageMode> {
  const storage = getAsyncStorage();
  if (!storage) return 'participant';
  try {
    return parseMyPageMode(await storage.getItem(STORAGE_KEY));
  } catch {
    return 'participant';
  }
}

export async function saveMyPageMode(mode: MyPageMode): Promise<void> {
  const storage = getAsyncStorage();
  await storage?.setItem(STORAGE_KEY, mode);
}
