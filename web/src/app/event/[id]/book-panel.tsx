'use client';

import { MessageCircle } from 'lucide-react';
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
import { createAuthedSupabase } from '@/lib/supabase';
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

      let displayName = user.displayName || '';
      let avatarUrl = user.photoURL;
      let gender: '男性' | '女性' | null = null;
      try {
        const profileClient = createAuthedSupabase(async () => token);
        const { data: profile } = await profileClient
          .from('profiles')
          .select('display_name, nickname, avatar_url, gender')
          .eq('id', user.uid)
          .maybeSingle();
        const row = profile as {
          display_name?: string | null;
          nickname?: string | null;
          avatar_url?: string | null;
          gender?: string | null;
        } | null;
        displayName =
          String(row?.display_name || row?.nickname || '').trim() || displayName;
        avatarUrl = String(row?.avatar_url || '').trim() || avatarUrl;
        if (row?.gender === '男性' || row?.gender === '女性') {
          gender = row.gender;
        }
      } catch {
        /* スナップショット用。失敗しても参加自体は続行 */
      }

      await joinEvent({
        event,
        userId: user.uid,
        displayName,
        avatarUrl,
        gender,
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
    'flex h-12 min-w-[8.5rem] flex-1 items-center justify-center rounded-2xl px-4 text-sm font-extrabold tracking-tight shadow-md shadow-[#12B8D0]/20 disabled:cursor-not-allowed disabled:opacity-70 sm:h-14 sm:min-w-[10rem] sm:text-[15px]';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[72px] z-30 md:bottom-5">
      <div className="pointer-events-auto mx-auto w-full max-w-[520px] px-3 md:px-0">
        <div className="glass rounded-[22px] border border-[#E4EBEE]/90 px-3.5 py-3 shadow-[0_12px_36px_rgba(11,26,34,0.14)] sm:px-4 sm:py-3.5">
          {user ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                {joined ? (
                  <>
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
              <p className="text-center text-xs font-extrabold text-[#5B6B75]">
                {t('event.joinForPrice', { price: priceLabel })}
              </p>
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
      </div>
    </div>
  );
}
