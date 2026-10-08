'use client';

import {
  APIProvider,
  AdvancedMarker,
  Map,
  useMap,
} from '@vis.gl/react-google-maps';
import { Clock, LocateFixed, MapPin, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';

import {
  categoryColor,
  resolveEventCoords,
  sportCover,
  sportEmoji,
} from '@/constants/theme';
import { absoluteImageUrl, formatPrice, formatWhen } from '@/lib/eventSeo';
import { googleMapsApiKey } from '@/lib/env';
import { sportLabel } from '@/lib/i18n/labels';
import { useLocale, useT } from '@/lib/i18n/locale-context';
import {
  eventStatusMessageKey,
  getEventStatus,
  type PublicEvent,
} from '@/lib/types';
import {
  FALLBACK_COORDS,
  mapBoundsMovedSignificantly,
  toMapLatLng,
  type LatLng,
  type MapBoundsLiteral,
} from '@/lib/userLocation';

type MappableEvent = PublicEvent & {
  lat: number;
  lng: number;
  approximate: boolean;
};

const DEFAULT_CENTER = toMapLatLng(FALLBACK_COORDS);
const MAP_ID = 'DEMO_MAP_ID';
/** nearby 用 delta ≈ 0.32 に相当するズーム目安 */
const NEARBY_ZOOM = 11;

export type EventMapProps = {
  events: PublicEvent[];
  /** マップの中心（現在地 or エリア）。未指定時はフォールバック */
  center?: { lat: number; lng: number };
  /** ユーザー現在地（ドット表示用）。無いときは非表示 */
  userCoords?: LatLng | null;
  locating?: boolean;
  /** 「現在地へ」ボタン。未指定ならボタン非表示 */
  onRecenter?: () => void;
  /**
   * true のときイベント全体への FitBounds を行わず center を優先。
   * 現在地モードやエリア選択時に使う。
   */
  preferCenter?: boolean;
  /** 増やすたびに現在地（center）へ強制パン */
  recenterKey?: number;
  /** 「このエリアで再検索」確定時 */
  onSearchArea?: (bounds: MapBoundsLiteral) => void;
};

function toMappable(events: PublicEvent[]): MappableEvent[] {
  return events.flatMap((event) => {
    const coords = resolveEventCoords(event);
    if (!coords) return [];
    return [{ ...event, ...coords }];
  });
}

function boundsFromMap(map: google.maps.Map): MapBoundsLiteral | null {
  const bounds = map.getBounds();
  if (!bounds) return null;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  return {
    north: ne.lat(),
    east: ne.lng(),
    south: sw.lat(),
    west: sw.lng(),
  };
}

function MapCamera({
  center,
  preferCenter,
  recenterKey = 0,
  onProgrammaticMove,
}: {
  center: { lat: number; lng: number };
  preferCenter: boolean;
  recenterKey?: number;
  onProgrammaticMove?: () => void;
}) {
  const map = useMap();

  // 現在地／エリア中心を優先（アプリ版 applyArea のカメラ合わせに相当）
  useEffect(() => {
    if (!map || !preferCenter) return;
    onProgrammaticMove?.();
    map.panTo(center);
    map.setZoom(NEARBY_ZOOM);
  }, [map, preferCenter, center.lat, center.lng, onProgrammaticMove]);

  // 現在地ボタン：同じモードでも必ず中心へ戻す
  useEffect(() => {
    if (!map || recenterKey <= 0) return;
    onProgrammaticMove?.();
    map.panTo(center);
    map.setZoom(NEARBY_ZOOM);
  }, [map, recenterKey, center.lat, center.lng, onProgrammaticMove]);

  return null;
}

/** Map 内で idle を監視し、再検索ボタンの表示状態を親へ渡す */
function MapIdleBridge({
  onPromptChange,
  skipIdleRef,
}: {
  onPromptChange: (next: {
    show: boolean;
    bounds: MapBoundsLiteral | null;
    commit: () => void;
  }) => void;
  skipIdleRef: MutableRefObject<boolean>;
}) {
  const map = useMap();
  const committedRef = useRef<MapBoundsLiteral | null>(null);
  const idleBoundsRef = useRef<MapBoundsLiteral | null>(null);
  const onPromptChangeRef = useRef(onPromptChange);
  onPromptChangeRef.current = onPromptChange;

  useEffect(() => {
    if (!map) return;

    const handleIdle = () => {
      const bounds = boundsFromMap(map);
      if (!bounds) return;
      idleBoundsRef.current = bounds;

      if (skipIdleRef.current) {
        skipIdleRef.current = false;
        committedRef.current = bounds;
        onPromptChangeRef.current({
          show: false,
          bounds,
          commit: () => undefined,
        });
        return;
      }

      if (!committedRef.current) {
        committedRef.current = bounds;
        onPromptChangeRef.current({
          show: false,
          bounds,
          commit: () => undefined,
        });
        return;
      }

      const moved = mapBoundsMovedSignificantly(committedRef.current, bounds);
      onPromptChangeRef.current({
        show: moved,
        bounds,
        commit: () => {
          committedRef.current = bounds;
          onPromptChangeRef.current({
            show: false,
            bounds,
            commit: () => undefined,
          });
        },
      });
    };

    const listener = map.addListener('idle', handleIdle);
    handleIdle();
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, skipIdleRef]);

  return null;
}

function UserLocationDot({ coords }: { coords: LatLng }) {
  return (
    <AdvancedMarker position={toMapLatLng(coords)} title="current-location" zIndex={30}>
      <div className="relative h-5 w-5" aria-hidden>
        <span className="absolute inset-0 rounded-full bg-[#29D1E8]/40 animate-ping" />
        <span className="absolute inset-[3px] rounded-full border-2 border-white bg-[#12B8D0] shadow" />
      </div>
    </AdvancedMarker>
  );
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
  const t = useT();
  const image = absoluteImageUrl(event.imageUri) || sportCover(event.sport);
  const when = formatWhen(event.eventDate, event.eventTime, t) || t('event.whenUnknown');
  const where = event.location || t('map.placeUnknown');
  const status = getEventStatus(event);
  const ended = status === 'ended';

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 p-3 md:p-4">
      <div
        className={`pointer-events-auto card-shadow relative mx-auto w-full max-w-xl overflow-hidden p-3.5 ${
          ended ? 'opacity-60 grayscale-[0.35]' : ''
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[#E4EBEE]" />
        <button
          type="button"
          aria-label={t('map.close')}
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
            <p
              className={`truncate text-[11px] font-extrabold ${
                ended ? 'text-[#8A9199]' : 'text-[#12B8D0]'
              }`}
            >
              {ended
                ? t(eventStatusMessageKey(status))
                : [sportLabel(event.sport, t) || t('sport.generic'), event.level]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
            <h2 className="mt-0.5 line-clamp-2 text-base font-extrabold tracking-tight leading-5">
              {event.title.trim() || t('event.untitled')}
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
          <p className="text-lg font-extrabold tracking-tight">{formatPrice(event.priceYen, t)}</p>
          <Link
            href={`/event/${event.id}`}
            className="brand-gradient rounded-full px-4 py-2.5 text-[13px] font-extrabold"
          >
            {t('map.viewDetail')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function GoogleEventMap({
  events,
  center,
  userCoords,
  locating,
  onRecenter,
  preferCenter,
  recenterKey = 0,
  onSearchArea,
}: Required<Pick<EventMapProps, 'events' | 'center' | 'preferCenter'>> &
  Pick<
    EventMapProps,
    'userCoords' | 'locating' | 'onRecenter' | 'recenterKey' | 'onSearchArea'
  >) {
  const t = useT();
  const mappable = useMemo(() => toMappable(events), [events]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = mappable.find((event) => event.id === selectedId) ?? null;
  const skipIdleRef = useRef(false);
  const [searchPrompt, setSearchPrompt] = useState<{
    show: boolean;
    bounds: MapBoundsLiteral | null;
    commit: () => void;
  }>({ show: false, bounds: null, commit: () => undefined });

  const markProgrammaticMove = useMemo(
    () => () => {
      skipIdleRef.current = true;
      setSearchPrompt((prev) => ({ ...prev, show: false }));
    },
    [],
  );

  useEffect(() => {
    if (selectedId && !mappable.some((event) => event.id === selectedId)) {
      setSelectedId(null);
    }
  }, [mappable, selectedId]);

  return (
    <div className="card-shadow relative h-[min(72vh,820px)] min-h-[520px] w-full overflow-hidden">
      <Map
        defaultCenter={center}
        defaultZoom={NEARBY_ZOOM}
        mapId={MAP_ID}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        className="h-full w-full"
        onClick={() => setSelectedId(null)}
      >
        <MapCamera
          center={center}
          preferCenter={preferCenter}
          recenterKey={recenterKey}
          onProgrammaticMove={markProgrammaticMove}
        />
        {onSearchArea ? (
          <MapIdleBridge
            skipIdleRef={skipIdleRef}
            onPromptChange={setSearchPrompt}
          />
        ) : null}
        {userCoords ? <UserLocationDot coords={userCoords} /> : null}
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

      {onSearchArea && searchPrompt.show && searchPrompt.bounds ? (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center px-3">
          <button
            type="button"
            onClick={() => {
              const bounds = searchPrompt.bounds;
              if (!bounds) return;
              searchPrompt.commit();
              onSearchArea(bounds);
            }}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2.5 text-sm font-extrabold text-[#12202A] shadow-[0_8px_24px_rgba(18,32,42,0.14)] ring-1 ring-[#E4EBEE] transition hover:bg-white"
          >
            <RefreshCw size={15} strokeWidth={2.4} className="text-[#12B8D0]" />
            {t('map.searchThisArea')}
          </button>
        </div>
      ) : null}

      <div className="absolute left-3 top-3 z-20 rounded-full bg-white/95 px-3 py-1 text-[11px] font-extrabold text-[#5B6B75] shadow-sm">
        {t('map.mapCount', { count: mappable.length })}
        {events.length > mappable.length
          ? t('map.unknownHidden', { count: events.length - mappable.length })
          : ''}
        {locating ? t('map.locatingSuffix') : ''}
      </div>

      {onRecenter ? (
        <button
          type="button"
          aria-label={t('map.recenterAria')}
          disabled={locating}
          onClick={onRecenter}
          className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-[#12B8D0] shadow-sm disabled:opacity-60"
        >
          <LocateFixed size={18} strokeWidth={2.4} className={locating ? 'animate-pulse' : ''} />
        </button>
      ) : null}

      {events.length === 0 ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-4 z-20 mx-auto max-w-sm rounded-2xl bg-white/90 px-4 py-3 text-center text-sm font-bold text-[#5B6B75] shadow-sm">
          {t('map.emptyInArea')}
        </p>
      ) : mappable.length === 0 ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-4 z-20 mx-auto max-w-sm rounded-2xl bg-white/90 px-4 py-3 text-center text-sm font-bold text-[#5B6B75] shadow-sm">
          {t('map.noCoords')}
        </p>
      ) : null}

      {selected ? (
        <MapPreviewCard event={selected} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}

export function EventMap({
  events,
  center,
  userCoords = null,
  locating = false,
  onRecenter,
  preferCenter = true,
  recenterKey = 0,
  onSearchArea,
}: EventMapProps) {
  const t = useT();
  const { locale } = useLocale();
  const apiKey = googleMapsApiKey();
  const resolvedCenter = center ?? DEFAULT_CENTER;

  if (!apiKey) {
    return (
      <div className="card-shadow grid h-[420px] place-items-center px-6 text-center text-sm font-bold text-[#5B6B75]">
        {t('map.missingKey')}
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} language={locale === 'en' ? 'en' : 'ja'} region="JP">
      <GoogleEventMap
        events={events}
        center={resolvedCenter}
        userCoords={userCoords}
        locating={locating}
        onRecenter={onRecenter}
        preferCenter={preferCenter}
        recenterKey={recenterKey}
        onSearchArea={onSearchArea}
      />
    </APIProvider>
  );
}
