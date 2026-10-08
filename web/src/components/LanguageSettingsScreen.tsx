'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import {
  LOCALE_META,
  LOCALES,
  type Locale,
} from '@/lib/i18n/dictionaries';
import { useLocale, useT } from '@/lib/i18n/locale-context';

function LanguageSettingsBody() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || searchParams.get('mode') || '';
  const backHref = from
    ? `/settings?from=${encodeURIComponent(from)}`
    : '/settings';

  return (
    <main className="page-main pt-4 md:pt-2">
      <Link href={backHref} className="text-sm font-extrabold text-[#12B8D0]">
        {t('common.backToSettings')}
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">
        {t('settings.languageScreenTitle')}
      </h1>
      <p className="mt-2 text-sm font-bold leading-6 text-[#5B6B75]">
        {t('settings.languageHint')}
      </p>

      <section className="card-shadow mt-5 overflow-hidden">
        {LOCALES.map((item, index) => {
          const selected = locale === item;
          const label =
            item === 'ja'
              ? t('settings.languageJapanese')
              : t('settings.languageEnglish');
          return (
            <button
              key={item}
              type="button"
              aria-pressed={selected}
              onClick={() => setLocale(item as Locale)}
              className={`flex w-full items-center gap-3 px-5 py-4 text-left ${
                index > 0 ? 'border-t border-[#E4EBEE]' : ''
              }`}
            >
              <span className="min-w-0 flex-1 text-sm font-extrabold">
                <span aria-hidden className="mr-2">
                  {LOCALE_META[item].flag}
                </span>
                {label}
              </span>
              <span
                className={`grid h-5 w-5 place-items-center rounded-full ring-2 ${
                  selected
                    ? 'ring-[#12B8D0]'
                    : 'ring-[#D5DEE3]'
                }`}
                aria-hidden
              >
                {selected ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-[#12B8D0]" />
                ) : null}
              </span>
            </button>
          );
        })}
      </section>
    </main>
  );
}

export function LanguageSettingsScreen() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <main className="page-main pt-4 md:pt-2">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {t('settings.languageScreenTitle')}
          </h1>
          <p className="mt-4 text-sm font-bold text-[#8A9199]">{t('common.loading')}</p>
        </main>
      }
    >
      <LanguageSettingsBody />
    </Suspense>
  );
}
