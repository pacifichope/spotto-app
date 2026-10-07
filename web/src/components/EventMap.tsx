'use client';

import Link from 'next/link';

import { formatPrice } from '@/lib/eventSeo';
import type { PublicEvent } from '@/lib/types';

type PlacedEvent = PublicEvent & { left: number; top: number; hasCoords: boolean };

/** 座標が無いイベントでも同じ位置に安定して置く。 */
function hashUnit(value: string, salt: number) {
  let hash = salt;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function placeEvents(events: PublicEvent[]): PlacedEvent[] {
  const withCoords = events.filter(
    (event) => event.latitude != null && event.longitude != null,
  );
  const withoutCoords = events.filter(
    (event) => event.latitude == null || event.longitude == null,
  );

  const placed: PlacedEvent[] = [];

  if (withCoords.length > 0) {
    const lats = withCoords.map((event) => event.latitude as number);
    const lngs = withCoords.map((event) => event.longitude as number);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = Math.max(maxLat - minLat, 0.01);
    const lngSpan = Math.max(maxLng - minLng, 0.01);

    for (const event of withCoords) {
      placed.push({
        ...event,
        left: 8 + (((event.longitude as number) - minLng) / lngSpan) * 84,
        top: 10 + (1 - ((event.latitude as number) - minLat) / latSpan) * 72,
        hasCoords: true,
      });
    }
  }

  withoutCoords.forEach((event, index) => {
    const columns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(withoutCoords.length))));
    const col = index % columns;
    const row = Math.floor(index / columns);
    const jitterX = hashUnit(event.id, 17) * 6;
    const jitterY = hashUnit(event.id, 41) * 6;
    placed.push({
      ...event,
      left: 12 + (col / Math.max(columns - 1, 1)) * 76 + jitterX,
      top: 18 + row * 14 + jitterY,
      hasCoords: false,
    });
  });

  return placed;
}

export function EventMap({ events }: { events: PublicEvent[] }) {
  const placed = placeEvents(events);

  return (
    <div className="card-shadow relative h-[68vh] min-h-[420px] overflow-hidden bg-[#c9ebe6]">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            'linear-gradient(rgba(18,184,208,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(18,184,208,0.2) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="pointer-events-none absolute left-[6%] right-[10%] top-[42%] h-4 -rotate-6 rounded-full bg-white/70" />
      <div className="pointer-events-none absolute bottom-[14%] left-[22%] top-[10%] w-4 rotate-12 rounded-full bg-white/70" />
      <div className="pointer-events-none absolute right-[18%] top-[20%] h-24 w-24 rounded-full bg-[#7EEAF2]/40" />
      <div className="pointer-events-none absolute bottom-[22%] left-[12%] h-20 w-32 rounded-[40%] bg-[#A8E8D8]/50" />

      <div className="absolute left-3 top-3 z-20 rounded-full bg-white/95 px-3 py-1 text-[11px] font-extrabold text-[#5B6B75] shadow-sm">
        マップ表示 · {events.length}件
      </div>

      {placed.map((event) => (
        <Link
          key={event.id}
          href={`/event/${event.id}`}
          className="group absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center"
          style={{ left: `${event.left}%`, top: `${event.top}%` }}
          title={event.title}
        >
          <span className="brand-gradient max-w-[160px] truncate rounded-full px-2.5 py-1 text-[11px] font-extrabold shadow-md">
            {formatPrice(event.priceYen)}
          </span>
          <span className="mt-1 max-w-[160px] truncate rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-extrabold text-[#12202A] shadow-sm">
            {event.title}
          </span>
          <span className="brand-gradient mt-1 h-3 w-3 rotate-45 rounded-sm shadow" aria-hidden />
        </Link>
      ))}

      {events.length === 0 ? (
        <p className="absolute inset-0 z-20 grid place-items-center px-6 text-center text-sm font-bold text-[#5B6B75]">
          条件に合うイベントがありません。フィルターを変えてみてください。
        </p>
      ) : null}
    </div>
  );
}
