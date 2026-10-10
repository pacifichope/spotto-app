'use client';

import {
  CalendarDays,
  ChevronLeft,
  Clock3,
  MapPin,
  Share2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

import { BookPanel } from '@/app/event/[id]/book-panel';
import { EventAttendeesSection } from '@/components/EventAttendeesSection';
import { navigateBack } from '@/components/BackButton';
import { sportCover, sportEmoji } from '@/constants/theme';
import { clubHref } from '@/lib/clubs';
import { absoluteImageUrl } from '@/lib/eventSeo';
import { sportLabel } from '@/lib/i18n/labels';
import { useLocale, useT } from '@/lib/i18n/locale-context';
import { parseEventBackNav } from '@/lib/mypageNav';
import {
  eventStatusMessageKey,
  getEventStatus,
  type PublicEvent,
} from '@/lib/types';

/** PC でもスマホ詳細と同じ幅に揃える */
const PHONE_FRAME = 'mx-auto w-full max-w-[520px]';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function parseClock(time: string): { h: number; m: number } | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return { h: Number(match[1]), m: Number(match[2]) };
}

function formatClock(time: string) {
  const parsed = parseClock(time);
  if (!parsed) return time.trim() || '—';
  return `${pad2(parsed.h)}:${pad2(parsed.m)}`;
}

function mapsHref(event: PublicEvent) {
  if (event.latitude != null && event.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
  }
  const q = event.location.trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#F4F7F8] text-[#12B8D0]">
      {children}
    </span>
  );
}

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

export function EventDetailView({ event }: { event: PublicEvent }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [descOpen, setDescOpen] = useState(false);

  const photo = absoluteImageUrl(event.imageUri) || sportCover(event.sport);
  const status = getEventStatus(event);
  const sport = sportLabel(event.sport, t) || event.sport;
  const emoji = sportEmoji(event.sport);
  const spotsLeft =
    event.capacity > 0
      ? Math.max(0, event.capacity - event.joinedCount)
      : null;
  const mapUrl = mapsHref(event);
  const start = formatClock(event.eventTime);
  const end = event.endTime.trim() ? formatClock(event.endTime) : null;

  const dateLabel = useMemo(() => {
    const match = event.eventDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return t('event.whenUnknown');
    const value = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    return value.toLocaleDateString(locale === 'en' ? 'en-US' : 'ja-JP', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [event.eventDate, locale, t]);

  const description = event.description.trim();
  const descLong = description.length > 160;
  const descShown =
    descOpen || !descLong ? description : `${description.slice(0, 160).trim()}…`;

  const tags = [
    sport ? `${emoji} ${sport}` : null,
    event.level ? event.level : null,
  ].filter(Boolean) as string[];

  const backNav = parseEventBackNav(searchParams);

  async function onShare() {
    const url =
      typeof window !== 'undefined' ? window.location.href : '';
    const title = event.title || t('event.untitled');
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

  return (
    <main className={`page-main relative pb-44 md:pb-32 ${PHONE_FRAME}`}>
      <div className="overflow-hidden bg-white md:rounded-[28px] md:shadow-[0_16px_48px_rgba(11,26,34,0.12)] md:ring-1 md:ring-[#E4EBEE]">
        {/* Hero */}
        <section className="relative">
          <div className="relative h-[min(62vw,280px)] min-h-[220px] sm:h-72">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-black/25" />

            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-3 sm:px-4 sm:pt-4">
              <button
                type="button"
                onClick={() => navigateBack(router, backNav.href)}
                aria-label={t('common.back')}
                className="grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm"
              >
                <ChevronLeft size={22} strokeWidth={2.6} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => void onShare()}
                aria-label={t('event.share')}
                className="grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm"
              >
                <Share2 size={18} strokeWidth={2.4} aria-hidden />
              </button>
            </div>
          </div>
        </section>

        {/* Content column */}
        <article className="relative -mt-5 rounded-t-[28px] bg-white px-4 pb-8 pt-6 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 text-[1.65rem] font-extrabold leading-tight tracking-tight text-[#12202A]">
              {event.title || t('event.untitled')}
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

          {sport || event.level ? (
            <p className="mt-2 text-sm font-bold text-[#5B6B75]">
              {[sport ? `${emoji} ${sport}` : null, event.level || null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}

          {/* Location */}
          <div className="mt-6 flex items-start gap-3">
            <IconTile>
              <MapPin size={20} strokeWidth={2.4} aria-hidden />
            </IconTile>
            <div className="min-w-0 flex-1">
              <p className="text-base font-extrabold tracking-tight">
                {event.location.trim() || t('event.placeUnknown')}
              </p>
              {mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-sm font-extrabold text-[#12B8D0]"
                >
                  {t('event.findLocation')}
                </a>
              ) : null}
            </div>
          </div>

          {/* Date */}
          <div className="mt-4 flex items-start gap-3">
            <IconTile>
              <CalendarDays size={20} strokeWidth={2.4} aria-hidden />
            </IconTile>
            <p className="pt-2.5 text-base font-extrabold tracking-tight">
              {dateLabel}
            </p>
          </div>

          {/* Start / End */}
          <div className="mt-4 flex items-start gap-3">
            <IconTile>
              <Clock3 size={20} strokeWidth={2.4} aria-hidden />
            </IconTile>
            {end ? (
              <div className="grid min-w-0 flex-1 grid-cols-2 divide-x divide-[#E4EBEE] pt-1">
                <div className="pr-3">
                  <p className="text-[11px] font-bold text-[#8A9199]">
                    {t('event.startTime')}
                  </p>
                  <p className="mt-1 text-sm font-extrabold tracking-tight sm:text-base">
                    {start}
                  </p>
                </div>
                <div className="pl-3">
                  <p className="text-[11px] font-bold text-[#8A9199]">
                    {t('event.endTime')}
                  </p>
                  <p className="mt-1 text-sm font-extrabold tracking-tight sm:text-base">
                    {end}
                  </p>
                </div>
              </div>
            ) : (
              <div className="pt-1">
                <p className="text-[11px] font-bold text-[#8A9199]">
                  {t('event.startTime')}
                </p>
                <p className="mt-1 text-sm font-extrabold tracking-tight sm:text-base">
                  {start}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void onShare()}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#29D1E8] text-sm font-extrabold text-[#12B8D0] transition hover:bg-[#E5F9FC]"
          >
            <Share2 size={16} strokeWidth={2.4} aria-hidden />
            {t('event.inviteFriends')}
          </button>

          {description ? (
            <section className="mt-7">
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

          {(event.hostName || event.hostId) && (
            <section className="mt-7 flex items-center gap-3">
              <OrganizerAvatar
                name={event.hostName || t('common.user')}
                imageUri={event.hostImageUri}
              />
              <div className="min-w-0">
                <p className="text-sm font-extrabold tracking-tight">
                  {t('event.organizedBy', {
                    name: event.hostName || t('common.user'),
                  })}
                </p>
                {event.hostId ? (
                  <Link
                    href={clubHref(event.hostId)}
                    className="mt-0.5 inline-block text-sm font-extrabold text-[#12B8D0]"
                  >
                    {t('event.learnMore')}
                  </Link>
                ) : null}
              </div>
            </section>
          )}

          {tags.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[#F4F7F8] px-3 py-1.5 text-xs font-extrabold text-[#5B6B75]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6">
            <EventAttendeesSection
              eventId={event.id}
              hostId={event.hostId}
              hostName={event.hostName}
              hostImageUri={event.hostImageUri}
              capacity={event.capacity}
              joinedCountFallback={event.joinedCount}
            />
          </div>
        </article>
      </div>

      <BookPanel event={event} />
    </main>
  );
}
