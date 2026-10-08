import { messagesEn } from '@/lib/i18n/messages-en';
import { messagesJa } from '@/lib/i18n/messages-ja';
import type { Locale, MessageTree } from '@/lib/i18n/types';

export type { Locale, MessageTree };

export const LOCALES: Locale[] = ['ja', 'en'];

export const LOCALE_META: Record<
  Locale,
  { flag: string; nativeLabel: string; shortLabel: string }
> = {
  ja: { flag: '🇯🇵', nativeLabel: '日本語', shortLabel: '日本語' },
  en: { flag: '🇺🇸', nativeLabel: 'English', shortLabel: 'English' },
};

export const DEFAULT_LOCALE: Locale = 'ja';
export const LOCALE_STORAGE_KEY = 'spotto_web_locale_v1';

export const dictionaries: Record<Locale, MessageTree> = {
  ja: messagesJa,
  en: messagesEn,
};
