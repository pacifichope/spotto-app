import AsyncStorage from '@react-native-async-storage/async-storage';

export const APP_LANGUAGES = ['ja', 'en'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

const STORAGE_KEY = '@spotto/app-language';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'ja' || value === 'en';
}

export async function loadLanguagePreference(): Promise<AppLanguage | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return isAppLanguage(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function saveLanguagePreference(language: AppLanguage) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, language);
  } catch {
    // ignore persistence failures; in-memory language still applies
  }
}
