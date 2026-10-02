import { Linking, Platform } from 'react-native';

import i18n from '@/lib/i18n';

export type SnsKind = 'instagram' | 'x' | 'line' | 'web';

export type SnsLink = {
  id: string;
  kind: SnsKind;
  url: string;
};

export const SNS_KIND_OPTIONS: {
  kind: SnsKind;
  readonly label: string;
  color: string;
}[] = [
  { kind: 'instagram', label: 'Instagram', color: '#E1306C' },
  { kind: 'x', label: 'X', color: '#000000' },
  { kind: 'line', label: 'LINE', color: '#06C755' },
  {
    kind: 'web',
    get label() {
      return i18n.t('organizer.snsWeb');
    },
    color: '#0EA5E9',
  },
];

const LEGACY_SNS_KINDS = new Set(['youtube', 'facebook']);

function asSnsKind(value: unknown): SnsKind | undefined {
  if (typeof value !== 'string') return undefined;
  if (LEGACY_SNS_KINDS.has(value)) return 'web';
  return SNS_KIND_OPTIONS.some((option) => option.kind === value)
    ? (value as SnsKind)
    : undefined;
}

export function snsKindMeta(kind: SnsKind) {
  return (
    SNS_KIND_OPTIONS.find((item) => item.kind === kind) ??
    SNS_KIND_OPTIONS.find((item) => item.kind === 'web') ??
    SNS_KIND_OPTIONS[SNS_KIND_OPTIONS.length - 1]
  );
}

export function createSnsLinkId() {
  return `sns_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeSnsUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[\w.-]+/.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function detectSnsKind(url: string): SnsKind {
  const value = url.toLowerCase();
  if (value.includes('instagram.com') || value.includes('instagr.am')) {
    return 'instagram';
  }
  if (
    value.includes('twitter.com') ||
    value.includes('x.com') ||
    value.includes('t.co/')
  ) {
    return 'x';
  }
  if (value.includes('line.me') || value.includes('lin.ee')) return 'line';
  // YouTube / Facebook は選択肢から外しているため Web 扱い
  return 'web';
}

export function isValidHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 旧 snsUrl 文字列や混在データを配列に正規化 */
export function sanitizeSnsLinks(input: unknown): SnsLink[] {
  const links: SnsLink[] = [];

  const push = (rawUrl: string, kindHint?: SnsKind, id?: string) => {
    const url = normalizeSnsUrl(rawUrl);
    if (!url || !isValidHttpUrl(url)) return;
    if (links.some((item) => item.url === url)) return;
    const kind = kindHint ?? detectSnsKind(url);
    links.push({
      id: id || createSnsLinkId(),
      kind,
      url,
    });
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const url = typeof record.url === 'string' ? record.url : '';
      const kind = asSnsKind(record.kind);
      const id = typeof record.id === 'string' ? record.id : undefined;
      push(url, kind, id);
    }
  } else if (typeof input === 'string' && input.trim()) {
    push(input);
  }

  return links.slice(0, 8);
}

export async function openSnsLink(url: string) {
  const normalized = normalizeSnsUrl(url);
  if (!normalized || !isValidHttpUrl(normalized)) return false;
  try {
    const can = await Linking.canOpenURL(normalized);
    if (!can && Platform.OS !== 'web') return false;
    await Linking.openURL(normalized);
    return true;
  } catch {
    return false;
  }
}
