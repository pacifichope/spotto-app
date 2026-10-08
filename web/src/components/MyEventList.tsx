'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { EventCard } from '@/components/EventCard';
import { useT } from '@/lib/i18n/locale-context';
import { eventDetailHref, type EventNavFrom } from '@/lib/mypageNav';
import { ticketHref } from '@/lib/ticket';
import type { PublicEvent } from '@/lib/types';

export function MyEventList({
  events,
  emptyTitle,
  emptyBody,
  emptyAction,
  eventFrom,
  openTicket,
}: {
  events: PublicEvent[];
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: ReactNode;
  /** 詳細→戻るでマイページの mode/segment を復元するとき渡す */
  eventFrom?: EventNavFrom;
  /** 参加予定・履歴など、カードからチケット画面を開く */
  openTicket?: boolean;
}) {
  const t = useT();
  if (events.length === 0) {
    return (
      <section className="card-shadow mt-4 px-5 py-10 text-center">
        <p className="text-base font-extrabold tracking-tight">{emptyTitle}</p>
        <p className="mt-2 text-sm font-bold leading-6 text-[#5B6B75]">{emptyBody}</p>
        {emptyAction ?? (
          <Link
            href="/"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-extrabold text-[#12B8D0] shadow-sm ring-1 ring-[#E4EBEE]"
          >
            {t('common.findEvents')}
          </Link>
        )}
      </section>
    );
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          href={eventDetailHref(event.id, eventFrom)}
          ticketHref={openTicket ? ticketHref(event.id) : undefined}
        />
      ))}
    </div>
  );
}
