'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { useAuth } from '@/lib/auth-context';
import {
  chatHref,
  fetchInboxThreads,
  formatChatListTime,
  type InboxThread,
} from '@/lib/chatsWeb';
import { absoluteImageUrl } from '@/lib/eventSeo';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { sportCover } from '@/constants/theme';

export function MessagesScreen() {
  const { user, ready } = useAuth();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!user) {
      setThreads([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const next = await fetchInboxThreads({
        userId: user.uid,
        getIdToken: async () => idTokenWithAuthenticatedRole(user),
      });
      setThreads(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '取得に失敗しました');
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => void reload(), 20_000);
    return () => window.clearInterval(id);
  }, [user, reload]);

  if (!ready) {
    return (
      <main className="pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">メッセージ</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">メッセージ</h1>
        <p className="mt-2 text-sm font-bold text-[#8A9199]">現在：未ログイン</p>
        <LoginPromptCard
          title="ログインしてメッセージを開く"
          body="参加・主催しているイベントのチャットは、ログイン後にここに表示されます。"
        />
      </main>
    );
  }

  return (
    <main className="pt-4 md:pt-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">メッセージ</h1>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-[#5B6B75] shadow-sm"
        >
          更新
        </button>
      </div>

      {error ? <p className="mt-3 text-sm font-bold text-[#EF4444]">{error}</p> : null}

      {loading && threads.length === 0 ? (
        <p className="mt-6 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      ) : threads.length === 0 ? (
        <section className="card-shadow mt-4 px-5 py-10 text-center">
          <p className="text-base font-extrabold">まだチャットはありません</p>
          <p className="mt-2 text-sm font-bold leading-6 text-[#5B6B75]">
            イベントに参加するとグループチャットが使えます。主催者との個別チャットもここに表示されます。
          </p>
          <Link
            href="/"
            className="brand-gradient mt-5 inline-flex h-11 items-center rounded-full px-5 text-sm font-extrabold"
          >
            イベントを探す
          </Link>
        </section>
      ) : (
        <section className="card-shadow mt-4 overflow-hidden">
          {threads.map((thread, index) => {
            const image =
              absoluteImageUrl(thread.eventImageUri) ||
              sportCover(thread.eventSport);
            const href = chatHref(thread.eventId, thread.mode, thread.dmUserId);
            const subtitle =
              thread.mode === 'host' ? '主催者チャット' : 'グループチャット';
            return (
              <Link
                key={thread.threadId}
                href={href}
                className={`flex items-center gap-3 px-4 py-3.5 hover:bg-[#F7FBFC] ${
                  index > 0 ? 'border-t border-[#E4EBEE]' : ''
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-2xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-extrabold tracking-tight">
                      {thread.eventTitle}
                    </p>
                    {thread.unread > 0 ? (
                      <span className="brand-gradient shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold">
                        {thread.unread > 99 ? '99+' : thread.unread}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] font-bold text-[#12B8D0]">
                    {subtitle}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-bold text-[#5B6B75]">
                    {thread.preview}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-bold text-[#8A9199]">
                  {formatChatListTime(thread.lastAt)}
                </span>
              </Link>
            );
          })}
        </section>
      )}
    </main>
  );
}
