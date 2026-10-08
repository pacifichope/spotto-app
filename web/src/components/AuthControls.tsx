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

const loginButtonClass =
  'flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold disabled:opacity-60';

/**
 * ヘッダー右のアカウント導線。
 * 未ログイン時は Google を自動起動せず、/mypage のプロバイダ選択へ誘導する。
 */
export function HeaderAccountButton() {
  const { ready } = useAuth();
  const pathname = usePathname();

  if (!ready) {
    return (
      <span className="rounded-full px-3 py-2 text-xs font-bold text-[#8A9199]">…</span>
    );
  }

  // 未ログインでも Google 等を自動起動せず、/mypage のプロバイダ選択へ進む
  return (
    <Link
      href="/mypage"
      className={`brand-gradient rounded-full px-4 py-2 text-sm font-extrabold ${
        pathname.startsWith('/mypage') ? 'ring-2 ring-[#12B8D0]/40' : ''
      }`}
    >
      マイページ
    </Link>
  );
}

export function HeaderGuestHint() {
  const { user, ready } = useAuth();
  if (!ready || user) return null;
  return (
    <p className="hidden text-xs font-bold text-[#5B6B75] lg:block">
      未ログインです。参加や予約の確認は
      <Link href="/mypage" className="mx-1 font-extrabold text-[#12B8D0] underline">
        マイページ
      </Link>
      からログインしてください。
    </p>
  );
}

export function LoginPromptCard({
  title = 'ログインが必要です',
  body = '参加予定やプロフィールを確認するには、Google・Apple・LINE のいずれかでログインしてください。',
}: {
  title?: string;
  body?: string;
}) {
  const { busy, error, configured, signInGoogle, signInApple, signInLine } = useAuth();
  const [lineCallbackHint, setLineCallbackHint] = useState('');
  useEffect(() => {
    setLineCallbackHint(`${window.location.origin.replace(/\/+$/, '')}/auth/line/callback`);
  }, []);

  return (
    <section className="card-shadow mt-4 px-5 py-8">
      <p className="text-base font-extrabold tracking-tight">{title}</p>
      <p className="mt-2 text-sm font-bold leading-6 text-[#5B6B75]">{body}</p>
      <div className="mt-5 flex max-w-md flex-col gap-3">
        <button
          type="button"
          disabled={busy || !configured}
          onClick={() => void signInGoogle()}
          className={`${loginButtonClass} bg-white text-[#12202A] shadow-sm ring-1 ring-[#E4EBEE]`}
        >
          <GoogleGMark size={20} />
          <span>{busy ? '処理中…' : 'Googleでログイン'}</span>
        </button>
        <button
          type="button"
          disabled={busy || !configured}
          onClick={() => void signInApple()}
          className={`${loginButtonClass} bg-[#111111] text-white`}
        >
          <AppleLogoMark size={18} color="#FFFFFF" />
          <span>{busy ? '処理中…' : 'Appleでサインイン'}</span>
        </button>
        <button
          type="button"
          disabled={busy || !configured}
          onClick={() => void signInLine()}
          className={`${loginButtonClass} bg-[#06C755] text-white`}
        >
          <LineSpeechMark size={22} color="#FFFFFF" />
          <span>{busy ? '処理中…' : 'LINEでログイン'}</span>
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
