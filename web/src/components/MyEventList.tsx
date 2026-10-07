import Link from 'next/link';

import { EventCard } from '@/components/EventCard';
import type { PublicEvent } from '@/lib/types';

export function MyEventList({
  events,
  emptyTitle,
  emptyBody,
}: {
  events: PublicEvent[];
  emptyTitle: string;
  emptyBody: string;
}) {
  if (events.length === 0) {
    return (
      <section className="card-shadow mt-4 px-5 py-10 text-center">
        <p className="text-base font-extrabold tracking-tight">{emptyTitle}</p>
        <p className="mt-2 text-sm font-bold leading-6 text-[#5B6B75]">{emptyBody}</p>
        <Link
          href="/"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-extrabold text-[#12B8D0] shadow-sm ring-1 ring-[#E4EBEE]"
        >
          イベントを探す
        </Link>
      </section>
    );
  }

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
