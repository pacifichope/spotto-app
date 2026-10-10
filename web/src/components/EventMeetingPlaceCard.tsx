'use client';

import { MapPin } from 'lucide-react';

import { googleMapsApiKey } from '@/lib/env';
import { useT } from '@/lib/i18n/locale-context';
import type { PublicEvent } from '@/lib/types';

function mapsHref(event: PublicEvent) {
  if (event.latitude != null && event.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
  }
  const q = event.location.trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** マーカー無し。CSS ピンを中央オーバーレイして先端位置を揃える */
function staticMapSrc(lat: number, lng: number, key: string) {
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: '15',
    size: '640x296',
    scale: '2',
    maptype: 'roadmap',
    key,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function EventMeetingPlaceCard({ event }: { event: PublicEvent }) {
  const t = useT();
  const href = mapsHref(event);
  const key = googleMapsApiKey();
  const hasCoords = event.latitude != null && event.longitude != null;
  const mapSrc =
    hasCoords && key
      ? staticMapSrc(event.latitude!, event.longitude!, key)
      : null;

  return (
    <section className="rounded-3xl bg-white p-4 ring-1 ring-[#E4EBEE] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E5F9FC] text-[#12B8D0]">
          <MapPin size={16} strokeWidth={2.4} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-[#8A9199]">
            {t('event.meetingPlace')}
          </p>
          <p className="mt-0.5 text-base font-extrabold tracking-tight text-[#12202A]">
            {event.location.trim() || t('event.placeUnknown')}
          </p>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm font-extrabold text-[#12B8D0]"
            >
              {t('event.tapToOpenMap')}
            </a>
          ) : null}
        </div>
      </div>

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block overflow-hidden rounded-2xl ring-1 ring-[#E4EBEE]"
          aria-label={t('event.openMapAria')}
        >
          {mapSrc ? (
            <div className="relative h-[168px] w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mapSrc}
                alt=""
                className="h-full w-full object-cover"
              />
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-[70%] place-items-center rounded-full bg-[#12B8D0] text-white shadow-md ring-2 ring-white"
                aria-hidden
              >
                <MapPin size={18} strokeWidth={2.6} />
              </span>
            </div>
          ) : (
            <div className="grid h-[168px] place-items-center bg-[#E5F9FC] text-sm font-extrabold text-[#12B8D0]">
              {t('event.tapToOpenMap')}
            </div>
          )}
        </a>
      ) : null}
    </section>
  );
}
