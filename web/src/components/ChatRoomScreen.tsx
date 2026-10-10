'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { BackButton } from '@/components/BackButton';
import { ChatBubblesSkeleton } from '@/components/skeletons';
import {
  UserProfileModal,
  type ProfilePerson,
} from '@/components/UserProfileModal';
import { useHiddenUserIds } from '@/hooks/useHiddenUserIds';
import { useAuth } from '@/lib/auth-context';
import {
  canonicalThreadId,
  fetchRoomMessages,
  formatBubbleTime,
  markThreadRead,
  parseChatMode,
  sendRoomMessage,
  type ChatMode,
  type WebChatMessage,
} from '@/lib/chatsWeb';
import { absoluteImageUrl } from '@/lib/eventSeo';
import {
  chatRoomCacheKey,
  isQueryCacheFresh,
  peekQueryCache,
  QUERY_FRESH_MS,
} from '@/lib/queryCache';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { useT } from '@/lib/i18n/locale-context';
import { fetchWebProfile, profileFromFirebaseUser } from '@/lib/profile';
import type { PublicEvent } from '@/lib/types';

function ChatAvatar({
  name,
  imageUri,
  size = 36,
}: {
  name: string;
  imageUri?: string | null;
  size?: number;
}) {
  const resolved = absoluteImageUrl(imageUri ?? null) || imageUri || undefined;
  const initial = (name.trim() || '?').slice(0, 1);

  if (resolved) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover ring-2 ring-white"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="brand-gradient grid shrink-0 place-items-center rounded-full text-xs font-extrabold ring-2 ring-white"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

export function ChatRoomScreen() {
  const params = useParams<{ eventId: string; mode: string }>();
  const query = useSearchParams();
  const { user, ready } = useAuth();
  const t = useT();
  const { hiddenIds, markBlocked } = useHiddenUserIds();

  const eventId = String(params.eventId || '');
  const mode: ChatMode = parseChatMode(params.mode);
  const dmFromQuery = query.get('dm');
  type RoomCache = {
    event: PublicEvent | null;
    messages: WebChatMessage[];
    dmUserId: string | null;
  };
  const roomKey = chatRoomCacheKey(eventId, mode, dmFromQuery);
  const cachedRoom = peekQueryCache<RoomCache>(roomKey);

  const [event, setEvent] = useState<PublicEvent | null>(
    () => cachedRoom?.event ?? null,
  );
  const [resolvedDm, setResolvedDm] = useState<string | null>(
    () => cachedRoom?.dmUserId ?? dmFromQuery,
  );
  const [messages, setMessages] = useState<WebChatMessage[]>(
    () => cachedRoom?.messages ?? [],
  );
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(() => !cachedRoom);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [profileTarget, setProfileTarget] = useState<ProfilePerson | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!user || !eventId) return;
      const silent = opts?.silent ?? false;
      if (!silent) setLoading(true);
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
        setError(caught instanceof Error ? caught.message : t('chat.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [user, eventId, mode, dmFromQuery, t],
  );

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoading(false);
      return;
    }
    const key = chatRoomCacheKey(eventId, mode, dmFromQuery);
    const cached = peekQueryCache<RoomCache>(key);
    if (cached) {
      setEvent(cached.event);
      setResolvedDm(cached.dmUserId);
      setMessages(cached.messages);
      setLoading(false);
      if (isQueryCacheFresh(key, QUERY_FRESH_MS)) return;
      void reload({ silent: true });
      return;
    }
    void reload({ silent: false });
  }, [ready, user, eventId, mode, dmFromQuery, reload]);

  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => void reload({ silent: true }), 12_000);
    return () => window.clearInterval(id);
  }, [user, reload]);

  // キャッシュ表示のままでも開いた時点で既読にする（バッジが残る不具合の防止）
  useEffect(() => {
    if (!user || !eventId) return;
    const lastAt = messages[messages.length - 1]?.at ?? Date.now();
    const key = canonicalThreadId({
      eventId,
      mode,
      userId: user.uid,
      hostId: event?.hostId,
      dmUserId: resolvedDm ?? dmFromQuery,
    });
    markThreadRead(key, lastAt, {
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
    });
  }, [
    user,
    eventId,
    mode,
    event?.hostId,
    resolvedDm,
    dmFromQuery,
    messages,
  ]);

  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (message) => message.mine || !hiddenIds.has(message.senderId),
      ),
    [messages, hiddenIds],
  );

  const peerBlocked =
    mode === 'host' &&
    Boolean(
      (resolvedDm && hiddenIds.has(resolvedDm)) ||
        (event?.hostId &&
          event.hostId !== user?.uid &&
          hiddenIds.has(event.hostId)),
    );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visibleMessages.length]);

  const openSenderProfile = useCallback(
    (message: WebChatMessage) => {
      if (!user) return;
      const senderId = message.senderId.trim();
      if (!senderId) return;

      const isSelf = senderId === user.uid;
      const fallbackName = isSelf
        ? user.displayName?.trim() || message.senderName || t('chat.me')
        : message.senderName.trim() || t('chat.user');
      const fallbackImage =
        (isSelf ? user.photoURL : null) ||
        absoluteImageUrl(message.senderImageUri) ||
        message.senderImageUri ||
        undefined;

      const optimistic: ProfilePerson = {
        id: senderId,
        name: fallbackName,
        imageUri: fallbackImage || undefined,
        self: isSelf,
        isHost: Boolean(event?.hostId && senderId === event.hostId),
      };
      setProfileTarget(optimistic);

      void (async () => {
        const remote = await fetchWebProfile({
          userId: senderId,
          fallback: isSelf
            ? profileFromFirebaseUser(user)
            : {
                name: fallbackName,
                imageUri: fallbackImage || undefined,
                gender: '',
              },
        });
        setProfileTarget((prev) => {
          if (!prev || prev.id !== senderId) return prev;
          return {
            ...prev,
            name: remote.name.trim() || prev.name,
            imageUri: remote.imageUri || prev.imageUri,
            gender: remote.gender === '男性' || remote.gender === '女性'
              ? remote.gender
              : prev.gender,
            self: isSelf,
            isHost: Boolean(event?.hostId && senderId === event.hostId),
          };
        });
      })();
    },
    [user, event?.hostId, t],
  );

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!user || sending || !draft.trim() || peerBlocked) return;
    setSending(true);
    setError('');
    const text = draft;
    setDraft('');
    try {
      const message = await sendRoomMessage({
        userId: user.uid,
        displayName: user.displayName || t('chat.user'),
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
      setError(caught instanceof Error ? caught.message : t('chat.sendFailed'));
    } finally {
      setSending(false);
    }
  }

  if (!ready || (loading && messages.length === 0)) {
    return (
      <main className="page-main flex min-h-[70vh] flex-col pt-4 md:pt-2">
        <BackButton fallbackHref="/messages" label={t('chat.backMessages')} />
        <div className="mt-3 space-y-2" aria-hidden>
          <span className="skeleton-bone block h-3 w-28 rounded-full" />
          <span className="skeleton-bone block h-5 w-48 rounded-full" />
          <span className="skeleton-bone block h-3 w-20 rounded-full" />
        </div>
        <ChatBubblesSkeleton />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <BackButton fallbackHref="/messages" label={t('chat.backMessages')} />
        <LoginPromptCard
          title={t('chat.loginTitle')}
          body={t('chat.loginBody')}
        />
      </main>
    );
  }

  const title = event?.title || t('chat.titleFallback');
  const subtitle = mode === 'host' ? t('chat.hostChat') : t('chat.groupChat');

  return (
    <main className="page-main content-fade-in flex min-h-[70vh] flex-col pt-4 md:pt-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <BackButton fallbackHref="/messages" label={t('chat.backMessages')} />
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
            {t('chat.event')}
          </Link>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm font-bold text-[#EF4444]">{error}</p> : null}

      <section className="card-shadow mt-4 flex flex-1 flex-col overflow-hidden">
        <div
          className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4"
          style={{ maxHeight: '55vh' }}
        >
          {peerBlocked ? (
            <p className="py-10 text-center text-sm font-bold text-[#8A9199]">
              {t('chat.blocked')}
            </p>
          ) : visibleMessages.length === 0 ? (
            <p className="py-10 text-center text-sm font-bold text-[#8A9199]">
              {t('chat.empty')}
            </p>
          ) : (
            visibleMessages.map((message, index) => {
              const prev = visibleMessages[index - 1];
              const showSenderMeta =
                !message.mine &&
                (!prev || prev.mine || prev.senderId !== message.senderId);
              const timeLabel = formatBubbleTime(message.at);
              const displayName = message.mine
                ? user.displayName?.trim() || message.senderName || t('chat.me')
                : message.senderName.trim() || t('chat.user');
              const avatarUri = message.mine
                ? user.photoURL || message.senderImageUri
                : message.senderImageUri;

              return (
                <div
                  key={message.id}
                  className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}
                >
                  {message.mine ? (
                    <div className="flex max-w-[min(100%,22rem)] items-end gap-2">
                      {timeLabel ? (
                        <span
                          className="mb-0.5 shrink-0 text-[10px] font-bold tabular-nums text-[#8A9199]"
                          aria-label={t('chat.sentAt', { time: timeLabel })}
                        >
                          {timeLabel}
                        </span>
                      ) : null}
                      <div className="brand-gradient max-w-full rounded-2xl rounded-br-md px-3.5 py-2.5">
                        <p className="whitespace-pre-wrap text-sm font-bold leading-5">
                          {message.body}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openSenderProfile(message)}
                        className="mb-0.5 shrink-0 rounded-full transition hover:opacity-80"
                        aria-label={t('chat.openOwnProfile')}
                      >
                        <ChatAvatar name={displayName} imageUri={avatarUri} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex max-w-[min(100%,22rem)] items-end gap-2">
                      <button
                        type="button"
                        onClick={() => openSenderProfile(message)}
                        className={`mb-0.5 shrink-0 rounded-full transition hover:opacity-80 ${
                          showSenderMeta ? '' : 'invisible'
                        }`}
                        aria-label={t('chat.openProfile', { name: displayName })}
                        tabIndex={showSenderMeta ? 0 : -1}
                      >
                        <ChatAvatar name={displayName} imageUri={avatarUri} />
                      </button>
                      <div className="min-w-0 flex-1">
                        {showSenderMeta ? (
                          <button
                            type="button"
                            onClick={() => openSenderProfile(message)}
                            className="mb-1 block truncate text-left text-[11px] font-extrabold text-[#5B6B75] transition hover:text-[#12B8D0]"
                          >
                            {displayName}
                          </button>
                        ) : null}
                        <div className="flex items-end gap-2">
                          <div className="max-w-full rounded-2xl rounded-bl-md bg-[#F4F7F8] px-3.5 py-2.5 text-[#12202A]">
                            <p className="whitespace-pre-wrap text-sm font-bold leading-5">
                              {message.body}
                            </p>
                          </div>
                          {timeLabel ? (
                            <span
                              className="mb-0.5 shrink-0 text-[10px] font-bold tabular-nums text-[#8A9199]"
                              aria-label={t('chat.sentAt', { time: timeLabel })}
                            >
                              {timeLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
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
            placeholder={
              peerBlocked ? t('chat.placeholderBlocked') : t('chat.placeholder')
            }
            disabled={peerBlocked}
            className="h-11 min-w-0 flex-1 rounded-full bg-[#F4F7F8] px-4 text-sm font-bold outline-none ring-1 ring-[#E4EBEE] focus:ring-[#12B8D0] disabled:opacity-60"
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={peerBlocked || sending || !draft.trim()}
            className="brand-gradient h-11 shrink-0 rounded-full px-5 text-sm font-extrabold disabled:opacity-60"
          >
            {sending ? '…' : t('chat.send')}
          </button>
        </form>
      </section>

      <UserProfileModal
        open={profileTarget != null}
        person={profileTarget}
        onClose={() => setProfileTarget(null)}
        onBlocked={(userId) => {
          markBlocked(userId);
          setProfileTarget(null);
        }}
      />
    </main>
  );
}
