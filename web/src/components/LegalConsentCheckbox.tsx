'use client';

import { LEGAL_EXTERNAL_URLS } from '@/lib/legal';
import { useT } from '@/lib/i18n/locale-context';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
};

function LegalDocLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-extrabold text-[#12B8D0] underline underline-offset-2"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
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

  return (
    <label
      htmlFor={id}
      className="flex items-start gap-2.5 text-left text-[13px] font-bold leading-5 text-[#12202A]"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#12B8D0] disabled:opacity-50"
        aria-label={t('auth.agreeA11y')}
      />
      <span>
        {t('auth.agreeLead')}
        <LegalDocLink href={LEGAL_EXTERNAL_URLS.terms}>
          {t('auth.terms')}
        </LegalDocLink>
        {t('auth.agreeAnd')}
        <LegalDocLink href={LEGAL_EXTERNAL_URLS.privacy}>
          {t('auth.privacy')}
        </LegalDocLink>
        {t('auth.agreeTail')}
      </span>
    </label>
  );
}
