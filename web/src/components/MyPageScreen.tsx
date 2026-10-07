'use client';

import { LoginPromptCard } from '@/components/AuthControls';
import { useAuth } from '@/lib/auth-context';

export function MyPageScreen() {
  const { user, ready, busy, signOut } = useAuth();

  if (!ready) {
    return (
      <main className="pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">マイページ</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">マイページ</h1>
        <p className="mt-2 text-sm font-bold text-[#8A9199]">現在：未ログイン</p>
        <LoginPromptCard
          title="ログインしてマイページを開く"
          body="参加予定やプロフィールは、ログイン後にこの画面で確認できます。Google または Apple でサインインしてください。"
        />
      </main>
    );
  }

  const name = user.displayName?.trim() || 'ユーザー';
  const email = user.email || '';

  return (
    <main className="pt-4 md:pt-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">マイページ</h1>
          <p className="mt-2 text-sm font-extrabold text-[#12B8D0]">ログイン中</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void signOut()}
          className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-[#5B6B75] shadow-sm disabled:opacity-60"
        >
          {busy ? '処理中…' : 'ログアウト'}
        </button>
      </div>
      <section className="card-shadow mt-4 flex items-center gap-4 px-5 py-6">
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <span className="brand-gradient grid h-14 w-14 place-items-center rounded-full text-lg font-extrabold">
            {name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold tracking-tight">{name}</p>
          {email ? <p className="mt-1 truncate text-sm font-bold text-[#5B6B75]">{email}</p> : null}
        </div>
      </section>
      <p className="card-shadow mt-4 px-5 py-6 text-sm font-bold leading-6 text-[#5B6B75]">
        参加予定やチャットの一覧は、これからこの画面にまとめていきます。イベント詳細から予約した内容は、同じアカウントで確認できます。
      </p>
    </main>
  );
}
