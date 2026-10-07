'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { useAuth } from '@/lib/auth-context';
import {
  fetchRoomMessages,
  formatBubbleTime,
  parseChatMode,
  sendRoomMessage,
  type ChatMode,
  type WebChatMessage,
} from '@/lib/chatsWeb';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import type { PublicEvent } from '@/lib/types';

export function ChatRoomScreen() {
  const params = useParams<{ eventId: string; mode: string }>();
  const query = useSearchParams();
  const { user, ready } = useAuth();

  const eventId = String(params.eventId || '');
  const mode: ChatMode = parseChatMode(params.mode);
  const dmFromQuery = query.get('dm');

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [resolvedDm, setResolvedDm] = useState<string | null>(dmFromQuery);
  const [messages, setMessages] = useState<WebChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    if (!user || !eventId) return;
    try {
      const next = await fetchRoomMessages({
        userId: user.uid,
        getIdToken: async () => idTokenWithAuthenticatedRole(user),
        eventId,
        mode,
        dmUserId: mode === 'host' ? dmFromQuery : null,
      });
      setEvent(next.event);
      setResolvedDm(next.dmUserId);
      setMessages(next.messages);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user, eventId, mode, dmFromQuery]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void reload();
  }, [ready, user, reload]);

  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => void reload(), 8_000);
    return () => window.clearInterval(id);
  }, [user, reload]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!user || sending || !draft.trim()) return;
    setSending(true);
    setError('');
    const text = draft;
    setDraft('');
    try {
      const message = await sendRoomMessage({
        userId: user.uid,
        displayName: user.displayName || 'ユーザー',
        photoURL: user.photoURL,
        getIdToken: async () => idTokenWithAuthenticatedRole(user),
        eventId,
        mode,
        dmUserId: resolvedDm || dmFromQuery,
        hostUserId: event?.hostId,
        body: text,
      });
      setMessages((prev) => [...prev, message]);
    } catch (caught) {
      setDraft(text);
      setError(caught instanceof Error ? caught.message : '送信に失敗しました');
    } finally {
      setSending(false);
    }
  }

  if (!ready || loading) {
    return (
      <main className="pt-4 md:pt-2">
        <p className="text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="pt-4 md:pt-2">
        <Link href="/messages" className="text-sm font-extrabold text-[#12B8D0]">
          ← メッセージ
        </Link>
        <LoginPromptCard
          title="ログインしてチャットを開く"
          body="イベントのチャットはログイン後に利用できます。"
        />
      </main>
    );
  }

  const title = event?.title || 'チャット';
  const subtitle = mode === 'host' ? '主催者チャット' : 'グループチャット';

  return (
    <main className="flex min-h-[70vh] flex-col pt-4 md:pt-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/messages" className="text-sm font-extrabold text-[#12B8D0]">
            ← メッセージ
          </Link>
          <h1 className="mt-2 truncate text-xl font-extrabold tracking-tight">
            {title}
          </h1>
          <p className="mt-1 text-xs font-bold text-[#12B8D0]">{subtitle}</p>
        </div>
        {event ? (
          <Link
            href={`/event/${event.id}`}
            className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-extrabold text-[#5B6B75] shadow-sm"
          >
            イベント
          </Link>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm font-bold text-[#EF4444]">{error}</p> : null}

      <section className="card-shadow mt-4 flex flex-1 flex-col overflow-hidden">
        <div
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
          style={{ maxHeight: '55vh' }}
        >
          {messages.length === 0 ? (
            <p className="py-10 text-center text-sm font-bold text-[#8A9199]">
              まだメッセージはありません。最初のひとことを送ってみましょう。
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                    message.mine
                      ? 'brand-gradient'
                      : 'bg-[#F4F7F8] text-[#12202A]'
                  }`}
                >
                  {!message.mine ? (
                    <p className="text-[11px] font-extrabold opacity-70">
                      {message.senderName}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm font-bold leading-5">
                    {message.body}
                  </p>
                  <p
                    className={`mt-1 text-right text-[10px] font-bold ${
                      message.mine ? 'text-white/80' : 'text-[#8A9199]'
                    }`}
                  >
                    {formatBubbleTime(message.at)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => void onSend(e)}
          className="flex gap-2 border-t border-[#E4EBEE] px-3 py-3"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="メッセージを入力"
            className="h-11 min-w-0 flex-1 rounded-full bg-[#F4F7F8] px-4 text-sm font-bold outline-none ring-1 ring-[#E4EBEE] focus:ring-[#12B8D0]"
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="brand-gradient h-11 shrink-0 rounded-full px-5 text-sm font-extrabold disabled:opacity-60"
          >
            {sending ? '…' : '送信'}
          </button>
        </form>
      </section>
    </main>
  );
}
