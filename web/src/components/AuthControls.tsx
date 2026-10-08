'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  AppleLogoMark,
  GoogleGMark,
  LineSpeechMark,
} from '@/components/socialBrandMarks';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n/locale-context';

const loginButtonClass =
  'flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold disabled:opacity-60';

/**
 * ヘッダー右のアカウント導線。
 * ゲスト時は Google を自動起動せず、/mypage のプロバイダ選択へ誘導する。
 */
export function HeaderAccountButton() {
  const { ready } = useAuth();
  const pathname = usePathname();
  const t = useT();

  if (!ready) {
    return (
      <span className="inline-flex shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold text-[#8A9199]">
        …
      </span>
    );
  }

  // ゲストでも Google 等を自動起動せず、/mypage のプロバイダ選択へ進む
  return (
    <Link
      href="/mypage"
      className={`brand-gradient inline-flex shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-extrabold sm:px-4 ${
        pathname.startsWith('/mypage') ? 'ring-2 ring-[#12B8D0]/40' : ''
      }`}
    >
      {t('nav.mypage')}
    </Link>
  );
}

export function LoginPromptCard({
  title,
  body,
}: {
  title?: string;
  body?: string;
}) {
  const { busy, error, configured, signInGoogle, signInApple, signInLine } = useAuth();
  const t = useT();
  const [lineCallbackHint, setLineCallbackHint] = useState('');
  useEffect(() => {
    setLineCallbackHint(`${window.location.origin.replace(/\/+$/, '')}/auth/line/callback`);
  }, []);

  const resolvedTitle = title ?? t('auth.loginRequiredTitle');
  const resolvedBody = body ?? t('auth.loginRequiredBody');

  return (
    <section className="card-shadow mt-4 px-5 py-8">
      <p className="text-base font-extrabold tracking-tight">{resolvedTitle}</p>
      <p className="mt-2 text-sm font-bold leading-6 text-[#5B6B75]">{resolvedBody}</p>
      <div className="mt-5 flex max-w-md flex-col gap-3">
        <button
          type="button"
          disabled={busy || !configured}
          onClick={() => void signInGoogle()}
          className={`${loginButtonClass} bg-white text-[#12202A] shadow-sm ring-1 ring-[#E4EBEE]`}
        >
          <GoogleGMark size={20} />
          <span>{busy ? t('common.processing') : t('auth.google')}</span>
        </button>
        <button
          type="button"
          disabled={busy || !configured}
          onClick={() => void signInApple()}
          className={`${loginButtonClass} bg-[#111111] text-white`}
        >
          <AppleLogoMark size={18} color="#FFFFFF" />
          <span>{busy ? t('common.processing') : t('auth.apple')}</span>
        </button>
        <button
          type="button"
          disabled={busy || !configured}
          onClick={() => void signInLine()}
          className={`${loginButtonClass} bg-[#06C755] text-white`}
        >
          <LineSpeechMark size={22} color="#FFFFFF" />
          <span>{busy ? t('common.processing') : t('auth.line')}</span>
        </button>
      </div>
      {lineCallbackHint ? (
        <p className="mt-3 text-[11px] font-bold leading-5 text-[#8A9199]">
          LINE Callback（LINE Developers に登録）: {lineCallbackHint}
          <br />
          ※ Supabase の /auth/v1/callback ではありません
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm font-bold text-[#EF4444]">{error}</p> : null}
    </section>
  );
}
