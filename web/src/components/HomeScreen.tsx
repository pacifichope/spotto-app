'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { List, Map as MapIcon } from 'lucide-react';

import { EventCard } from '@/components/EventCard';
import { EventMap } from '@/components/EventMap';
import { Header } from '@/components/Header';
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
  isWithinRadiusKm,
  toMapLatLng,
  type MapBoundsLiteral,
} from '@/lib/userLocation';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function startOfLocalDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatDateStamp(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

/** 本日〜ちょうど1ヶ月先（両端含む）の日付一覧。アクセス日基準で毎回再計算。 */
function dateOptions(now = new Date()) {
  const today = startOfLocalDay(now);
  const end = startOfLocalDay(now);
  end.setMonth(end.getMonth() + 1);
  const dayCount =
    Math.round((end.getTime() - today.getTime()) / 86_400_000) + 1;

  return Array.from({ length: Math.max(1, dayCount) }, (_, index) => {
    const value = new Date(today);
    value.setDate(today.getDate() + index);
    return {
      stamp: formatDateStamp(value),
      weekdayIndex: value.getDay(),
      dayNum: value.getDate(),
      monthNum: value.getMonth() + 1,
      isToday: index === 0,
      isMonthStart: index > 0 && value.getDate() === 1,
    };
  });
}

/** ローカル暦日が変わったら stamp を更新（タブ復帰・日付跨ぎ対応） */
function useTodayStamp() {
  const [todayStamp, setTodayStamp] = useState(() => formatDateStamp(new Date()));

  useEffect(() => {
    const sync = () => {
      const next = formatDateStamp(new Date());
      setTodayStamp((prev) => (prev === next ? prev : next));
    };
    const intervalId = window.setInterval(sync, 60_000);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return todayStamp;
}

function areaMapCenter(area: string): { lat: number; lng: number } | null {
  if (area === NEARBY_AREA) return null;
  return prefectureCenter(area);
}

function applyCommonFilters(
  source: PublicEvent[],
  input: {
    hiddenIds: Set<string>;
    date: string | null;
    priceRange: PriceRange;
    category: CategoryId;
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
  const weekdays = locale === 'en' ? WEEKDAYS_EN : WEEKDAYS_JA;

  const [query, setQuery] = useState('');
  const [area, setArea] = useState<string>(NEARBY_AREA);
  const [category, setCategory] = useState<CategoryId>('all');
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
  const todayStamp = useTodayStamp();
  const days = useMemo(() => dateOptions(new Date()), [todayStamp]);
  const leadBlanks = days[0]?.weekdayIndex ?? 0;

  useEffect(() => {
    if (date && !days.some((option) => option.stamp === date)) {
      setDate(null);
    }
  }, [date, days]);

  const isNearbyMode = area === NEARBY_AREA;
  const browseOrigin = locationCenter;
  const mapViewportActive = view === 'map' && mapBounds != null;

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
    () => ({ hiddenIds, date, priceRange, category, query }),
    [hiddenIds, date, priceRange, category, query],
  );

  const listVisible = useMemo(() => {
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
            priceRange={priceRange}
            onArea={handleArea}
            onQuery={setQuery}
            onCategory={setCategory}
            onPriceRange={setPriceRange}
          />
          <p className="mb-2 mt-5 text-xs font-extrabold text-[#5B6B75]">
            {t('home.date')}
          </p>
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {weekdays.map((label) => (
              <span key={label} className="pb-1 text-[11px] font-extrabold text-[#8A9199]">
                {label}
              </span>
            ))}
            {Array.from({ length: leadBlanks }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {days.map((option) => {
              const selected = date === option.stamp;
              return (
                <button
                  key={option.stamp}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${option.stamp}${option.isToday ? ` ${t('home.today')}` : ''}`}
                  className={`relative mx-auto grid h-8 w-8 place-items-center rounded-full text-sm font-extrabold ${
                    selected
                      ? 'brand-gradient'
                      : option.isToday
                        ? 'text-[#12B8D0] ring-2 ring-[#29D1E8]'
                        : 'text-[#12202A]'
                  }`}
                  onClick={() => setDate(selected ? null : option.stamp)}
                >
                  {option.isMonthStart ? (
                    <span className="absolute -top-2.5 text-[9px] font-extrabold text-[#8A9199]">
                      {option.monthNum}
                    </span>
                  ) : null}
                  {option.dayNum}
                </button>
              );
            })}
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
