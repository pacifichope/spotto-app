'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import type { User } from 'firebase/auth';

import { joinEvent } from '@/lib/booking';
import {
  idTokenWithAuthenticatedRole,
  signInWithApple,
  signInWithGoogle,
} from '@/lib/firebase';
import { formatPrice } from '@/lib/eventSeo';
import { confirmHostedCheckout, createHostedCheckout } from '@/lib/payments';
import type { PublicEvent } from '@/lib/types';

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
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(kind: 'google' | 'apple') {
    setBusy(true);
    setMessage('');
    try {
      const next = kind === 'google' ? await signInWithGoogle() : await signInWithApple();
      setUser(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ログインに失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function reserve() {
    if (!user) return;
    setBusy(true);
    setMessage('');
    try {
      const token = await idTokenWithAuthenticatedRole(user);
      const getIdToken = async () => token;

      if (event.priceYen > 0) {
        if (returnStatus === 'success' && checkoutSessionId) {
          const confirmed = await confirmHostedCheckout(checkoutSessionId);
          if (!confirmed.paid) {
            setMessage('決済が完了していません');
            return;
          }
        } else {
          const session = await createHostedCheckout({
            eventId: event.id,
            title: event.title,
            amountYen: event.priceYen,
          });
          if (!session.checkoutUrl) throw new Error('決済 URL がありません');
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
      setMessage('参加を登録しました');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '予約に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  const label = busy
    ? '処理中…'
    : event.priceYen > 0
      ? '支払って参加する'
      : '参加する';

  return (
    <div className="glass fixed inset-x-0 bottom-[72px] z-30 px-4 py-3 lg:sticky lg:inset-auto lg:bottom-auto lg:top-24 lg:rounded-3xl lg:p-5">
      <p className="mb-1 hidden text-xs font-extrabold text-[#12B8D0] lg:block">参加する</p>
      <p className="mb-4 hidden text-2xl font-extrabold tracking-tight lg:block">{formatPrice(event.priceYen)}</p>
      {user ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void reserve()}
          className="brand-gradient h-12 w-full rounded-full text-sm font-extrabold disabled:opacity-60"
        >
          {label}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void signIn('google')}
            className="h-12 rounded-full bg-white text-sm font-extrabold text-[#12202A] disabled:opacity-60"
          >
            Google
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void signIn('apple')}
            className="brand-gradient h-12 rounded-full text-sm font-extrabold disabled:opacity-60"
          >
            Appleで参加
          </button>
        </div>
      )}
      {message ? (
        <p
          className={`mt-2 text-center text-xs font-bold ${
            message.includes('失敗') || message.includes('ません') ? 'text-[#EF4444]' : 'text-[#5B6B75]'
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
