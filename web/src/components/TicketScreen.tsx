'use client';

import Link from 'next/link';
import { MapPin, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { BackButton, navigateBack } from '@/components/BackButton';
import { TicketSkeleton } from '@/components/skeletons';
import { useAuth } from '@/lib/auth-context';
import { formatPrice } from '@/lib/eventSeo';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { sportLabel } from '@/lib/i18n/labels';
import { useT } from '@/lib/i18n/locale-context';
import {
  fetchWebProfile,
  profileFromFirebaseUser,
} from '@/lib/profile';
import {
  fetchMyParticipantTicket,
  fetchPublicEventForTicket,
  formatBookedAt,
  formatTicketSchedule,
  sportEmoji,
  type MyParticipantTicket,
} from '@/lib/ticket';
import { isEventPast, type PublicEvent } from '@/lib/types';

export function TicketScreen() {
  const params = useParams<{ eventId: string }>();
  const router = useRouter();
  const { user, ready } = useAuth();
  const t = useT();
  const eventId = decodeURIComponent(String(params.eventId || '')).trim();

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [ticket, setTicket] = useState<MyParticipantTicket | null>(null);
  const [reserverName, setReserverName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!eventId) {
      setLoading(false);
      setLoadFailed(true);
      return;
    }
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);

    void (async () => {
      try {
        const [nextEvent, nextTicket, profile] = await Promise.all([
          fetchPublicEventForTicket(eventId),
          fetchMyParticipantTicket({
            eventId,
            userId: user.uid,
            getIdToken: async () => idTokenWithAuthenticatedRole(user),
          }),
          fetchWebProfile({
            userId: user.uid,
            fallback: profileFromFirebaseUser(user),
          }),
        ]);
        if (cancelled) return;
        setEvent(nextEvent);
        setTicket(nextTicket);
        setReserverName(
          profile.name.trim() ||
            user.displayName?.trim() ||
            t('ticket.participantFallback'),
        );
        if (!nextEvent) setLoadFailed(true);
      } catch {
        if (!cancelled) {
          setEvent(null);
          setTicket(null);
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user, eventId, t]);

  const fallbackHref = '/mypage?mode=participant&segment=joined';
  const close = () => navigateBack(router, fallbackHref);

  if (!ready || loading) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <BackButton fallbackHref={fallbackHref} />
        <div className="mt-3">
          <TicketSkeleton />
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <BackButton fallbackHref={fallbackHref} />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">
          {t('ticket.title')}
        </h1>
        <LoginPromptCard
          title={t('ticket.loginTitle')}
          body={t('ticket.loginBody')}
        />
      </main>
    );
  }

  if (!event) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <BackButton fallbackHref={fallbackHref} />
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 pt-8 text-center">
          <h1 className="text-xl font-extrabold">{t('ticket.notFoundTitle')}</h1>
          <p className="mt-2 text-sm font-bold text-[#5B6B75]">
            {loadFailed ? t('ticket.loadFailed') : t('ticket.notFoundBody')}
          </p>
          <BackButton
            fallbackHref={fallbackHref}
            className="mt-6 rounded-full bg-white px-5 py-2.5 text-[#12202A] ring-1 ring-[#E4EBEE] hover:text-[#12202A]"
          />
        </div>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <BackButton fallbackHref={fallbackHref} />
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 pt-8 text-center">
          <h1 className="text-xl font-extrabold">{t('ticket.noReservationTitle')}</h1>
          <p className="mt-2 text-sm font-bold text-[#5B6B75]">
            {t('ticket.noReservationBody')}
          </p>
          <Link
            href={`/event/${event.id}`}
            className="mt-6 rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-[#12202A] ring-1 ring-[#E4EBEE]"
          >
            {t('ticket.toEventDetail')}
          </Link>
          <BackButton
            fallbackHref={fallbackHref}
            className="mt-3 text-[#5B6B75] hover:text-[#12B8D0]"
          />
        </div>
      </main>
    );
  }

  const ended = isEventPast(event);
  const statusLabel = ended ? t('event.statusEnded') : t('ticket.statusJoined');
  const schedule = formatTicketSchedule(event) || t('event.whenUnknown');
  const location = event.location.trim() || t('event.placeUnknown');
  const qty = ticket.ticketQuantity;
  const fee =
    event.priceYen > 0
      ? formatPrice(event.priceYen * qty, t)
      : t('common.free');
  const bookedAt = formatBookedAt(ticket.createdAt);
  const sport = sportLabel(event.sport, t);
  const emoji = sportEmoji(event.sport);

  return (
    <main className="page-main content-fade-in pb-10 pt-4 md:pt-2">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={close}
          className="inline-flex items-center gap-1 text-sm font-extrabold text-[#5B6B75]"
          aria-label={t('common.close')}
        >
          <X size={16} />
          {t('common.close')}
        </button>
        <h1 className="text-base font-extrabold tracking-tight">{t('ticket.title')}</h1>
        <span className="inline-block w-14" aria-hidden />
      </div>

      <p className="mt-4 text-center text-sm font-bold text-[#5B6B75]">
        {t('ticket.lead')}
      </p>

      <article className="card-shadow mt-4 overflow-hidden">
        <div className="brand-gradient flex items-center justify-between gap-3 px-5 py-4">
          <p className="text-xs font-extrabold tracking-[0.12em] text-white/95">
            SPOTTO TICKET
          </p>
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-extrabold text-white">
            {statusLabel}
          </span>
        </div>

        <div className="px-5 pb-6 pt-5">
          <h2 className="text-2xl font-extrabold tracking-tight">{event.title}</h2>
          <p className="mt-1.5 text-sm font-bold text-[#5B6B75]">
            {emoji} {sport}
            {event.level ? ` · ${event.level}` : ''}
          </p>

          <div className="my-4 h-px bg-[#E4EBEE]" />

          <Field label={t('ticket.fieldDateTime')} value={schedule} />
          <div className="mt-3">
            <p className="text-xs font-extrabold text-[#8A9199]">
              {t('ticket.fieldLocation')}
            </p>
            <p className="mt-1 flex items-start gap-1.5 text-base font-extrabold leading-6">
              <MapPin size={16} className="mt-1 shrink-0 text-[#12B8D0]" />
              <span>{location}</span>
            </p>
          </div>
          <Field label={t('ticket.fieldReserver')} value={reserverName} />
          <Field
            label={t('ticket.fieldQuantity')}
            value={t('ticket.quantityValue', { count: qty })}
          />
          <Field label={t('ticket.fieldFee')} value={fee} />
          {bookedAt ? (
            <Field label={t('ticket.fieldBookedAt')} value={bookedAt} />
          ) : null}

          {ended ? (
            <p className="mt-5 text-center text-sm font-bold text-[#5B6B75]">
              {t('ticket.noteEnded')}
            </p>
          ) : null}
        </div>
      </article>

      <div className="mt-5 flex justify-center">
        <Link
          href={`/event/${event.id}`}
          className="rounded-full bg-white px-5 py-3 text-sm font-extrabold text-[#12202A] ring-1 ring-[#E4EBEE]"
          aria-label={t('ticket.openEventA11y')}
        >
          {t('ticket.viewEventDetail')}
        </Link>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-extrabold text-[#8A9199]">{label}</p>
      <p className="mt-1 text-base font-extrabold leading-6">{value}</p>
    </div>
  );
}
