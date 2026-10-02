import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getCurrentAppLanguage,
  setAppLanguage,
} from '@/lib/i18n';
import {
  APP_LANGUAGES,
  type AppLanguage,
} from '@/lib/languagePreference';

export function useAppLanguage() {
  const { i18n, t } = useTranslation();
  const language = getCurrentAppLanguage();

  const changeLanguage = useCallback(async (next: AppLanguage) => {
    await setAppLanguage(next);
  }, []);

  return {
    language,
    // i18n.language 変更で再レンダーさせるための依存
    languageTag: i18n.language,
    supportedLanguages: APP_LANGUAGES,
    changeLanguage,
    t,
  };
}
