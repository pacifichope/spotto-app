import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/locales/en.json';
import ja from '@/locales/ja.json';
import {
  isAppLanguage,
  loadLanguagePreference,
  saveLanguagePreference,
  type AppLanguage,
} from '@/lib/languagePreference';

/**
 * 端末の優先言語。ja / en 以外は日本語にフォールバック。
 */
export function resolveDeviceLanguage(): AppLanguage {
  const code = String(getLocales()[0]?.languageCode || '')
    .trim()
    .toLowerCase();
  if (code === 'en') return 'en';
  if (code === 'ja') return 'ja';
  return 'ja';
}

const resources = {
  ja: { translation: ja },
  en: { translation: en },
} as const;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: resolveDeviceLanguage(),
    fallbackLng: 'ja',
    compatibilityJSON: 'v4',
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
}

/** 保存済みの手動選択があれば適用（起動時） */
export async function hydrateLanguagePreference() {
  const saved = await loadLanguagePreference();
  if (!saved) return;
  if (i18n.language === saved) return;
  await i18n.changeLanguage(saved);
}

/** ユーザーが設定画面で言語を切り替えたとき */
export async function setAppLanguage(language: AppLanguage) {
  if (!isAppLanguage(language)) return;
  await saveLanguagePreference(language);
  if (i18n.language !== language) {
    await i18n.changeLanguage(language);
  }
}

export function getCurrentAppLanguage(): AppLanguage {
  const raw = String(i18n.resolvedLanguage || i18n.language || 'ja')
    .split('-')[0]
    ?.toLowerCase();
  return isAppLanguage(raw) ? raw : 'ja';
}

export default i18n;
