import {
  DEFAULT_LOCALE,
  dictionaries,
  type Locale,
  type MessageTree,
} from '@/lib/i18n/dictionaries';

export type TranslateParams = Record<string, string | number>;

function lookup(tree: MessageTree, key: string): string | undefined {
  const parts = key.split('.');
  let current: string | MessageTree | undefined = tree;
  for (const part of parts) {
    if (!current || typeof current === 'string') return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function formatMessage(template: string, params?: TranslateParams) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value == null ? `{${name}}` : String(value);
  });
}

export function translate(
  locale: Locale,
  key: string,
  params?: TranslateParams,
): string {
  const primary = lookup(dictionaries[locale], key);
  if (primary != null) return formatMessage(primary, params);
  const fallback = lookup(dictionaries[DEFAULT_LOCALE], key);
  if (fallback != null) return formatMessage(fallback, params);
  return key;
}
