'use client';

import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';

import { useT } from '@/lib/i18n/locale-context';

function canUseHistoryBack() {
  if (typeof window === 'undefined') return false;
  try {
    if (
      document.referrer &&
      new URL(document.referrer).origin === window.location.origin
    ) {
      return true;
    }
  } catch {
    // ignore invalid referrer
  }
  return window.history.length > 1;
}

/** 履歴があれば戻り、なければ fallback へ遷移する */
export function navigateBack(
  router: { back: () => void; push: (href: string) => void },
  fallbackHref: string,
) {
  if (canUseHistoryBack()) {
    router.back();
    return;
  }
  router.push(fallbackHref);
}

type BackButtonProps = {
  /** 履歴が使えないときの遷移先 */
  fallbackHref: string;
  /** 文言。未指定時は「← 戻る」 */
  label?: ReactNode;
  /** text: ヘッダー付近 / overlay: カバー画像左上の円形アイコン */
  variant?: 'text' | 'overlay';
  className?: string;
  /** overlay 時の aria-label（未指定時は common.back） */
  'aria-label'?: string;
};

export function BackButton({
  fallbackHref,
  label,
  variant = 'text',
  className = '',
  'aria-label': ariaLabel,
}: BackButtonProps) {
  const router = useRouter();
  const t = useT();
  const resolvedLabel =
    label ?? (
      <>
        <span aria-hidden>←</span>
        {t('common.back')}
      </>
    );

  const onClick = useCallback(() => {
    navigateBack(router, fallbackHref);
  }, [router, fallbackHref]);

  if (variant === 'overlay') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? t('common.back')}
        className={`absolute left-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white shadow-sm backdrop-blur-sm transition hover:bg-black/55 ${className}`.trim()}
      >
        <ChevronLeft size={22} strokeWidth={2.6} aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? t('common.back')}
      className={`inline-flex items-center gap-1.5 text-sm font-extrabold text-[#12B8D0] transition-colors hover:text-[#0E9BB0] ${className}`.trim()}
    >
      {resolvedLabel}
    </button>
  );
}
