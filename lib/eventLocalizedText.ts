import { getCurrentAppLanguage } from '@/lib/i18n';
import type { AppLanguage } from '@/lib/languagePreference';

export type EventLocalizedFields = {
  title: string;
  description: string;
  sourceLang?: 'ja' | 'en';
  titleJa?: string;
  titleEn?: string;
  descriptionJa?: string;
  descriptionEn?: string;
};

function pickLocalized(
  lang: AppLanguage,
  preferred: string | undefined,
  alternate: string | undefined,
  fallback: string,
): string {
  const a = String(preferred || '').trim();
  const b = String(alternate || '').trim();
  const f = String(fallback || '').trim();
  if (lang === 'en') return a || b || f;
  return a || b || f;
}

/** i18n 言語に応じたイベントタイトル */
export function localizedEventTitle(
  event: Pick<EventLocalizedFields, 'title' | 'titleJa' | 'titleEn'>,
  language?: AppLanguage,
): string {
  const lang = language ?? getCurrentAppLanguage();
  if (lang === 'en') {
    return pickLocalized(lang, event.titleEn, event.titleJa, event.title);
  }
  return pickLocalized(lang, event.titleJa, event.titleEn, event.title);
}

/** i18n 言語に応じたイベント説明文 */
export function localizedEventDescription(
  event: Pick<
    EventLocalizedFields,
    'description' | 'descriptionJa' | 'descriptionEn'
  >,
  language?: AppLanguage,
): string {
  const lang = language ?? getCurrentAppLanguage();
  if (lang === 'en') {
    return pickLocalized(
      lang,
      event.descriptionEn,
      event.descriptionJa,
      event.description,
    );
  }
  return pickLocalized(
    lang,
    event.descriptionJa,
    event.descriptionEn,
    event.description,
  );
}
