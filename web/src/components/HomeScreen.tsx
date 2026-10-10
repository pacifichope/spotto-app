'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { List, Map as MapIcon } from 'lucide-react';

import { DateTimeline } from '@/components/DateTimeline';
import { EventCard } from '@/components/EventCard';
import { EventMap } from '@/components/EventMap';
import { Header, type LevelFilterId } from '@/components/Header';
import {
  DEFAULT_PRICE_RANGE,
  matchesPriceRange,
  type PriceRange,
} from '@/components/PriceRangeSlider';
import {
  eventMatchesCategory,
  resolveEventCoords,
  type CategoryId,
} from '@/constants/theme';
import { useHiddenUserIds } from '@/hooks/useHiddenUserIds';
import { useUserLocation } from '@/hooks/useUserLocation';
import {
  NEARBY_AREA,
  eventBelongsToPrefectureArea,
  getPrefectureByShortLabel,
  prefectureCenter,
} from '@/lib/areas';
import {
  boundsAroundCenter,
  listPublicEventsInBounds,
} from '@/lib/eventsClient';
import { areaLabel as translateArea } from '@/lib/i18n/labels';
import { useLocale } from '@/lib/i18n/locale-context';
import type { PublicEvent } from '@/lib/types';
import {
  NEARBY_RADIUS_KM,
  isWithinMapBounds,
  isWithinRadiusKm,
  toMapLatLng,
  type MapBoundsLiteral,
} from '@/lib/userLocation';

function areaMapCenter(area: string): { lat: number; lng: number } | null {
  if (area === NEARBY_AREA) return null;
  return prefectureCenter(area);
}

function matchesLevelFilter(level: string, filter: LevelFilterId) {
  if (filter === 'all') return true;
  const raw = level.trim();
  if (filter === 'beginner') {
    return (
      raw === '初心者' ||
      raw === '初心者歓迎' ||
      raw === '初級' ||
      raw === '誰でも歓迎'
    );
  }
  if (filter === 'intermediate') return raw === '中級';
  return raw === '上級';
}

function applyCommonFilters(
  source: PublicEvent[],
  input: {
    hiddenIds: Set<string>;
    date: string | null;
    priceRange: PriceRange;
    category: CategoryId;
    level: LevelFilterId;
    query: string;
  },
) {
  const needle = input.query.trim().toLowerCase();
  return source.filter((event) => {
    if (event.hostId && input.hiddenIds.has(event.hostId)) return false;
    if (input.date && !event.eventDate.startsWith(input.date)) return false;
    if (!matchesPriceRange(event.priceYen, input.priceRange)) return false;
    if (!eventMatchesCategory(event.sport, event.joinedCount, input.category)) {
      return false;
    }
    if (!matchesLevelFilter(event.level, input.level)) return false;
    if (!needle) return true;
    return `${event.title} ${event.sport} ${event.location} ${event.level}`
      .toLowerCase()
      .includes(needle);
  });
}

export function HomeScreen({
  events,
  error,
}: {
  events: PublicEvent[];
  error: string;
}) {
  const {
    coords: userCoords,
    center: locationCenter,
    locating,
    status,
    refresh,
  } = useUserLocation();
  const { hiddenIds } = useHiddenUserIds();
  const { locale, t } = useLocale();

  const [query, setQuery] = useState('');
  const [area, setArea] = useState<string>(NEARBY_AREA);
  const [category, setCategory] = useState<CategoryId>('all');
  const [level, setLevel] = useState<LevelFilterId>('all');
  const [priceRange, setPriceRange] = useState<PriceRange>(DEFAULT_PRICE_RANGE);
  const [date, setDate] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  /** マップ idle で取得した現在の表示範囲 */
  const [mapBounds, setMapBounds] = useState<MapBoundsLiteral | null>(null);
  const [mapEvents, setMapEvents] = useState<PublicEvent[]>(events);
  /** 都道府県選択時に取得した地域イベント（リスト用） */
  const [areaEvents, setAreaEvents] = useState<PublicEvent[] | null>(null);
  const [mapFetching, setMapFetching] = useState(false);
  const [mapFetchError, setMapFetchError] = useState('');
  const [recenterKey, setRecenterKey] = useState(0);
  const mapFetchAbortRef = useRef<AbortController | null>(null);
  const areaFetchAbortRef = useRef<AbortController | null>(null);

  const isNearbyMode = area === NEARBY_AREA;
  const browseOrigin = locationCenter;
  /** マップでパン／ズームした表示範囲。リスト側の絞り込みにも共有する */
  const mapViewportActive = mapBounds != null;

  const mapCenter = useMemo(() => {
    if (isNearbyMode) return toMapLatLng(browseOrigin);
    return areaMapCenter(area) ?? toMapLatLng(browseOrigin);
  }, [area, browseOrigin, isNearbyMode]);

  const areaLabel = mapViewportActive
    ? t('home.mapArea')
    : locating
      ? t('home.locating')
      : isNearbyMode && status === 'denied'
        ? t('home.nearbyDenied')
        : isNearbyMode && !userCoords && (status === 'unavailable' || status === 'unsupported')
          ? t('home.nearbyFallback')
          : translateArea(area, t, locale);

  useEffect(() => {
    setMapEvents(events);
    if (area === NEARBY_AREA) setAreaEvents(null);
  }, [events, area]);

  useEffect(() => {
    return () => {
      mapFetchAbortRef.current?.abort();
      areaFetchAbortRef.current?.abort();
    };
  }, []);

  /** 都道府県切替時: 県庁所在地周辺のイベントを取得してリスト／マップを更新 */
  useEffect(() => {
    if (area === NEARBY_AREA) {
      setAreaEvents(null);
      return;
    }
    const prefecture = getPrefectureByShortLabel(area);
    const center = prefectureCenter(area);
    if (!prefecture || !center) {
      setAreaEvents([]);
      return;
    }
    areaFetchAbortRef.current?.abort();
    const controller = new AbortController();
    areaFetchAbortRef.current = controller;
    const bounds = boundsAroundCenter(
      center.lat,
      center.lng,
      prefecture.radiusKm,
    );
    void listPublicEventsInBounds(bounds, {
      signal: controller.signal,
      limit: 200,
    })
      .then((next) => {
        if (controller.signal.aborted) return;
        setAreaEvents(next);
        setMapEvents(next);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAreaEvents([]);
      });
    return () => {
      controller.abort();
    };
  }, [area]);

  const handleArea = useCallback(
    (next: string) => {
      setArea(next);
      setMapBounds(null);
      setRecenterKey((key) => key + 1);
      if (next === NEARBY_AREA) {
        setAreaEvents(null);
        void refresh();
      }
    },
    [refresh],
  );

  const handleRecenter = useCallback(() => {
    setArea(NEARBY_AREA);
    setMapBounds(null);
    setAreaEvents(null);
    setRecenterKey((key) => key + 1);
    void refresh();
  }, [refresh]);

  const handleBoundsIdle = useCallback((bounds: MapBoundsLiteral) => {
    setMapBounds(bounds);
    mapFetchAbortRef.current?.abort();
    const controller = new AbortController();
    mapFetchAbortRef.current = controller;
    setMapFetching(true);
    setMapFetchError('');
    void listPublicEventsInBounds(bounds, { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setMapEvents(next);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setMapFetchError(
          caught instanceof Error ? caught.message : t('home.listFailed'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setMapFetching(false);
      });
  }, [t]);

  const filterInput = useMemo(
    () => ({ hiddenIds, date, priceRange, category, level, query }),
    [hiddenIds, date, priceRange, category, level, query],
  );

  const listVisible = useMemo(() => {
    // マップで見た範囲をリストにも反映（双方向同期のマップ→リスト）
    if (mapBounds) {
      const byId = new Map<string, PublicEvent>();
      for (const event of mapEvents) byId.set(event.id, event);
      for (const event of events) {
        const coords = resolveEventCoords(event);
        if (coords && isWithinMapBounds(coords, mapBounds)) {
          byId.set(event.id, event);
        }
      }
      return applyCommonFilters([...byId.values()], filterInput).filter(
        (event) => {
          const coords = resolveEventCoords(event);
          return coords ? isWithinMapBounds(coords, mapBounds) : false;
        },
      );
    }

    if (isNearbyMode) {
      return applyCommonFilters(events, filterInput).filter((event) => {
        const coords = resolveEventCoords(event);
        if (!coords) return false;
        return isWithinRadiusKm(
          browseOrigin,
          { latitude: coords.lat, longitude: coords.lng },
          NEARBY_RADIUS_KM,
        );
      });
    }
    const byId = new Map<string, PublicEvent>();
    for (const event of areaEvents ?? []) byId.set(event.id, event);
    for (const event of events) {
      if (eventBelongsToPrefectureArea(event, area)) byId.set(event.id, event);
    }
    return applyCommonFilters([...byId.values()], filterInput).filter(
      (event) => eventBelongsToPrefectureArea(event, area),
    );
  }, [
    events,
    mapEvents,
    mapBounds,
    areaEvents,
    filterInput,
    isNearbyMode,
    browseOrigin,
    area,
  ]);

  const mapVisible = useMemo(
    () => applyCommonFilters(mapEvents, filterInput),
    [mapEvents, filterInput],
  );

  const visibleCount = view === 'map' ? mapVisible.length : listVisible.length;

  return (
    <div className="page-main lg:grid lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-start lg:gap-6 xl:gap-8">
      <aside className="lg:sticky lg:top-24">
        <div className="lg:card-shadow lg:p-4">
          <Header
            area={area}
            areaLabel={areaLabel}
            query={query}
            category={category}
            level={level}
            priceRange={priceRange}
            onArea={handleArea}
            onQuery={setQuery}
            onCategory={setCategory}
            onLevel={setLevel}
            onPriceRange={setPriceRange}
          />
          <div className="mt-5">
            <DateTimeline selectedStamp={date} onSelect={setDate} />
          </div>
        </div>
      </aside>

      <main>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-xl font-extrabold tracking-tight lg:text-2xl">
            {t('home.title')}
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-sm font-bold text-[#5B6B75]">
              {t('home.count', { count: visibleCount })}
            </p>
            <div
              className="flex rounded-full bg-white/80 p-1"
              role="group"
              aria-label={t('home.viewToggle')}
            >
              <button
                type="button"
                aria-pressed={view === 'list'}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-extrabold ${
                  view === 'list' ? 'brand-gradient' : 'text-[#5B6B75]'
                }`}
                onClick={() => setView('list')}
              >
                <List size={15} />
                {t('home.list')}
              </button>
              <button
                type="button"
                aria-pressed={view === 'map'}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-extrabold ${
                  view === 'map' ? 'brand-gradient' : 'text-[#5B6B75]'
                }`}
                onClick={() => setView('map')}
              >
                <MapIcon size={15} />
                {t('home.map')}
              </button>
            </div>
          </div>
        </div>
        {error ? <p className="mb-3 text-sm font-bold text-[#EF4444]">{error}</p> : null}
        {mapFetchError && view === 'map' ? (
          <p className="mb-3 text-sm font-bold text-[#EF4444]">{mapFetchError}</p>
        ) : null}
        {isNearbyMode && status === 'denied' && !mapViewportActive ? (
          <p className="mb-3 text-sm font-bold text-[#5B6B75]">
            {t('home.locationDenied')}
          </p>
        ) : null}
        {view === 'map' ? (
          <EventMap
            events={mapVisible}
            center={mapCenter}
            userCoords={userCoords}
            locating={locating}
            onRecenter={handleRecenter}
            preferCenter={!mapViewportActive}
            restoreBounds={mapBounds}
            recenterKey={recenterKey}
            onBoundsIdle={handleBoundsIdle}
            fetching={mapFetching}
            variant="expanded"
          />
        ) : listVisible.length === 0 ? (
          <p className="card-shadow px-4 py-8 text-center text-sm font-bold text-[#5B6B75]">
            {t('home.empty')}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {listVisible.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
