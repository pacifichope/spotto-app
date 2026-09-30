import Constants from 'expo-constants';
import { Linking } from 'react-native';
import { router } from 'expo-router';

export type LegalDocumentId = 'terms' | 'privacy' | 'tokushoho';

/** 公開 Web 上の利用規約・プライバシーポリシー・特商法表記 */
export const LEGAL_EXTERNAL_URLS = {
  terms: 'https://spotto.fun/terms',
  privacy: 'https://spotto.fun/privacy',
  tokushoho: 'https://spotto.fun/tokushoho',
} as const;

/** 旧 /settings/[section] ディープリンク用 */
export const SETTINGS_SECTIONS = [
  'blocklist',
  'terms',
  'privacy',
  'tokushoho',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function parseSettingsSection(value: unknown): SettingsSection | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return SETTINGS_SECTIONS.includes(raw as SettingsSection)
    ? (raw as SettingsSection)
    : null;
}

export const APP_DISPLAY_NAME = 'spotto';

export function getAppVersion() {
  return Constants.expoConfig?.version ?? '1.0.0';
}

export function legalDocumentPath(document: LegalDocumentId) {
  if (document === 'terms') return '/settings/terms';
  if (document === 'privacy') return '/settings/privacy';
  return '/settings/tokushoho';
}

/** 外部ブラウザで開く URL */
export function legalDocumentUrl(document: LegalDocumentId): string | null {
  if (document === 'terms') return LEGAL_EXTERNAL_URLS.terms;
  if (document === 'privacy') return LEGAL_EXTERNAL_URLS.privacy;
  if (document === 'tokushoho') return LEGAL_EXTERNAL_URLS.tokushoho;
  return null;
}

/**
 * 利用規約 / プライバシー / 特商法表記は外部ブラウザで開く。
 */
export async function openLegalDocument(document: LegalDocumentId) {
  const externalUrl = legalDocumentUrl(document);
  if (externalUrl) {
    try {
      await Linking.openURL(externalUrl);
      return true;
    } catch {
      return false;
    }
  }
  router.push(legalDocumentPath(document));
  return true;
}

export type LegalArticle = {
  heading: string;
  paragraphs: string[];
};

/** @deprecated 互換のため型のみ残置 */
export type SettingsSectionCopy = {
  title: string;
  kind: 'plain' | 'legal';
  body?: string;
  updatedAt?: string;
  intro?: string;
  articles?: LegalArticle[];
};
