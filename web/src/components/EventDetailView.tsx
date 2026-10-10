'use client';

import { ChevronLeft, Heart, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { BookPanel } from '@/app/event/[id]/book-panel';
import { EventAttendeesSection } from '@/components/EventAttendeesSection';
import { EventImageCarousel } from '@/components/EventImageCarousel';
import { EventMeetingPlaceCard } from '@/components/EventMeetingPlaceCard';
import { EventScheduleCard } from '@/components/EventScheduleCard';
import { navigateBack } from '@/components/BackButton';
import { sportCover, sportEmoji } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { clubHref } from '@/lib/clubs';
import { absoluteImageUrl } from '@/lib/eventSeo';
import {
  addFavorite,
  fetchFavoriteEventIds,
  removeFavorite,
} from '@/lib/favorites';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { sportLabel } from '@/lib/i18n/labels';
import { useT } from '@/lib/i18n/locale-context';
import { parseEventBackNav } from '@/lib/mypageNav';
import {
  eventStatusMessageKey,
  getEventStatus,
  type PublicEvent,
} from '@/lib/types';

/** PC でもスマホ詳細と同じ幅に揃える */
const PHONE_FRAME = 'mx-auto w-full max-w-[520px]';

function OrganizerAvatar({
  name,
  imageUri,
}: {
  name: string;
  imageUri?: string | null;
}) {
  const src = absoluteImageUrl(imageUri ?? null);
  const initial = name.trim().slice(0, 1) || '?';
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-[#E4EBEE]"
      />
    );
  }
  return (
    <span className="brand-gradient grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-extrabold text-white">
      {initial}
    </span>
  );
}

function cancelPolicyLabel(event: PublicEvent, fallback: string) {
  const raw = event.cancelPolicy?.trim();
  if (!raw) return fallback;
  return raw;
}

export function EventDetailView({
  event,
  occurrenceEvents = [],
}: {
  event: PublicEvent;
  occurrenceEvents?: PublicEvent[];
}) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [descOpen, setDescOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState(event);
  const [favorited, setFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteMsg, setFavoriteMsg] = useState('');

  const photo =
    absoluteImageUrl(activeEvent.imageUri) || sportCover(activeEvent.sport);
  const galleryUris =
    activeEvent.imageUris?.length > 0
      ? activeEvent.imageUris
      : activeEvent.imageUri
        ? [activeEvent.imageUri]
        : [];
  const status = getEventStatus(activeEvent);
  const sport = sportLabel(activeEvent.sport, t) || activeEvent.sport;
  const emoji = sportEmoji(activeEvent.sport);
  const spotsLeft =
    activeEvent.capacity > 0
      ? Math.max(0, activeEvent.capacity - activeEvent.joinedCount)
      : null;

  const description = activeEvent.description.trim();
  const descLong = description.length > 160;
  const descShown =
    descOpen || !descLong ? description : `${description.slice(0, 160).trim()}…`;

  const tags = [
    sport ? `${emoji} ${sport}` : null,
    activeEvent.level ? activeEvent.level : null,
  ].filter(Boolean) as string[];

  const backNav = parseEventBackNav(searchParams);
  const occurrences = useMemo(() => {
    if (occurrenceEvents.length > 1) return occurrenceEvents;
    return [event];
  }, [event, occurrenceEvents]);

  useEffect(() => {
    setActiveEvent(event);
  }, [event]);

  useEffect(() => {
    if (!user) {
      setFavorited(false);
      return;
    }
    let cancelled = false;
    void fetchFavoriteEventIds({
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
    })
      .then((ids) => {
        if (cancelled) return;
        const id = activeEvent.id.trim().toLowerCase();
        setFavorited(ids.some((item) => item.trim().toLowerCase() === id));
      })
      .catch(() => {
        if (!cancelled) setFavorited(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, activeEvent.id]);

  async function onShare() {
    const url =
      typeof window !== 'undefined' ? window.location.href : '';
    const title = activeEvent.title || t('event.untitled');
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore cancel */
    }
  }

  async function onToggleFavorite() {
    if (!user) {
      setFavoriteMsg(t('event.favoriteLogin'));
      return;
    }
    if (favoriteBusy) return;
    setFavoriteBusy(true);
    setFavoriteMsg('');
    const next = !favorited;
    setFavorited(next);
    try {
      const getIdToken = async () => idTokenWithAuthenticatedRole(user);
      if (next) {
        await addFavorite({
          userId: user.uid,
          eventId: activeEvent.id,
          getIdToken,
        });
      } else {
        await removeFavorite({
          userId: user.uid,
          eventId: activeEvent.id,
          getIdToken,
        });
      }
    } catch {
      setFavorited(!next);
      setFavoriteMsg(t('event.favoriteFailed'));
    } finally {
      setFavoriteBusy(false);
    }
  }

  function onSelectOccurrence(nextId: string) {
    const next = occurrences.find((item) => item.id === nextId);
    if (!next) return;
    setActiveEvent(next);
    if (next.id === event.id) return;
    const qs = searchParams.toString();
    router.replace(qs ? `/event/${next.id}?${qs}` : `/event/${next.id}`, {
      scroll: false,
    });
  }

  return (
    <main className={`page-main relative pb-44 md:pb-32 ${PHONE_FRAME}`}>
      <div className="overflow-hidden bg-white md:rounded-[28px] md:shadow-[0_16px_48px_rgba(11,26,34,0.12)] md:ring-1 md:ring-[#E4EBEE]">
        <section className="relative">
          <EventImageCarousel
            uris={galleryUris}
            fallbackUri={photo}
            className="relative h-[min(62vw,280px)] min-h-[220px] sm:h-72"
          >
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-3 sm:px-4 sm:pt-4">
              <button
                type="button"
                onClick={() => navigateBack(router, backNav.href)}
                aria-label={t('common.back')}
                className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm"
              >
                <ChevronLeft size={22} strokeWidth={2.6} aria-hidden />
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onToggleFavorite()}
                  disabled={favoriteBusy}
                  aria-label={
                    favorited
                      ? t('event.favoriteRemove')
                      : t('event.favoriteAdd')
                  }
                  aria-pressed={favorited}
                  className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm disabled:opacity-60"
                >
                  <Heart
                    size={18}
                    strokeWidth={2.4}
                    fill={favorited ? '#FF5A7A' : 'none'}
                    color={favorited ? '#FF5A7A' : '#FFFFFF'}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  onClick={() => void onShare()}
                  aria-label={t('event.share')}
                  className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm"
                >
                  <Share2 size={18} strokeWidth={2.4} aria-hidden />
                </button>
              </div>
            </div>
          </EventImageCarousel>
        </section>

        <article className="relative -mt-5 space-y-4 rounded-t-[28px] bg-[#F7FBFC] px-4 pb-8 pt-6 sm:px-5">
          {favoriteMsg ? (
            <p className="text-center text-xs font-bold text-[#EF4444]">
              {favoriteMsg}
            </p>
          ) : null}

          <div className="rounded-3xl bg-white px-4 py-5 ring-1 ring-[#E4EBEE] sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <h1 className="min-w-0 text-[1.65rem] font-extrabold leading-tight tracking-tight text-[#12202A]">
                {activeEvent.title || t('event.untitled')}
              </h1>
              <span
                className={`mt-1 shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${
                  status === 'open'
                    ? 'bg-[#E5F9FC] text-[#12B8D0] ring-1 ring-[#29D1E8]/40'
                    : status === 'ended'
                      ? 'bg-[#F4F7F8] text-[#5B6B75]'
                      : 'bg-[#F4F7F8] text-[#8A9199]'
                }`}
              >
                {status === 'open' && spotsLeft != null
                  ? t('event.spotsLeft', { count: spotsLeft })
                  : t(eventStatusMessageKey(status))}
              </span>
            </div>

            {sport || activeEvent.level ? (
              <p className="mt-2 text-sm font-bold text-[#5B6B75]">
                {[sport ? `${emoji} ${sport}` : null, activeEvent.level || null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
          </div>

          <EventScheduleCard
            event={activeEvent}
            occurrenceEvents={occurrences}
            cancelPolicyText={cancelPolicyLabel(
              activeEvent,
              t('event.cancelAnytime'),
            )}
            onSelectEventId={onSelectOccurrence}
          />

          <EventMeetingPlaceCard event={activeEvent} />

          <button
            type="button"
            onClick={() => void onShare()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#29D1E8] bg-white text-sm font-extrabold text-[#12B8D0] transition hover:bg-[#E5F9FC]"
          >
            <Share2 size={16} strokeWidth={2.4} aria-hidden />
            {t('event.inviteFriends')}
          </button>

          {description ? (
            <section className="rounded-3xl bg-white p-4 ring-1 ring-[#E4EBEE] sm:p-5">
              <h2 className="text-base font-extrabold tracking-tight">
                {t('event.description')}
              </h2>
              <p className="mt-2 text-sm font-medium leading-7 text-[#5B6B75]">
                {descShown}
              </p>
              {descLong ? (
                <button
                  type="button"
                  onClick={() => setDescOpen((v) => !v)}
                  className="mt-1 text-sm font-extrabold text-[#12B8D0]"
                >
                  {descOpen ? t('event.readLess') : t('event.readMore')}
                </button>
              ) : null}
            </section>
          ) : null}

          {(activeEvent.hostName || activeEvent.hostId) && (
            <section className="flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-[#E4EBEE] sm:p-5">
              <OrganizerAvatar
                name={activeEvent.hostName || t('common.user')}
                imageUri={activeEvent.hostImageUri}
              />
              <div className="min-w-0">
                <p className="text-sm font-extrabold tracking-tight">
                  {t('event.organizedBy', {
                    name: activeEvent.hostName || t('common.user'),
                  })}
                </p>
                {activeEvent.hostId ? (
                  <Link
                    href={clubHref(activeEvent.hostId)}
                    className="mt-0.5 inline-block text-sm font-extrabold text-[#12B8D0]"
                  >
                    {t('event.learnMore')}
                  </Link>
                ) : null}
              </div>
            </section>
          )}

          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[#5B6B75] ring-1 ring-[#E4EBEE]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <EventAttendeesSection
            eventId={activeEvent.id}
            hostId={activeEvent.hostId}
            hostName={activeEvent.hostName}
            hostImageUri={activeEvent.hostImageUri}
            capacity={activeEvent.capacity}
            joinedCountFallback={activeEvent.joinedCount}
          />
        </article>
      </div>

      <BookPanel event={activeEvent} />
    </main>
  );
}
