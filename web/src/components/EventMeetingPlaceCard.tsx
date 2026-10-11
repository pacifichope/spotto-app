'use client';

import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';
import { type ReactNode } from 'react';

import { googleMapsApiKey } from '@/lib/env';
import { useLocale, useT } from '@/lib/i18n/locale-context';
import type { PublicEvent } from '@/lib/types';

const MAP_HEIGHT_PX = 168;

function mapsHref(event: PublicEvent) {
  if (event.latitude != null && event.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
  }
  const q = event.location.trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Google Maps Embed API（ピン付き。Maps JavaScript API キーが Embed にも有効な想定） */
function googleEmbedApiSrc(query: string, apiKey: string, language: string) {
  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    zoom: '15',
    language,
    maptype: 'roadmap',
  });
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
}

function MeetingPlaceGoogleMap({
  lat,
  lng,
  apiKey,
  language,
}: {
  lat: number;
  lng: number;
  apiKey: string;
  language: string;
}) {
  const center = { lat, lng };

  return (
    <APIProvider apiKey={apiKey} language={language} region="JP">
      <Map
        defaultCenter={center}
        defaultZoom={15}
        disableDefaultUI
        gestureHandling="none"
        keyboardShortcuts={false}
        clickableIcons={false}
        style={{
          width: '100%',
          height: MAP_HEIGHT_PX,
          minHeight: MAP_HEIGHT_PX,
        }}
      >
        <Marker position={center} />
      </Map>
    </APIProvider>
  );
}

function MeetingPlaceGoogleIframe({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  return (
    <iframe
      title={title}
      src={src}
      width="100%"
      height={MAP_HEIGHT_PX}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
      className="pointer-events-none block border-0"
      style={{
        width: '100%',
        height: MAP_HEIGHT_PX,
        minHeight: MAP_HEIGHT_PX,
      }}
    />
  );
}

export function EventMeetingPlaceCard({ event }: { event: PublicEvent }) {
  const t = useT();
  const { locale } = useLocale();
  const href = mapsHref(event);
  const apiKey = googleMapsApiKey();
  const language = locale === 'en' ? 'en' : 'ja';
  const hasCoords = event.latitude != null && event.longitude != null;
  const locationQuery = event.location.trim();

  let mapBody: ReactNode = null;
  if (hasCoords && apiKey) {
    // アプリ版と同様: Google Maps JavaScript API + ピン
    mapBody = (
      <MeetingPlaceGoogleMap
        lat={event.latitude!}
        lng={event.longitude!}
        apiKey={apiKey}
        language={language}
      />
    );
  } else if (apiKey && (hasCoords || locationQuery)) {
    const q = hasCoords
      ? `${event.latitude},${event.longitude}`
      : locationQuery;
    mapBody = (
      <MeetingPlaceGoogleIframe
        src={googleEmbedApiSrc(q, apiKey, language)}
        title={t('event.openMapAria')}
      />
    );
  }

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
            {locationQuery || t('event.placeUnknown')}
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
          className="mt-4 block overflow-hidden rounded-2xl bg-[#E5F9FC] ring-1 ring-[#E4EBEE]"
          aria-label={t('event.openMapAria')}
          style={{ height: MAP_HEIGHT_PX }}
        >
          {mapBody ? (
            <div
              className="pointer-events-none relative w-full overflow-hidden"
              style={{ height: MAP_HEIGHT_PX, minHeight: MAP_HEIGHT_PX }}
            >
              {mapBody}
            </div>
          ) : (
            <div
              className="grid place-items-center px-4 text-center text-sm font-extrabold text-[#12B8D0]"
              style={{ height: MAP_HEIGHT_PX }}
            >
              {apiKey ? t('event.tapToOpenMap') : t('map.missingKey')}
            </div>
          )}
        </a>
      ) : null}
    </section>
  );
}
