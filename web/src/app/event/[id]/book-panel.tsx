'use client';

import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

import {
  AppleLogoMark,
  GoogleGMark,
  LineSpeechMark,
} from '@/components/socialBrandMarks';
import { useAuth } from '@/lib/auth-context';
import { leaveEvent } from '@/lib/booking';
import { chatHref } from '@/lib/chatsWeb';
import {
  beginLineLogin,
  idTokenWithAuthenticatedRole,
  signInWithApple,
  signInWithGoogle,
} from '@/lib/firebase';
import { formatPrice } from '@/lib/eventSeo';
import { useT } from '@/lib/i18n/locale-context';
import { fetchMyParticipantTicket, ticketHref } from '@/lib/ticket';
import { isEventPast, type PublicEvent } from '@/lib/types';

const socialButtonClass =
  'flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold disabled:opacity-60';

export type BookPanelVariant = 'floating' | 'sidebar';

type BookPanelProps = {
  event: PublicEvent;
  variant?: BookPanelVariant;
  returnStatus?: string;
  checkoutSessionId?: string;
};

export function BookPanel({
  event,
  variant = 'floating',
}: {
  event: PublicEvent;
  variant?: BookPanelVariant;
}) {
  return (
    <Suspense
      fallback={
        <BookControls
          event={event}
          variant={variant}
          returnStatus=""
          checkoutSessionId=""
        />
      }
    >
      <BookControlsFromQuery event={event} variant={variant} />
    </Suspense>
  );
}

function BookControlsFromQuery({
  event,
  variant = 'floating',
}: {
  event: PublicEvent;
  variant?: BookPanelVariant;
}) {
  const query = useSearchParams();
  return (
    <BookControls
      event={event}
      variant={variant}
      returnStatus={query.get('status') || ''}
      checkoutSessionId={query.get('session_id') || ''}
    />
  );
}

function BookControls({
  event,
  variant = 'floating',
  returnStatus = '',
  checkoutSessionId = '',
}: BookPanelProps) {
  const { user: authUser } = useAuth();
  const t = useT();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'ok' | 'error'>('ok');
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (authUser) setUser(authUser);
    else {
      setUser(null);
      setJoined(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetchMyParticipantTicket({
      eventId: event.id,
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
    })
      .then((ticket) => {
        if (!cancelled) setJoined(Boolean(ticket));
      })
      .catch(() => {
        if (!cancelled) setJoined(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, event.id]);

  /** 旧 returnUrl（詳細ページ）からの Stripe 戻りを確認画面へ転送 */
  useEffect(() => {
    if (returnStatus !== 'success' || !checkoutSessionId) return;
    const qs = new URLSearchParams({
      status: 'success',
      session_id: checkoutSessionId,
    });
    router.replace(`/event/${event.id}/checkout?${qs.toString()}`);
  }, [returnStatus, checkoutSessionId, event.id, router]);

  async function signIn(kind: 'google' | 'apple' | 'line') {
    setBusy(true);
    setMessage('');
    try {
      if (kind === 'line') {
        beginLineLogin();
        return;
      }
      const next = kind === 'google' ? await signInWithGoogle() : await signInWithApple();
      setUser(next);
    } catch (error) {
      setMessageTone('error');
      setMessage(error instanceof Error ? error.message : t('auth.loginFailed'));
    } finally {
      setBusy(false);
    }
  }

  const ended = isEventPast(event);

  /** アプリ同様、参加・購入確認画面へ */
  function reserve() {
    if (!user || ended || joined) return;
    router.push(`/event/${event.id}/checkout`);
  }

  async function cancelJoin() {
    if (!user || !joined || ended) return;
    const ok = window.confirm(t('event.cancelConfirmTitle'));
    if (!ok) return;
    setBusy(true);
    setMessage('');
    try {
      await leaveEvent({
        eventId: event.id,
        userId: user.uid,
        getIdToken: async () => idTokenWithAuthenticatedRole(user),
      });
      setJoined(false);
      setMessageTone('ok');
      setMessage(t('event.leaveDone'));
    } catch (error) {
      setMessageTone('error');
      setMessage(error instanceof Error ? error.message : t('event.leaveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const priceLabel = formatPrice(event.priceYen, t);
  const joinLabel = ended
    ? t('event.ended')
    : busy
      ? t('event.processing')
      : event.priceYen > 0
        ? t('event.joinForPrice', { price: priceLabel })
        : t('event.join');

  const sidebar = variant === 'sidebar';
  const primaryBtnClass = sidebar
    ? 'flex h-12 w-full items-center justify-center rounded-2xl px-4 text-sm font-extrabold tracking-tight shadow-md shadow-[#12B8D0]/20 disabled:cursor-not-allowed disabled:opacity-70'
    : 'flex h-12 min-w-[8.5rem] flex-1 items-center justify-center rounded-2xl px-4 text-sm font-extrabold tracking-tight shadow-md shadow-[#12B8D0]/20 disabled:cursor-not-allowed disabled:opacity-70 sm:h-14 sm:min-w-[10rem] sm:text-[15px]';

  const panel = (
    <div
      className={
        sidebar
          ? 'rounded-3xl border border-[#E4EBEE] bg-white px-4 py-4 shadow-[0_12px_36px_rgba(11,26,34,0.08)]'
          : 'glass rounded-[22px] border border-[#E4EBEE]/90 px-3.5 py-3 shadow-[0_12px_36px_rgba(11,26,34,0.14)] sm:px-4 sm:py-3.5'
      }
    >
      {sidebar ? (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-[#8A9199]">{t('event.price')}</p>
            <p className="text-2xl font-extrabold tracking-tight text-[#12202A]">
              {priceLabel}
            </p>
          </div>
        </div>
      ) : null}
      {user ? (
        <div className="flex flex-col gap-2">
          <div className={`flex items-center gap-2.5 ${sidebar ? 'flex-col' : ''}`}>
            {joined ? (
              <>
                <div className={`flex w-full items-center gap-2.5 ${sidebar ? '' : ''}`}>
                  <Link
                    href={chatHref(event.id, 'group')}
                    aria-label={t('event.groupChat')}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-[#12B8D0] ring-1 ring-[#E4EBEE] sm:h-14 sm:w-14"
                  >
                    <MessageCircle size={22} strokeWidth={2.4} aria-hidden />
                  </Link>
                  <Link
                    href={ticketHref(event.id)}
                    className={`brand-gradient ${primaryBtnClass}`}
                  >
                    {t('ticket.viewTicket')}
                  </Link>
                </div>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || ended}
                onClick={() => void reserve()}
                className={
                  ended
                    ? `${primaryBtnClass} w-full bg-[#94A3B8] text-white shadow-none`
                    : `brand-gradient ${primaryBtnClass} w-full`
                }
              >
                {joinLabel}
              </button>
            )}
          </div>
          {joined && !ended ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void cancelJoin()}
              className="text-center text-xs font-extrabold text-[#EF4444] disabled:opacity-60"
            >
              {busy ? t('event.processing') : t('event.cancelJoin')}
            </button>
          ) : null}
          {!joined && event.hostId && event.hostId !== user.uid ? (
            <Link
              href={chatHref(event.id, 'host', event.hostId)}
              className="text-center text-xs font-extrabold text-[#12B8D0]"
            >
              {t('event.messageHost')}
            </Link>
          ) : null}
        </div>
      ) : ended ? (
        <button
          type="button"
          disabled
          className={`${primaryBtnClass} w-full cursor-not-allowed bg-[#94A3B8] text-white shadow-none opacity-70`}
        >
          {t('event.ended')}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {!sidebar ? (
            <p className="text-center text-xs font-extrabold text-[#5B6B75]">
              {t('event.joinForPrice', { price: priceLabel })}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void signIn('google')}
              className={`${socialButtonClass} bg-white text-[#12202A] ring-1 ring-[#E4EBEE]`}
            >
              <GoogleGMark size={20} />
              <span>{t('auth.google')}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void signIn('apple')}
              className={`${socialButtonClass} bg-[#111111] text-white`}
            >
              <AppleLogoMark size={18} color="#FFFFFF" />
              <span>{t('auth.apple')}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void signIn('line')}
              className={`${socialButtonClass} bg-[#06C755] text-white`}
            >
              <LineSpeechMark size={22} color="#FFFFFF" />
              <span>{t('auth.line')}</span>
            </button>
          </div>
        </div>
      )}
      {message ? (
        <p
          className={`mt-2 text-center text-xs font-bold ${
            messageTone === 'error' ? 'text-[#EF4444]' : 'text-[#5B6B75]'
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );

  if (sidebar) {
    return panel;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[72px] z-30 lg:hidden">
      <div className="pointer-events-auto mx-auto w-full max-w-lg px-3">
        {panel}
      </div>
    </div>
  );
}
