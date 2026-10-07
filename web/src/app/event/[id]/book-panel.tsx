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
    <div className="glass fixed bottom-[76px] left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2 px-4 py-3">
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
