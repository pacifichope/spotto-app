import { cookies } from 'next/headers';

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  LOCALES,
  type Locale,
} from '@/lib/i18n/dictionaries';
import { translate, type TranslateParams } from '@/lib/i18n/translate';

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as string[]).includes(value);
}

export async function getRequestLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const raw = store.get(LOCALE_STORAGE_KEY)?.value;
    if (isLocale(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export async function getServerT() {
  const locale = await getRequestLocale();
  return (key: string, params?: TranslateParams) =>
    translate(locale, key, params);
}
