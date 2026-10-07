import Link from 'next/link';

import { formatPrice } from '@/lib/eventSeo';
import type { PublicEvent } from '@/lib/types';

type PlacedEvent = PublicEvent & { left: number; top: number };

function placeEvents(events: PublicEvent[]): { placed: PlacedEvent[]; hidden: number } {
  const located = events.filter(
    (event) => event.latitude != null && event.longitude != null,
  );
  if (located.length === 0) return { placed: [], hidden: events.length };

  const lats = located.map((event) => event.latitude as number);
  const lngs = located.map((event) => event.longitude as number);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 1;
  const lngSpan = maxLng - minLng || 1;

  return {
    placed: located.map((event) => ({
      ...event,
      left: 10 + (((event.longitude as number) - minLng) / lngSpan) * 80,
      top: 10 + (1 - ((event.latitude as number) - minLat) / latSpan) * 76,
    })),
    hidden: events.length - located.length,
  };
}

export function EventMap({ events }: { events: PublicEvent[] }) {
  const { placed, hidden } = placeEvents(events);

  return (
    <div className="card-shadow relative h-[68vh] min-h-[420px] overflow-hidden bg-[#d7f3ef]">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(rgba(18,184,208,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(18,184,208,0.18) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="absolute left-[8%] right-[12%] top-[38%] h-3 -rotate-6 rounded-full bg-white/80" />
      <div className="absolute bottom-[18%] left-[18%] top-[12%] w-3 rotate-12 rounded-full bg-white/80" />
      {placed.map((event) => (
        <Link
          key={event.id}
          href={`/event/${event.id}`}
          className="absolute z-10 max-w-[180px] -translate-x-1/2 -translate-y-full"
          style={{ left: `${event.left}%`, top: `${event.top}%` }}
          title={event.title}
        >
          <span className="brand-gradient block rounded-full px-2.5 py-1 text-[11px] font-extrabold shadow-md">
            {formatPrice(event.priceYen)}
          </span>
          <span className="mt-1 block truncate text-[11px] font-extrabold text-[#12202A]">
            {event.title}
          </span>
        </Link>
      ))}
      {placed.length === 0 ? (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm font-bold text-[#5B6B75]">
          位置情報のあるイベントがありません
        </p>
      ) : null}
      {hidden > 0 ? (
        <p className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#5B6B75]">
          位置情報がないイベント {hidden}件は地図に出ていません
        </p>
      ) : null}
    </div>
  );
}
