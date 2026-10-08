'use client';

import { Clock, MapPin, Ticket } from 'lucide-react';
import Link from 'next/link';

import { sportCover } from '@/constants/theme';
import { absoluteImageUrl, formatPrice, formatWhen } from '@/lib/eventSeo';
import { sportLabel } from '@/lib/i18n/labels';
import { useT } from '@/lib/i18n/locale-context';
import {
  eventStatusMessageKey,
  getEventStatus,
  type PublicEvent,
} from '@/lib/types';

export function EventCard({
  event,
  href,
  ticketHref,
}: {
  event: PublicEvent;
  /** 省略時は /event/:id。マイページからは from 付き URL を渡す */
  href?: string;
  /** 指定時は「チケットを見る」ボタンを表示し、カード本体もチケットへ */
  ticketHref?: string;
}) {
  const t = useT();
  const image = absoluteImageUrl(event.imageUri) || sportCover(event.sport);
  const status = getEventStatus(event);
  const ended = status === 'ended';
  const when = formatWhen(event.eventDate, event.eventTime, t) || t('event.whenUnknown');
  const where = event.location || t('event.placeUnknown');
  const detailHref = href ?? `/event/${event.id}`;
  const primaryHref = ticketHref || detailHref;
  const sport = sportLabel(event.sport, t);
  const title = event.title.trim() || t('event.untitled');

  return (
    <article
      className={`card-shadow overflow-hidden transition ${
        ended ? 'opacity-60 grayscale-[0.35]' : ''
      }`}
    >
      <Link href={primaryHref} className="block">
        <div className="relative h-40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            className={`h-full w-full object-cover ${ended ? 'brightness-95' : ''}`}
          />
          <span
            className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-extrabold text-white ${
              status === 'open'
                ? 'brand-gradient'
                : status === 'ended'
                  ? 'bg-[#94A3B8]'
                  : 'bg-[#8A9199]'
            }`}
          >
            {ticketHref && !ended
              ? t('ticket.statusJoined')
              : t(eventStatusMessageKey(status))}
          </span>
        </div>
        <div className={`px-4 pb-3 pt-3 ${ended ? 'text-[#5B6B75]' : ''}`}>
          <p
            className={`text-[11px] font-extrabold ${
              ended ? 'text-[#8A9199]' : 'text-[#12B8D0]'
            }`}
          >
            {[sport || t('sport.generic'), event.level].filter(Boolean).join(' · ')}
          </p>
          <h2 className="mt-1 line-clamp-2 text-base font-extrabold tracking-tight">
            {title}
          </h2>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#5B6B75]">
            <Clock size={13} className="shrink-0" />
            <span className="truncate">{when}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#5B6B75]">
            <MapPin size={13} className="shrink-0" />
            <span className="truncate">{where}</span>
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-lg font-extrabold tracking-tight">
              {event.capacity > 0
                ? `${event.joinedCount}/${event.capacity}`
                : event.joinedCount}
              {t('event.peopleSuffix') || t('common.people')}
            </p>
            <span
              className={`rounded-full px-4 py-2.5 text-[13px] font-extrabold ${
                ended ? 'bg-[#F1F5F9] text-[#64748B]' : 'brand-gradient'
              }`}
            >
              {formatPrice(event.priceYen, t)}
            </span>
          </div>
        </div>
      </Link>
      {ticketHref ? (
        <div className="border-t border-[#E4EBEE] px-4 py-3">
          <Link
            href={ticketHref}
            className="brand-gradient flex h-10 w-full items-center justify-center gap-1.5 rounded-full text-sm font-extrabold"
          >
            <Ticket size={15} strokeWidth={2.4} />
            {t('ticket.viewTicket')}
          </Link>
        </div>
      ) : null}
    </article>
  );
}
