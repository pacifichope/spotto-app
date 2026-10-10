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

/** 開始の15分前を集合目安にする（フィールドが無い場合のスマート表示） */
function arriveByTime(startTime: string) {
  const parsed = parseClock(startTime);
  if (!parsed) return null;
  const total = parsed.h * 60 + parsed.m - 15;
  if (total < 0) return formatClock(startTime);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
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
  const arrive = arriveByTime(event.eventTime);
  const start = formatClock(event.eventTime);
  const end = event.endTime ? formatClock(event.endTime) : '—';

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
    <main className="page-main relative pb-36 lg:pb-10">
      {/* Full-bleed hero（AppShell の上下余白を打ち消す） */}
      <section className="relative -mx-4 -mt-3 overflow-hidden md:-mx-7 md:-mt-6">
        <div className="relative h-[min(58vw,320px)] min-h-[240px] sm:h-80 md:h-[420px] md:rounded-b-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/20" />

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

          <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight text-white drop-shadow sm:text-3xl">
                {event.title || t('event.untitled')}
              </h1>
              {sport ? (
                <p className="mt-1 text-sm font-bold text-white/90">
                  {emoji} {sport}
                </p>
              ) : null}
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${
                status === 'open'
                  ? 'bg-white/95 text-[#12B8D0] ring-1 ring-[#29D1E8]/50'
                  : status === 'ended'
                    ? 'bg-white/90 text-[#5B6B75]'
                    : 'bg-white/90 text-[#8A9199]'
              }`}
            >
              {status === 'open' && spotsLeft != null
                ? t('event.spotsLeft', { count: spotsLeft })
                : t(eventStatusMessageKey(status))}
            </span>
          </div>
        </div>
      </section>

      <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.95fr)] lg:items-start lg:gap-6">
        <article className="pt-5">
          {/* Location */}
          <div className="flex items-start gap-3">
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

          {/* Arrive / Start / End */}
          <div className="mt-4 flex items-start gap-3">
            <IconTile>
              <Clock3 size={20} strokeWidth={2.4} aria-hidden />
            </IconTile>
            <div className="grid min-w-0 flex-1 grid-cols-3 divide-x divide-[#E4EBEE] pt-1">
              <div className="px-2 first:pl-0 sm:px-3">
                <p className="text-[11px] font-bold text-[#8A9199]">
                  {t('event.arriveBy')}
                </p>
                <p className="mt-1 text-sm font-extrabold tracking-tight sm:text-base">
                  {arrive || '—'}
                </p>
              </div>
              <div className="px-2 sm:px-3">
                <p className="text-[11px] font-bold text-[#8A9199]">
                  {t('event.startTime')}
                </p>
                <p className="mt-1 text-sm font-extrabold tracking-tight sm:text-base">
                  {start}
                </p>
              </div>
              <div className="px-2 sm:px-3">
                <p className="text-[11px] font-bold text-[#8A9199]">
                  {t('event.endTime')}
                </p>
                <p className="mt-1 text-sm font-extrabold tracking-tight sm:text-base">
                  {end}
                </p>
              </div>
            </div>
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

          {/* Organizer */}
          {(event.hostName || event.hostId) && (
            <section className="mt-7 flex items-center gap-3">
              <span className="brand-gradient grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-extrabold text-white">
                {(event.hostName || t('common.user')).trim().slice(0, 1)}
              </span>
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
              capacity={event.capacity}
              joinedCountFallback={event.joinedCount}
            />
          </div>
        </article>

        <BookPanel event={event} />
      </div>
    </main>
  );
}
