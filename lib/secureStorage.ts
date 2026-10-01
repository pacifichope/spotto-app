/**
 * 機密データの永続化。
 * ネイティブでは Expo SecureStore（Keychain / EncryptedSharedPreferences）、
 * Web または SecureStore 未リンク時は AsyncStorage にフォールバック。
 * 旧 AsyncStorage キーからの一度きりの移行も行う。
 *
 * 重要: `require('expo-secure-store')` は未リンク時に
 * `requireNativeModule` で即 throw するため、先に
 * `requireOptionalNativeModule('ExpoSecureStore')` で存在確認する。
 */
import { Platform } from 'react-native';

type AsyncStorageType =
  typeof import('@react-native-async-storage/async-storage').default;

type SecureStoreModule = typeof import('expo-secure-store');

function getAsyncStorage(): AsyncStorageType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage')
      .default as AsyncStorageType;
  } catch {
    return null;
  }
}

/** ネイティブモジュールがバイナリに含まれるか（throw しない） */
function hasExpoSecureStoreNative(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo-modules-core') as {
      requireOptionalNativeModule: (name: string) => unknown;
    };
    return requireOptionalNativeModule('ExpoSecureStore') != null;
  } catch {
    return false;
  }
}

function getSecureStore(): SecureStoreModule | null {
  if (!hasExpoSecureStoreNative()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-secure-store') as SecureStoreModule;
  } catch {
    return null;
  }
}

let secureAvailable: boolean | null = null;

async function canUseSecureStore(): Promise<boolean> {
  if (secureAvailable != null) return secureAvailable;
  const store = getSecureStore();
  if (!store) {
    secureAvailable = false;
    return false;
  }
  try {
    secureAvailable = await store.isAvailableAsync();
  } catch {
    secureAvailable = false;
  }
  return secureAvailable;
}

async function migrateFromAsyncStorage(
  secureKey: string,
  legacyAsyncKeys: string[],
): Promise<string | null> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) return null;

  for (const legacyKey of legacyAsyncKeys) {
    try {
      const raw = await asyncStorage.getItem(legacyKey);
      if (!raw) continue;
      const store = getSecureStore();
      if (store && (await canUseSecureStore())) {
        await store.setItemAsync(secureKey, raw);
        await asyncStorage.removeItem(legacyKey);
      }
      return raw;
    } catch {
      // 次の legacy キーを試す
    }
  }
  return null;
}

/**
 * SecureStore 向けキーは英数字・`.`・`-`・`_` のみ。
 * legacyAsyncKeys: 移行元の AsyncStorage キー（`@spotto/...` など）
 */
export async function getSecureItem(
  secureKey: string,
  legacyAsyncKeys: string[] = [],
): Promise<string | null> {
  try {
    if (await canUseSecureStore()) {
      const store = getSecureStore();
      const fromSecure = await store!.getItemAsync(secureKey);
      if (fromSecure != null) return fromSecure;
      return migrateFromAsyncStorage(secureKey, legacyAsyncKeys);
    }

    const asyncStorage = getAsyncStorage();
    if (!asyncStorage) return null;
    for (const key of [secureKey, ...legacyAsyncKeys]) {
      const raw = await asyncStorage.getItem(key);
      if (raw != null) return raw;
    }
    return null;
  } catch (error) {
    if (__DEV__) {
      console.warn('[secureStorage] get failed', secureKey, error);
    }
    return null;
  }
}

export async function setSecureItem(
  secureKey: string,
  value: string,
  legacyAsyncKeys: string[] = [],
): Promise<void> {
  try {
    if (await canUseSecureStore()) {
      await getSecureStore()!.setItemAsync(secureKey, value);
      const asyncStorage = getAsyncStorage();
      if (asyncStorage && legacyAsyncKeys.length > 0) {
        await Promise.all(
          legacyAsyncKeys.map((key) => asyncStorage.removeItem(key)),
        );
      }
      return;
    }

    const asyncStorage = getAsyncStorage();
    await asyncStorage?.setItem(secureKey, value);
    if (asyncStorage && legacyAsyncKeys.length > 0) {
      await Promise.all(
        legacyAsyncKeys.map((key) => asyncStorage.removeItem(key)),
      );
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[secureStorage] set failed', secureKey, error);
    }
    // SecureStore 容量超過など: AsyncStorage へフォールバック（無暗号化）
    const asyncStorage = getAsyncStorage();
    await asyncStorage?.setItem(secureKey, value);
  }
}

export async function deleteSecureItem(
  secureKey: string,
  legacyAsyncKeys: string[] = [],
): Promise<void> {
  try {
    if (await canUseSecureStore()) {
      await getSecureStore()!.deleteItemAsync(secureKey);
    }
  } catch {
    // ignore
  }
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) return;
  const keys = [secureKey, ...legacyAsyncKeys];
  await Promise.all(keys.map((key) => asyncStorage.removeItem(key)));
}
