'use client';

import Link from 'next/link';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useHiddenUserIds } from '@/hooks/useHiddenUserIds';
import { useAuth } from '@/lib/auth-context';
import {
  chatHref,
  fetchInboxThreads,
  formatChatListTime,
  hideInboxThread,
  type InboxThread,
} from '@/lib/chatsWeb';
import { absoluteImageUrl } from '@/lib/eventSeo';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { sportCover } from '@/constants/theme';

const shellClass = 'page-main';

export function MessagesScreen() {
  const { user, ready } = useAuth();
  const { hiddenIds } = useHiddenUserIds();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingHide, setPendingHide] = useState<InboxThread | null>(null);
  const [hiding, setHiding] = useState(false);
  const loadingRef = useRef(false);

  const reload = useCallback(async () => {
    if (!user) {
      setThreads([]);
      return;
    }
    if (loadingRef.current) return;
    loadingRef.current = true;
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
      loadingRef.current = false;
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

  const visibleThreads = threads.filter((thread) => {
    if (thread.mode === 'host') {
      // dmUserId = 参加者側。自分が参加者なら相手は主催者。
      const peerId =
        thread.dmUserId && thread.dmUserId !== user?.uid
          ? thread.dmUserId
          : thread.hostId;
      if (peerId && hiddenIds.has(peerId)) return false;
      if (thread.hostId && hiddenIds.has(thread.hostId)) return false;
    } else if (thread.hostId && hiddenIds.has(thread.hostId)) {
      // グループ: 主催者がブロック対象ならスレッドごと非表示
      return false;
    }
    return true;
  });

  const confirmHide = useCallback(async () => {
    if (!user || !pendingHide || hiding) return;
    const target = pendingHide;
    setHiding(true);
    setError('');
    // 楽観的に一覧から外す
    setThreads((prev) => prev.filter((item) => item.threadId !== target.threadId));
    setPendingHide(null);
    try {
      await hideInboxThread({
        userId: user.uid,
        getIdToken: async () => idTokenWithAuthenticatedRole(user),
        threadId: target.threadId,
        lastAt: target.lastAt,
      });
    } catch (caught) {
      setThreads((prev) => {
        if (prev.some((item) => item.threadId === target.threadId)) return prev;
        return [...prev, target].sort((a, b) => b.lastAt - a.lastAt);
      });
      setError(
        caught instanceof Error ? caught.message : 'チャットの削除に失敗しました',
      );
    } finally {
      setHiding(false);
    }
  }, [user, pendingHide, hiding]);

  if (!ready) {
    return (
      <main className={`${shellClass} pt-4 md:pt-2`}>
        <h1 className="text-2xl font-extrabold tracking-tight">メッセージ</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={`${shellClass} pt-4 md:pt-2`}>
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
    <main className={`${shellClass} pt-4 md:pt-2`}>
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="text-2xl font-extrabold tracking-tight">メッセージ</h1>
        <button
          type="button"
          aria-label="チャット一覧を更新"
          title="更新"
          disabled={loading}
          onClick={() => void reload()}
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#5B6B75] shadow-sm transition-colors hover:bg-[#E5F9FC] hover:text-[#0284C7] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white disabled:hover:text-[#5B6B75]"
        >
          <RefreshCw
            size={20}
            strokeWidth={2.4}
            className={loading ? 'animate-spin' : undefined}
            aria-hidden
          />
        </button>
      </div>

      {error ? (
        <p className="mt-3 px-1 text-sm font-bold text-[#EF4444]">{error}</p>
      ) : null}

      {loading && visibleThreads.length === 0 ? (
        <p className="mt-6 px-1 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      ) : visibleThreads.length === 0 ? (
        <section className="card-shadow mt-4 px-5 py-10 text-center sm:px-6">
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
          {visibleThreads.map((thread, index) => {
            const image =
              absoluteImageUrl(thread.eventImageUri) ||
              sportCover(thread.eventSport);
            const href = chatHref(thread.eventId, thread.mode, thread.dmUserId);
            const subtitle =
              thread.mode === 'host' ? '主催者チャット' : 'グループチャット';
            return (
              <div
                key={thread.threadId}
                className={`group relative flex items-center gap-2 px-2 py-1 sm:gap-3 sm:px-3 ${
                  index > 0 ? 'border-t border-[#E4EBEE]' : ''
                }`}
              >
                <Link
                  href={href}
                  className="flex min-w-0 flex-1 items-center gap-3.5 rounded-2xl px-2 py-3 transition-colors hover:bg-[#F7FBFC] sm:gap-4 sm:px-2 sm:py-3.5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-2xl object-cover sm:h-14 sm:w-14"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-extrabold tracking-tight sm:text-[15px]">
                        {thread.eventTitle}
                      </p>
                      <span className="shrink-0 pt-0.5 text-[11px] font-bold text-[#8A9199]">
                        {formatChatListTime(thread.lastAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-[11px] font-bold text-[#12B8D0]">{subtitle}</p>
                      {thread.unread > 0 ? (
                        <span className="brand-gradient shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold">
                          {thread.unread > 99 ? '99+' : thread.unread}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs font-bold leading-5 text-[#5B6B75] sm:text-[13px]">
                      {thread.preview}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  aria-label={`${thread.eventTitle}のチャットを削除`}
                  title="削除"
                  disabled={hiding}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setPendingHide(thread);
                  }}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#8A9199] opacity-100 transition-colors hover:bg-[#FEE2E2] hover:text-[#EF4444] disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                >
                  <Trash2 size={18} strokeWidth={2.2} />
                </button>
              </div>
            );
          })}
        </section>
      )}

      <ConfirmDialog
        open={pendingHide != null}
        title="このチャットを削除しますか？"
        description="一覧から削除します。この操作は元に戻せません。相手側の履歴には影響しません。"
        confirmLabel="削除する"
        tone="destructive"
        busy={hiding}
        onCancel={() => {
          if (!hiding) setPendingHide(null);
        }}
        onConfirm={() => void confirmHide()}
      />
    </main>
  );
}
