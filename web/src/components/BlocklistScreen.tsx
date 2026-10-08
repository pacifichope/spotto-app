'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuth } from '@/lib/auth-context';
import {
  fetchBlockedUsers,
  unblockUserRemote,
  type BlockedUser,
} from '@/lib/blocks';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';

function BlocklistBody() {
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || searchParams.get('mode') || '';
  const settingsBackHref = from
    ? `/settings?from=${encodeURIComponent(from)}`
    : '/settings';

  const { user, ready: authReady } = useAuth();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<BlockedUser | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setUsers([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const next = await fetchBlockedUsers({
        userId: user.uid,
        getIdToken: async () => idTokenWithAuthenticatedRole(user),
      });
      setUsers(next);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'ブロックリストの取得に失敗しました',
      );
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const confirmUnblock = async () => {
    if (!user || !pending || busy) return;
    const target = pending;
    setBusy(true);
    setError('');
    // 楽観的に一覧から外す
    setUsers((prev) => prev.filter((item) => item.id !== target.id));
    setPending(null);
    try {
      await unblockUserRemote({
        userId: user.uid,
        blockedId: target.id,
        getIdToken: async () => idTokenWithAuthenticatedRole(user),
      });
    } catch (caught) {
      setUsers((prev) => {
        if (prev.some((item) => item.id === target.id)) return prev;
        return [...prev, target].sort((a, b) => b.blockedAt - a.blockedAt);
      });
      setError(
        caught instanceof Error
          ? caught.message
          : 'ブロック解除に失敗しました',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!authReady) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">ブロックリスト</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  return (
    <main className="page-main pt-4 md:pt-2">
      <Link href={settingsBackHref} className="text-sm font-extrabold text-[#12B8D0]">
        ← 設定
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">ブロックリスト</h1>
      <p className="mt-1 text-sm font-bold text-[#5B6B75]">
        ブロック中のユーザーのイベントやメッセージは表示されません。
      </p>

      {!user ? (
        <LoginPromptCard title="ログインしてブロックリストを確認" />
      ) : loading && users.length === 0 ? (
        <p className="mt-6 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      ) : error && users.length === 0 ? (
        <section className="card-shadow mt-5 px-5 py-6 text-center">
          <p className="text-sm font-bold text-[#EF4444]">{error}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-3 text-sm font-extrabold text-[#12B8D0]"
          >
            再読み込み
          </button>
        </section>
      ) : users.length === 0 ? (
        <section className="card-shadow mt-5 px-5 py-10 text-center">
          <p className="text-base font-extrabold">
            現在、ブロックしているユーザーはいません
          </p>
          <p className="mt-2 text-sm font-bold leading-6 text-[#5B6B75]">
            プロフィールやチャットからブロックすると、その人のイベントやメッセージが非表示になります。
          </p>
        </section>
      ) : (
        <>
          {error ? (
            <p className="mt-3 text-sm font-bold text-[#EF4444]">{error}</p>
          ) : null}
          <section className="card-shadow mt-5 overflow-hidden">
            {users.map((item, index) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 px-4 py-3.5 sm:px-5 ${
                  index > 0 ? 'border-t border-[#E4EBEE]' : ''
                }`}
              >
                {item.imageUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUri}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="brand-gradient grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-extrabold">
                    {item.name.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">{item.name}</p>
                  <p className="mt-0.5 truncate text-xs font-bold text-[#8A9199]">
                    {item.bio?.trim() || 'ブロック中'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`${item.name}のブロックを解除`}
                  onClick={() => setPending(item)}
                  className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[13px] font-extrabold text-[#12202A] ring-1 ring-[#E4EBEE] transition hover:bg-[#F7FBFC] disabled:opacity-60"
                >
                  ブロック解除
                </button>
              </div>
            ))}
          </section>
        </>
      )}

      <ConfirmDialog
        open={pending != null}
        title={
          pending
            ? `${pending.name} のブロックを解除しますか？`
            : 'ブロックを解除しますか？'
        }
        description="解除すると、この人のイベントやメッセージが再び表示されます。"
        confirmLabel="解除する"
        busy={busy}
        onCancel={() => {
          if (!busy) setPending(null);
        }}
        onConfirm={() => void confirmUnblock()}
      />
    </main>
  );
}

export function BlocklistScreen() {
  return (
    <Suspense
      fallback={
        <main className="page-main pt-4 md:pt-2">
          <h1 className="text-2xl font-extrabold tracking-tight">ブロックリスト</h1>
          <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
        </main>
      }
    >
      <BlocklistBody />
    </Suspense>
  );
}
