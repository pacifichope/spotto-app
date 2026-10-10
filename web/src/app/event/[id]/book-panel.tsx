'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

import {
  AppleLogoMark,
  GoogleGMark,
  LineSpeechMark,
} from '@/components/socialBrandMarks';
import { useAuth } from '@/lib/auth-context';
import { joinEvent } from '@/lib/booking';
import { chatHref } from '@/lib/chatsWeb';
import {
  beginLineLogin,
  idTokenWithAuthenticatedRole,
  signInWithApple,
  signInWithGoogle,
} from '@/lib/firebase';
import { formatPrice } from '@/lib/eventSeo';
import { useT } from '@/lib/i18n/locale-context';
import { confirmHostedCheckout, createHostedCheckout } from '@/lib/payments';
import { fetchMyParticipantTicket, ticketHref } from '@/lib/ticket';
import { isEventPast, type PublicEvent } from '@/lib/types';

const socialButtonClass =
  'flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold disabled:opacity-60';

type BookPanelProps = {
  event: PublicEvent;
  returnStatus?: string;
  checkoutSessionId?: string;
};

export function BookPanel({ event }: { event: PublicEvent }) {
  return (
    <Suspense
      fallback={<BookControls event={event} returnStatus="" checkoutSessionId="" />}
    >
      <BookControlsFromQuery event={event} />
    </Suspense>
  );
}

function BookControlsFromQuery({ event }: { event: PublicEvent }) {
  const query = useSearchParams();
  return (
    <BookControls
      event={event}
      returnStatus={query.get('status') || ''}
      checkoutSessionId={query.get('session_id') || ''}
    />
  );
}

function BookControls({
  event,
  returnStatus = '',
  checkoutSessionId = '',
}: BookPanelProps) {
  const { user: authUser } = useAuth();
  const t = useT();
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

  async function reserve() {
    if (!user || ended) return;
    setBusy(true);
    setMessage('');
    try {
      const token = await idTokenWithAuthenticatedRole(user);
      const getIdToken = async () => token;

      if (event.priceYen > 0) {
        if (returnStatus === 'success' && checkoutSessionId) {
          const confirmed = await confirmHostedCheckout(checkoutSessionId);
          if (!confirmed.paid) {
            setMessageTone('error');
            setMessage(t('event.paymentIncomplete'));
            return;
          }
        } else {
          const session = await createHostedCheckout({
            eventId: event.id,
            title: event.title,
            amountYen: event.priceYen,
          });
          if (!session.checkoutUrl) throw new Error(t('event.paymentUrlMissing'));
          window.location.assign(session.checkoutUrl);
          return;
        }
      }

      await joinEvent({
        event,
        userId: user.uid,
        displayName: user.displayName || '',
        avatarUrl: user.photoURL,
        getIdToken,
      });
      setJoined(true);
      setMessageTone('ok');
      setMessage(t('event.joinRegistered'));
    } catch (error) {
      setMessageTone('error');
      setMessage(error instanceof Error ? error.message : t('event.bookFailed'));
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

  const primaryBtnClass =
    'flex h-14 w-full items-center justify-center rounded-2xl text-[15px] font-extrabold tracking-tight shadow-lg shadow-[#12B8D0]/25 disabled:cursor-not-allowed disabled:opacity-70';

  return (
    <div className="glass fixed inset-x-0 bottom-[72px] z-30 border-t border-[#E4EBEE]/80 px-4 py-3.5 lg:sticky lg:inset-auto lg:bottom-auto lg:top-24 lg:rounded-3xl lg:border lg:p-5 lg:shadow-xl">
      <p
        className={`mb-1 hidden text-xs font-extrabold lg:block ${
          ended ? 'text-[#8A9199]' : 'text-[#12B8D0]'
        }`}
      >
        {ended ? t('event.closed') : t('event.join')}
      </p>
      <p className="mb-4 hidden text-2xl font-extrabold tracking-tight lg:block">
        {priceLabel}
      </p>
      {user ? (
        <div className="flex flex-col gap-2">
          {joined ? (
            <Link
              href={ticketHref(event.id)}
              className={`brand-gradient ${primaryBtnClass}`}
            >
              {t('ticket.viewTicket')}
            </Link>
          ) : (
            <button
              type="button"
              disabled={busy || ended}
              onClick={() => void reserve()}
              className={
                ended
                  ? `${primaryBtnClass} bg-[#94A3B8] text-white shadow-none`
                  : `brand-gradient ${primaryBtnClass}`
              }
            >
              {joinLabel}
            </button>
          )}
          <div className="hidden flex-col gap-2 lg:flex">
            <Link
              href={chatHref(event.id, 'group')}
              className="flex h-11 w-full items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#12202A] ring-1 ring-[#E4EBEE]"
            >
              {t('event.groupChat')}
            </Link>
            {event.hostId && event.hostId !== user.uid ? (
              <Link
                href={chatHref(event.id, 'host', event.hostId)}
                className="flex h-11 w-full items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#5B6B75] ring-1 ring-[#E4EBEE]"
              >
                {t('event.messageHost')}
              </Link>
            ) : null}
          </div>
        </div>
      ) : ended ? (
        <button
          type="button"
          disabled
          className={`${primaryBtnClass} cursor-not-allowed bg-[#94A3B8] text-white shadow-none opacity-70`}
        >
          {t('event.ended')}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="mb-1 text-center text-xs font-bold text-[#5B6B75] lg:hidden">
            {t('event.joinForPrice', { price: priceLabel })}
          </p>
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
}
