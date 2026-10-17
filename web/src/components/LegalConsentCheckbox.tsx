'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useT } from '@/lib/i18n/locale-context';
import { LEGAL_COPY, type LegalDocId } from '@/lib/legalCopy';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
};

const linkStyle = {
  color: '#0E9BB0',
  textDecoration: 'underline',
  textDecorationColor: '#12B8D0',
  textUnderlineOffset: '3px',
} as const;

function LegalDocModal({
  doc,
  onClose,
}: {
  doc: LegalDocId;
  onClose: () => void;
}) {
  const t = useT();
  const copy = LEGAL_COPY[doc];
  const title = doc === 'terms' ? t('auth.terms') : t('auth.privacy');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const prev = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-[#0B1A22]/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="legal-doc-title"
        className="relative z-10 flex max-h-[min(88dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_24px_64px_rgba(11,26,34,0.28)] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E4EBEE] px-4 py-3">
          <h2
            id="legal-doc-title"
            className="text-base font-extrabold text-[#12202A]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-[#5B6B75] hover:bg-[#F4F7F8]"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-sm font-bold leading-6 text-[#5B6B75]">{copy.intro}</p>
          {copy.sections.map((section) => (
            <section key={section.id}>
              <h3 className="text-sm font-extrabold text-[#12202A]">
                {section.title}
              </h3>
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="mt-1.5 text-sm font-medium leading-6 text-[#12202A]"
                >
                  {paragraph}
                </p>
              ))}
              {section.bullets?.length ? (
                <ul className="mt-2 space-y-1.5 pl-4 text-sm font-medium leading-6 text-[#12202A]">
                  {section.bullets.map((item) => (
                    <li key={item} className="list-disc">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
        <div className="shrink-0 border-t border-[#E4EBEE] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-full items-center justify-center rounded-full bg-[#12202A] text-sm font-extrabold text-white"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 利用規約・プライバシーポリシーへの同意チェック */
export function LegalConsentCheckbox({
  checked,
  onChange,
  disabled = false,
  id = 'legal-consent',
}: Props) {
  const t = useT();
  const [openDoc, setOpenDoc] = useState<LegalDocId | null>(null);

  function openDocument(document: LegalDocId) {
    setOpenDoc(document);
  }

  return (
    <>
      <div className="flex items-start gap-2.5 text-left text-[13px] font-bold leading-5 text-[#12202A]">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#12B8D0] disabled:opacity-50"
          aria-label={t('auth.agreeA11y')}
        />
        <p>
          <label htmlFor={id}>{t('auth.agreeLead')}</label>
          <button
            type="button"
            className="font-extrabold"
            style={linkStyle}
            onClick={() => openDocument('terms')}
          >
            {t('auth.terms')}
          </button>
          <label htmlFor={id}>{t('auth.agreeAnd')}</label>
          <button
            type="button"
            className="font-extrabold"
            style={linkStyle}
            onClick={() => openDocument('privacy')}
          >
            {t('auth.privacy')}
          </button>
          <label htmlFor={id}>{t('auth.agreeTail')}</label>
        </p>
      </div>
      {openDoc ? (
        <LegalDocModal doc={openDoc} onClose={() => setOpenDoc(null)} />
      ) : null}
    </>
  );
}
