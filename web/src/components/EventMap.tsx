'use client';

import {
  APIProvider,
  AdvancedMarker,
  Map,
  useMap,
} from '@vis.gl/react-google-maps';
import { Clock, MapPin, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  categoryColor,
  resolveEventCoords,
  sportCover,
  sportEmoji,
} from '@/constants/theme';
import { absoluteImageUrl, formatPrice, formatWhen } from '@/lib/eventSeo';
import { googleMapsApiKey } from '@/lib/env';
import type { PublicEvent } from '@/lib/types';

type MappableEvent = PublicEvent & {
  lat: number;
  lng: number;
  approximate: boolean;
};

const DEFAULT_CENTER = { lat: 35.6812, lng: 139.7671 };
const MAP_ID = 'DEMO_MAP_ID';

function toMappable(events: PublicEvent[]): MappableEvent[] {
  return events.flatMap((event) => {
    const coords = resolveEventCoords(event);
    if (!coords) return [];
    return [{ ...event, ...coords }];
  });
}

function FitBounds({ events }: { events: MappableEvent[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || events.length === 0) return;
    if (events.length === 1) {
      map.setCenter({ lat: events[0].lat, lng: events[0].lng });
      map.setZoom(13);
      return;
    }
    const lats = events.map((event) => event.lat);
    const lngs = events.map((event) => event.lng);
    map.fitBounds(
      {
        south: Math.min(...lats),
        west: Math.min(...lngs),
        north: Math.max(...lats),
        east: Math.max(...lngs),
      },
      72,
    );
  }, [map, events]);

  return null;
}

function SportPin({
  id,
  sport,
  selected,
}: {
  id: string;
  sport: string;
  selected: boolean;
}) {
  const accent = categoryColor(sport);
  const fillId = `pin-fill-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <div
      className={`relative flex h-[58px] w-12 items-start justify-center ${selected ? 'z-20 scale-110' : 'z-10'}`}
    >
      <svg width="48" height="58" viewBox="0 0 48 58" aria-hidden>
        <defs>
          <linearGradient id={fillId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={selected ? '#29D1E8' : '#FF9533'} />
            <stop offset="55%" stopColor="#29D1E8" />
            <stop offset="100%" stopColor={selected ? '#FF9533' : '#29D1E8'} />
          </linearGradient>
        </defs>
        <ellipse cx="24" cy="54.5" rx="11" ry="2.6" fill="rgba(15,23,42,0.28)" />
        <path
          d="M24 2.5C13.2 2.5 4.5 11.2 4.5 22c0 12.8 15.4 30.6 18.4 33.9a1.4 1.4 0 0 0 2.2 0C28.1 52.6 43.5 34.8 43.5 22 43.5 11.2 34.8 2.5 24 2.5z"
          fill={selected ? '#29D1E8' : '#12B8D0'}
          stroke="#FFFFFF"
          strokeWidth={selected ? 2.6 : 2.2}
        />
        <path
          d="M24 2.5C13.2 2.5 4.5 11.2 4.5 22c0 12.8 15.4 30.6 18.4 33.9a1.4 1.4 0 0 0 2.2 0C28.1 52.6 43.5 34.8 43.5 22 43.5 11.2 34.8 2.5 24 2.5z"
          fill={`url(#${fillId})`}
          stroke="#FFFFFF"
          strokeWidth={selected ? 2.6 : 2.2}
        />
        <circle cx="24" cy="21.5" r="13.2" fill="#FFFFFF" />
        <circle
          cx="24"
          cy="21.5"
          r="12.2"
          fill={selected ? 'rgba(41,209,232,0.12)' : '#FFFFFF'}
          stroke={accent}
          strokeWidth="1.2"
          strokeOpacity="0.35"
        />
      </svg>
      <span className="pointer-events-none absolute top-[10px] text-[15px] leading-none">
        {sportEmoji(sport)}
      </span>
    </div>
  );
}

function MapPreviewCard({
  event,
  onClose,
}: {
  event: MappableEvent;
  onClose: () => void;
}) {
  const image = absoluteImageUrl(event.imageUri) || sportCover(event.sport);
  const when = formatWhen(event.eventDate, event.eventTime);
  const where = event.location || '場所未定';

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 p-3 md:p-4">
      <div className="pointer-events-auto card-shadow relative mx-auto w-full max-w-xl overflow-hidden p-3.5">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[#E4EBEE]" />
        <button
          type="button"
          aria-label="閉じる"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-[#F4F7F8] text-[#5B6B75]"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
        <Link href={`/event/${event.id}`} className="flex gap-3 pr-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            className="h-[84px] w-[84px] shrink-0 rounded-2xl object-cover bg-[#E5F9FC]"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-extrabold text-[#12B8D0]">
              {[event.sport || 'スポーツ', event.level].filter(Boolean).join(' · ')}
            </p>
            <h2 className="mt-0.5 line-clamp-2 text-base font-extrabold tracking-tight leading-5">
              {event.title}
            </h2>
            <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-[#5B6B75]">
              <Clock size={13} className="shrink-0" />
              <span className="truncate">{when}</span>
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-[#5B6B75]">
              <MapPin size={13} className="shrink-0" />
              <span className="truncate">{where}</span>
            </p>
          </div>
        </Link>
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <p className="text-lg font-extrabold tracking-tight">{formatPrice(event.priceYen)}</p>
          <Link
            href={`/event/${event.id}`}
            className="brand-gradient rounded-full px-4 py-2.5 text-[13px] font-extrabold"
          >
            詳細を見る
          </Link>
        </div>
      </div>
    </div>
  );
}

function GoogleEventMap({ events }: { events: PublicEvent[] }) {
  const mappable = useMemo(() => toMappable(events), [events]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = mappable.find((event) => event.id === selectedId) ?? null;
  const center = mappable[0]
    ? { lat: mappable[0].lat, lng: mappable[0].lng }
    : DEFAULT_CENTER;

  useEffect(() => {
    if (selectedId && !mappable.some((event) => event.id === selectedId)) {
      setSelectedId(null);
    }
  }, [mappable, selectedId]);

  return (
    <div className="card-shadow relative h-[68vh] min-h-[480px] overflow-hidden">
      <Map
        defaultCenter={center}
        defaultZoom={11}
        mapId={MAP_ID}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        className="h-full w-full"
        onClick={() => setSelectedId(null)}
      >
        <FitBounds events={mappable} />
        {mappable.map((event) => (
          <AdvancedMarker
            key={event.id}
            position={{ lat: event.lat, lng: event.lng }}
            onClick={() => setSelectedId(event.id)}
            zIndex={selectedId === event.id ? 20 : 10}
            title={event.title}
          >
            <SportPin id={event.id} sport={event.sport} selected={selectedId === event.id} />
          </AdvancedMarker>
        ))}
      </Map>

      <div className="absolute left-3 top-3 z-20 rounded-full bg-white/95 px-3 py-1 text-[11px] font-extrabold text-[#5B6B75] shadow-sm">
        マップ · {mappable.length}件
        {events.length > mappable.length
          ? `（位置不明 ${events.length - mappable.length}件は非表示）`
          : ''}
      </div>

      {events.length === 0 ? (
        <p className="absolute inset-0 z-20 grid place-items-center bg-white/70 px-6 text-center text-sm font-bold text-[#5B6B75]">
          条件に合うイベントがありません。フィルターを変えてみてください。
        </p>
      ) : mappable.length === 0 ? (
        <p className="absolute inset-0 z-20 grid place-items-center bg-white/70 px-6 text-center text-sm font-bold text-[#5B6B75]">
          表示できる位置情報のあるイベントがありません
        </p>
      ) : null}

      {selected ? (
        <MapPreviewCard event={selected} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}

export function EventMap({ events }: { events: PublicEvent[] }) {
  const apiKey = googleMapsApiKey();

  if (!apiKey) {
    return (
      <div className="card-shadow grid h-[420px] place-items-center px-6 text-center text-sm font-bold text-[#5B6B75]">
        Google Maps を表示するには `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` を設定してください。
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} language="ja" region="JP">
      <GoogleEventMap events={events} />
    </APIProvider>
  );
}
