'use client';

import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';

import { useT } from '@/lib/i18n/locale-context';

/**
 * 履歴スタックには依存せず、指定の href へ必ず遷移する。
 * （深いリンク直開きや決済↔詳細のループを避ける）
 */
export function navigateBack(
  router: { push: (href: string) => void; replace?: (href: string) => void },
  href: string,
  options?: { replace?: boolean },
) {
  if (options?.replace && typeof router.replace === 'function') {
    router.replace(href);
    return;
  }
  router.push(href);
}

type BackButtonProps = {
  /** 戻るボタン押下時の遷移先（必須・履歴非依存） */
  fallbackHref: string;
  /** 文言。未指定時は「← 戻る」 */
  label?: ReactNode;
  /** text: ヘッダー付近 / overlay: カバー画像左上の円形アイコン */
  variant?: 'text' | 'overlay';
  className?: string;
  /** overlay 時の aria-label（未指定時は common.back） */
  'aria-label'?: string;
  /** true のとき push ではなく replace（例: 決済後の戻り） */
  replace?: boolean;
};

export function BackButton({
  fallbackHref,
  label,
  variant = 'text',
  className = '',
  'aria-label': ariaLabel,
  replace = false,
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
    navigateBack(router, fallbackHref, { replace });
  }, [router, fallbackHref, replace]);

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
