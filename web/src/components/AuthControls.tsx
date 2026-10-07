'use client';

import Link from 'next/link';

import { useAuth } from '@/lib/auth-context';

const loginButtonClass =
  'flex h-12 w-full items-center justify-center rounded-full text-sm font-extrabold disabled:opacity-60';

export function HeaderAuthButton() {
  const { user, ready, busy, signInGoogle, signOut } = useAuth();

  if (!ready) {
    return (
      <span className="rounded-full px-3 py-2 text-xs font-bold text-[#8A9199]">…</span>
    );
  }

  if (user) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void signOut()}
        className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-[#5B6B75] shadow-sm disabled:opacity-60"
      >
        {busy ? '処理中…' : 'ログアウト'}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void signInGoogle()}
      className="brand-gradient rounded-full px-4 py-2 text-sm font-extrabold disabled:opacity-60"
    >
      {busy ? '処理中…' : 'ログイン'}
    </button>
  );
}

export function HeaderGuestHint() {
  const { user, ready } = useAuth();
  if (!ready || user) return null;
  return (
    <p className="hidden text-xs font-bold text-[#5B6B75] lg:block">
      未ログインです。参加やマイページの確認には
      <Link href="/mypage" className="mx-1 font-extrabold text-[#12B8D0] underline">
        ログイン
      </Link>
      が必要です。
    </p>
  );
}

export function LoginPromptCard({
  title = 'ログインが必要です',
  body = '参加予定やプロフィールを確認するには、ログインしてください。',
}: {
  title?: string;
  body?: string;
}) {
  const { busy, error, configured, signInGoogle, signInApple, signInLine } = useAuth();

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
          {busy ? '処理中…' : 'Googleでログイン'}
        </button>
        <button
          type="button"
          disabled={busy || !configured}
          onClick={() => void signInApple()}
          className={`${loginButtonClass} bg-[#111111] text-white`}
        >
          {busy ? '処理中…' : 'Appleでサインイン'}
        </button>
        <button
          type="button"
          disabled={busy || !configured}
          onClick={() => void signInLine()}
          className={`${loginButtonClass} bg-[#06C755] text-white`}
        >
          {busy ? '処理中…' : 'LINEでログイン'}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm font-bold text-[#EF4444]">{error}</p> : null}
    </section>
  );
}
