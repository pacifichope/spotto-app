'use client';

import { ChevronLeft, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

import {
  AppleLogoMark,
  GoogleGMark,
  LineSpeechMark,
} from '@/components/socialBrandMarks';
import { sportCover } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { joinEvent } from '@/lib/booking';
import {
  clearCheckoutQuantity,
  loadCheckoutQuantity,
  saveCheckoutQuantity,
} from '@/lib/checkoutSession';
import { absoluteImageUrl } from '@/lib/eventSeo';
import {
  beginLineLogin,
  idTokenWithAuthenticatedRole,
  signInWithApple,
  signInWithGoogle,
} from '@/lib/firebase';
import { useT } from '@/lib/i18n/locale-context';
import { confirmHostedCheckout, createHostedCheckout } from '@/lib/payments';
import {
  buildRefundPolicyRows,
  cancelPolicySummary,
  formatCheckoutSchedule,
  formatRefundDeadline,
  formatYenAmount,
  eventStartAt,
  parseCancelPolicyRule,
  spotsLeft,
} from '@/lib/refundPolicy';
import { createAuthedSupabase } from '@/lib/supabase';
import { ticketHref } from '@/lib/ticket';
import { isEventPast, type PublicEvent } from '@/lib/types';

const socialButtonClass =
  'flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold disabled:opacity-60';

type Props = {
  event: PublicEvent;
};

export function CheckoutConfirmScreen({ event }: Props) {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutConfirmInner event={event} />
    </Suspense>
  );
}

function CheckoutSkeleton() {
  return (
    <main className="page-main mx-auto w-full max-w-3xl animate-pulse space-y-4 pb-28">
      <div className="h-10 w-40 rounded-full bg-[#E4EBEE]" />
      <div className="h-28 rounded-3xl bg-[#E4EBEE]" />
      <div className="h-20 rounded-3xl bg-[#E4EBEE]/80" />
      <div className="h-48 rounded-3xl bg-[#E4EBEE]/70" />
    </main>
  );
}

function CheckoutConfirmInner({ event }: Props) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: authUser, ready } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'ok' | 'error'>('ok');
  const completingRef = useRef(false);

  const paid = event.priceYen > 0;
  const unitYen = Math.max(0, Math.floor(event.priceYen));
  const left = spotsLeft(event);
  const maxQty = Math.max(1, left);
  const totalYen = unitYen * quantity;
  const ended = isEventPast(event);
  const thumb =
    absoluteImageUrl(event.imageUri) ||
    absoluteImageUrl(event.imageUris?.[0] ?? null) ||
    sportCover(event.sport);
  const schedule = formatCheckoutSchedule(event);
  const policyLabel = cancelPolicySummary(event);
  const refundable = paid
    ? parseCancelPolicyRule(event.cancelPolicy).kind !== 'none'
    : false;
  const eventStartLabel = formatRefundDeadline(eventStartAt(event));
  const refundRows = useMemo(
    () => (paid ? buildRefundPolicyRows(event, totalYen, t) : []),
    [event, paid, totalYen, t],
  );

  const returnStatus = searchParams.get('status') || '';
  const checkoutSessionId = searchParams.get('session_id') || '';
  /** Stripe は session_id のみ付与することもある */
  const returningFromStripe =
    Boolean(checkoutSessionId) &&
    returnStatus !== 'cancel' &&
    returnStatus !== 'cancelled';

  useEffect(() => {
    if (authUser) setUser(authUser);
    else setUser(null);
  }, [authUser]);

  useEffect(() => {
    const initial = Math.min(loadCheckoutQuantity(event.id, 1), maxQty);
    setQuantity(Math.max(1, initial));
  }, [event.id, maxQty]);

  useEffect(() => {
    if (quantity > maxQty) setQuantity(maxQty);
  }, [maxQty, quantity]);

  useEffect(() => {
    saveCheckoutQuantity(event.id, quantity);
  }, [event.id, quantity]);

  async function resolveProfile(token: string, current: User) {
    let displayName = current.displayName || '';
    let avatarUrl = current.photoURL;
    let gender: '男性' | '女性' | null = null;
    try {
      const profileClient = createAuthedSupabase(async () => token);
      const { data: profile } = await profileClient
        .from('profiles')
        .select('display_name, nickname, avatar_url, gender')
        .eq('id', current.uid)
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
      /* continue */
    }
    return { displayName, avatarUrl, gender };
  }

  async function completeJoin(current: User, qty: number) {
    const token = await idTokenWithAuthenticatedRole(current);
    const profile = await resolveProfile(token, current);
    await joinEvent({
      event,
      userId: current.uid,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      gender: profile.gender,
      ticketQuantity: qty,
      getIdToken: async () => token,
    });
    clearCheckoutQuantity(event.id);
    setMessageTone('ok');
    setMessage(t('payment.joinDone'));
    router.replace(ticketHref(event.id));
  }

  /** Stripe 戻りを処理 */
  useEffect(() => {
    if (!user || !paid || completingRef.current) return;
    if (!returningFromStripe || !checkoutSessionId) return;
    completingRef.current = true;
    setBusy(true);
    setMessage(t('payment.checking'));
    setMessageTone('ok');
    const qty = loadCheckoutQuantity(event.id, quantity);
    void (async () => {
      try {
        const confirmed = await confirmHostedCheckout(checkoutSessionId);
        if (!confirmed.paid) {
          setMessageTone('error');
          setMessage(t('payment.errorNotCompleted'));
          return;
        }
        await completeJoin(user, qty);
      } catch (error) {
        setMessageTone('error');
        setMessage(
          error instanceof Error
            ? error.message
            : t('payment.errorCompletionFailed'),
        );
      } finally {
        setBusy(false);
        completingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Stripe return once
  }, [user, paid, returningFromStripe, checkoutSessionId, event.id]);

  async function signIn(kind: 'google' | 'apple' | 'line') {
    setBusy(true);
    setMessage('');
    try {
      if (kind === 'line') {
        beginLineLogin();
        return;
      }
      const next =
        kind === 'google' ? await signInWithGoogle() : await signInWithApple();
      setUser(next);
    } catch (error) {
      setMessageTone('error');
      setMessage(error instanceof Error ? error.message : t('auth.loginFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (ended || busy) return;
    if (!user) {
      setMessageTone('error');
      setMessage(t('payment.loginRequired'));
      return;
    }
    if (quantity > maxQty) {
      setMessageTone('error');
      setMessage(t('payment.errorMaxQty', { count: maxQty }));
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      if (paid) {
        setMessage(t('payment.preparing'));
        saveCheckoutQuantity(event.id, quantity);
        const session = await createHostedCheckout({
          eventId: event.id,
          title: event.title,
          amountYen: totalYen,
          quantity,
        });
        if (!session.checkoutUrl) {
          throw new Error(t('payment.errorPrepareFailed'));
        }
        window.location.assign(session.checkoutUrl);
        return;
      }
      await completeJoin(user, quantity);
    } catch (error) {
      setMessageTone('error');
      setMessage(
        error instanceof Error ? error.message : t('payment.errorStartFailed'),
      );
      setBusy(false);
    }
  }

  const ctaLabel = ended
    ? t('event.ended')
    : busy
      ? t('common.processing')
      : paid
        ? t('payment.ctaPay', { amount: formatYenAmount(totalYen) })
        : t('payment.ctaConfirm');

  return (
    <main className="page-main mx-auto w-full max-w-3xl pb-36 lg:max-w-5xl lg:pb-12">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/event/${event.id}`}
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#12202A] ring-1 ring-[#E4EBEE] transition hover:bg-[#F7FBFC]"
          aria-label={t('common.back')}
        >
          <ChevronLeft size={22} strokeWidth={2.6} />
        </Link>
        <h1 className="text-lg font-extrabold tracking-tight md:text-xl">
          {t('payment.title')}
        </h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-start">
        <div className="space-y-0 overflow-hidden rounded-[28px] bg-white shadow-[0_12px_36px_rgba(11,26,34,0.08)] ring-1 ring-[#E4EBEE]">
          {/* イベント概要 */}
          <div className="flex gap-3.5 px-4 py-4 sm:px-5 sm:py-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb}
              alt=""
              className="h-[72px] w-[72px] shrink-0 rounded-2xl object-cover ring-1 ring-[#E4EBEE]"
            />
            <div className="min-w-0">
              <h2 className="text-base font-extrabold leading-snug tracking-tight text-[#12202A]">
                {event.title || t('event.untitled')}
              </h2>
              {schedule ? (
                <p className="mt-1 text-sm font-bold text-[#12202A]">
                  {schedule}
                </p>
              ) : null}
              <p className="mt-0.5 text-xs font-bold text-[#8A9199]">
                {event.location.trim() || t('event.placeUnknown')}
              </p>
            </div>
          </div>

          <div className="h-px bg-[#E4EBEE]" />

          {/* 枚数 */}
          <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <div>
              <p className="text-sm font-extrabold text-[#12202A]">
                {t('payment.ticketQuantity')}
              </p>
              <p className="mt-0.5 text-xs font-bold text-[#8A9199]">
                {t('payment.spotsSelectable', { count: left })}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-2xl bg-[#F4F7F8] p-1 ring-1 ring-[#E4EBEE]">
              <button
                type="button"
                disabled={quantity <= 1 || busy}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label={t('payment.decreaseQty')}
                className="grid h-9 w-9 place-items-center rounded-xl text-[#12202A] disabled:opacity-30"
              >
                <Minus size={16} strokeWidth={2.6} />
              </button>
              <span className="min-w-[2rem] text-center text-base font-extrabold tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                disabled={quantity >= maxQty || busy}
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                aria-label={t('payment.increaseQty')}
                className="grid h-9 w-9 place-items-center rounded-xl text-[#12202A] disabled:opacity-30"
              >
                <Plus size={16} strokeWidth={2.6} />
              </button>
            </div>
          </div>

          {/* 金額 */}
          <div className="flex items-center justify-between gap-3 px-4 pb-4 sm:px-5">
            <div>
              <p className="text-sm font-extrabold text-[#12202A]">
                {t('payment.amountLabel')}
              </p>
              {paid ? (
                <p className="mt-0.5 text-xs font-bold text-[#8A9199]">
                  {quantity > 1
                    ? t('payment.unitTimesQty', {
                        unit: formatYenAmount(unitYen),
                        count: quantity,
                      })
                    : t('payment.perTicket', {
                        amount: formatYenAmount(unitYen),
                      })}
                </p>
              ) : null}
            </div>
            <p
              className={`text-xl font-extrabold tabular-nums ${
                paid ? 'text-[#E11D48]' : 'text-[#12202A]'
              }`}
            >
              {paid ? formatYenAmount(totalYen) : t('common.free')}
            </p>
          </div>

          {paid ? (
            <>
              <div className="h-px bg-[#E4EBEE]" />
              <div className="space-y-3 px-4 py-4 sm:px-5">
                <p className="text-sm font-extrabold text-[#12202A]">
                  {t('payment.methodTitle')}
                </p>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#EAF4FB] px-4 py-3.5 ring-1 ring-[#B8D9EF]">
                  <span className="text-sm font-extrabold text-[#12202A]">
                    {t('payment.methodStripe')}
                  </span>
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[#12B8D0] text-[11px] font-extrabold text-white">
                    ✓
                  </span>
                </div>
              </div>
            </>
          ) : null}

          {paid ? (
            <>
              <div className="h-px bg-[#E4EBEE]" />
              <div className="space-y-3 px-4 py-5 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-extrabold text-[#12202A]">
                    {t('payment.policyTitle')}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                      refundable
                        ? 'bg-[#E5F9FC] text-[#12B8D0]'
                        : 'bg-[#F4F7F8] text-[#8A9199]'
                    }`}
                  >
                    {refundable
                      ? t('payment.autoRefund')
                      : t('payment.noRefund')}
                  </span>
                </div>
                {policyLabel ? (
                  <p className="text-sm font-bold leading-6 text-[#12202A]">
                    {policyLabel}
                  </p>
                ) : null}
                {eventStartLabel ? (
                  <p className="text-xs font-bold text-[#8A9199]">
                    {t('payment.deadlineBasis', { when: eventStartLabel })}
                  </p>
                ) : null}
                <p className="text-xs font-bold leading-5 text-[#8A9199]">
                  {refundable
                    ? t('payment.refundableNote')
                    : t('payment.nonRefundableNote')}
                </p>

                <div className="overflow-hidden rounded-2xl ring-1 ring-[#D6E8F5]">
                  <table className="w-full border-collapse text-left text-[11px] sm:text-xs">
                    <thead>
                      <tr className="bg-[#EAF4FB]">
                        <th className="border-b border-[#D6E8F5] px-2.5 py-2.5 font-extrabold text-[#12202A] sm:px-3">
                          {t('payment.tableDeadline')}
                        </th>
                        <th className="border-b border-l border-[#D6E8F5] px-2 py-2.5 font-extrabold text-[#12202A]">
                          {t('payment.tableRate')}
                        </th>
                        <th className="border-b border-l border-[#D6E8F5] px-2 py-2.5 font-extrabold text-[#12202A]">
                          {t('payment.tableAmount')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {refundRows.map((row, index) => (
                        <tr
                          key={`${row.refundRatePercent}-${index}`}
                          className={index % 2 === 1 ? 'bg-[#F7FBFC]' : 'bg-white'}
                        >
                          <td className="border-b border-[#D6E8F5] px-2.5 py-2.5 font-bold leading-5 whitespace-pre-line text-[#12202A] sm:px-3">
                            {row.requestTimeLabel}
                          </td>
                          <td className="border-b border-l border-[#D6E8F5] px-2 py-2.5 text-center font-extrabold text-[#12202A]">
                            {row.refundRateLabel}
                          </td>
                          <td className="border-b border-l border-[#D6E8F5] px-2 py-2.5 text-center font-extrabold text-[#12202A]">
                            {formatYenAmount(row.refundAmountYen)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] font-bold text-[#8A9199]">
                  {t('payment.tableFootnote', {
                    total: formatYenAmount(totalYen),
                  })}
                </p>
              </div>
            </>
          ) : null}
        </div>

        {/* 右カラム / 下部 CTA */}
        <aside className="space-y-4 lg:sticky lg:top-24">
          {!user && ready ? (
            <div className="rounded-[28px] bg-white p-4 shadow-[0_12px_36px_rgba(11,26,34,0.08)] ring-1 ring-[#E4EBEE] sm:p-5">
              <p className="mb-3 text-center text-sm font-extrabold text-[#5B6B75]">
                {t('payment.loginRequired')}
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
          ) : null}

          <div className="hidden rounded-[28px] bg-white p-5 shadow-[0_12px_36px_rgba(11,26,34,0.08)] ring-1 ring-[#E4EBEE] lg:block">
            <p className="text-[11px] font-bold text-[#8A9199]">
              {t('payment.amountLabel')}
            </p>
            <p
              className={`mt-1 text-3xl font-extrabold tabular-nums ${
                paid ? 'text-[#E11D48]' : 'text-[#12202A]'
              }`}
            >
              {paid ? formatYenAmount(totalYen) : t('common.free')}
            </p>
            <button
              type="button"
              disabled={busy || ended || !user}
              onClick={() => void onConfirm()}
              className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-[#111111] px-4 text-sm font-extrabold text-[#29D1E8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ctaLabel}
            </button>
            {message ? (
              <p
                className={`mt-3 text-center text-xs font-bold ${
                  messageTone === 'error' ? 'text-[#EF4444]' : 'text-[#5B6B75]'
                }`}
              >
                {message}
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {/* モバイル固定 CTA */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[72px] z-30 lg:hidden">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl px-3">
          <div className="rounded-[22px] bg-[#111111] px-3 py-3 shadow-[0_12px_36px_rgba(11,26,34,0.28)]">
            <button
              type="button"
              disabled={busy || ended || !user}
              onClick={() => void onConfirm()}
              className="flex h-14 w-full items-center justify-center rounded-2xl text-sm font-extrabold text-[#29D1E8] disabled:opacity-50"
            >
              {ctaLabel}
            </button>
            {message ? (
              <p
                className={`mt-2 text-center text-xs font-bold ${
                  messageTone === 'error' ? 'text-[#FCA5A5]' : 'text-[#A5F3FC]'
                }`}
              >
                {message}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
