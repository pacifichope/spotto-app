'use client';

import { useEffect, useId, useRef, useState } from 'react';

import {
  LOCALE_META,
  LOCALES,
  type Locale,
} from '@/lib/i18n/dictionaries';
import { useLocale } from '@/lib/i18n/locale-context';

type Props = {
  /** header: コンパクト / footer: やや大きめ */
  placement?: 'header' | 'footer';
};

export function LanguageSwitcher({ placement = 'header' }: Props) {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const meta = LOCALE_META[locale];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (next: Locale) => {
    setLocale(next);
    setOpen(false);
  };

  const buttonClass =
    placement === 'footer'
      ? 'inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-xs font-extrabold text-[#12202A] shadow-sm ring-1 ring-[#E4EBEE]'
      : 'inline-flex items-center gap-1.5 rounded-full bg-[#F4F7F8] px-2.5 py-1.5 text-[11px] font-extrabold text-[#5B6B75] transition hover:bg-[#E5F9FC] hover:text-[#12B8D0]';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('common.chooseLanguage')}
        onClick={() => setOpen((value) => !value)}
        className={buttonClass}
      >
        <span aria-hidden>{meta.flag}</span>
        <span>{meta.shortLabel}</span>
      </button>

      {open ? (
        <ul
          id={menuId}
          role="listbox"
          aria-label={t('common.language')}
          className={`absolute z-50 min-w-[10.5rem] overflow-hidden rounded-2xl border border-white/80 bg-white py-1 shadow-[0_16px_40px_rgba(11,26,34,0.18)] ${
            placement === 'footer'
              ? 'bottom-full left-1/2 mb-2 -translate-x-1/2'
              : 'right-0 top-full mt-2'
          }`}
        >
          {LOCALES.map((item) => {
            const option = LOCALE_META[item];
            const selected = item === locale;
            return (
              <li key={item} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => pick(item)}
                  className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-extrabold ${
                    selected
                      ? 'bg-[#E5F9FC] text-[#0284C7]'
                      : 'text-[#12202A] hover:bg-[#F7FBFC]'
                  }`}
                >
                  <span aria-hidden>{option.flag}</span>
                  <span>{option.nativeLabel}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
