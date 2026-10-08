'use client';

import { useCallback, useMemo, useState } from 'react';

import { List, Map } from 'lucide-react';

import { EventCard } from '@/components/EventCard';
import { EventMap } from '@/components/EventMap';
import { Header } from '@/components/Header';
import {
  DEFAULT_PRICE_RANGE,
  matchesPriceRange,
  type PriceRange,
} from '@/components/PriceRangeSlider';
import {
  AREA_CENTERS,
  eventMatchesCategory,
  resolveEventCoords,
  type CategoryId,
} from '@/constants/theme';
import { useHiddenUserIds } from '@/hooks/useHiddenUserIds';
import { useUserLocation } from '@/hooks/useUserLocation';
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

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const NEARBY_AREA = '現在地付近';

function dateOptions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 30 }, (_, index) => {
    const value = new Date(today);
    value.setDate(today.getDate() + index);
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return {
      stamp: `${value.getFullYear()}-${month}-${day}`,
      weekdayIndex: value.getDay(),
      dayNum: value.getDate(),
      isToday: index === 0,
    };
  });
}

function areaMapCenter(area: string): { lat: number; lng: number } | null {
  if (area === NEARBY_AREA) return null;
  for (const item of AREA_CENTERS) {
    if (area === item.match || area.includes(item.match)) {
      return { lat: item.lat, lng: item.lng };
    }
  }
  return null;
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
  /** マップ「このエリアで再検索」で確定した表示範囲 */
  const [mapBounds, setMapBounds] = useState<MapBoundsLiteral | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const days = useMemo(() => dateOptions(), []);
  const leadBlanks = days[0]?.weekdayIndex ?? 0;

  const isNearbyMode = area === NEARBY_AREA;
  const browseOrigin = locationCenter;
  const mapAreaSearch = view === 'map' && mapBounds != null;

  const mapCenter = useMemo(() => {
    if (isNearbyMode) return toMapLatLng(browseOrigin);
    return areaMapCenter(area) ?? toMapLatLng(browseOrigin);
  }, [area, browseOrigin, isNearbyMode]);

  const areaLabel = mapAreaSearch
    ? t('home.mapArea')
    : locating
      ? t('home.locating')
      : isNearbyMode && status === 'denied'
        ? t('home.nearbyDenied')
        : isNearbyMode && !userCoords && (status === 'unavailable' || status === 'unsupported')
          ? t('home.nearbyFallback')
          : translateArea(area, t);

  const clearMapAreaSearch = useCallback(() => {
    setMapBounds(null);
  }, []);

  const handleArea = useCallback(
    (next: string) => {
      setArea(next);
      clearMapAreaSearch();
      if (next === NEARBY_AREA) {
        void refresh();
      }
    },
    [clearMapAreaSearch, refresh],
  );

  const handleRecenter = useCallback(() => {
    setArea(NEARBY_AREA);
    clearMapAreaSearch();
    setRecenterKey((key) => key + 1);
    void refresh();
  }, [clearMapAreaSearch, refresh]);

  const handleSearchArea = useCallback((bounds: MapBoundsLiteral) => {
    setMapBounds(bounds);
  }, []);

  const visible = events.filter((event) => {
    if (event.hostId && hiddenIds.has(event.hostId)) return false;
    if (date && !event.eventDate.startsWith(date)) return false;
    if (!matchesPriceRange(event.priceYen, priceRange)) return false;
    if (!eventMatchesCategory(event.sport, event.joinedCount, category)) return false;

    if (mapAreaSearch && mapBounds) {
      const coords = resolveEventCoords(event);
      if (!coords) return false;
      if (!isWithinMapBounds({ lat: coords.lat, lng: coords.lng }, mapBounds)) {
        return false;
      }
    } else if (isNearbyMode) {
      const coords = resolveEventCoords(event);
      if (!coords) return false;
      if (
        !isWithinRadiusKm(
          browseOrigin,
          { latitude: coords.lat, longitude: coords.lng },
          NEARBY_RADIUS_KM,
        )
      ) {
        return false;
      }
    } else if (!event.location.includes(area)) {
      return false;
    }

    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${event.title} ${event.sport} ${event.location} ${event.level}`
      .toLowerCase()
      .includes(needle);
  });

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
                  className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-sm font-extrabold ${
                    selected
                      ? 'brand-gradient'
                      : option.isToday
                        ? 'text-[#12B8D0] ring-2 ring-[#29D1E8]'
                        : 'text-[#12202A]'
                  }`}
                  onClick={() => setDate(selected ? null : option.stamp)}
                >
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
              {t('home.count', { count: visible.length })}
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
                <Map size={15} />
                {t('home.map')}
              </button>
            </div>
          </div>
        </div>
        {error ? <p className="mb-3 text-sm font-bold text-[#EF4444]">{error}</p> : null}
        {isNearbyMode && status === 'denied' && !mapAreaSearch ? (
          <p className="mb-3 text-sm font-bold text-[#5B6B75]">
            {t('home.locationDenied')}
          </p>
        ) : null}
        {view === 'map' ? (
          <div className="space-y-4">
            <EventMap
              events={visible}
              center={mapCenter}
              userCoords={userCoords}
              locating={locating}
              onRecenter={handleRecenter}
              preferCenter={!mapAreaSearch}
              recenterKey={recenterKey}
              onSearchArea={handleSearchArea}
            />
            {visible.length === 0 ? (
              <p className="card-shadow px-4 py-8 text-center text-sm font-bold text-[#5B6B75]">
                {t('home.emptyInArea')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {visible.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>
        ) : visible.length === 0 ? (
          <p className="card-shadow px-4 py-8 text-center text-sm font-bold text-[#5B6B75]">
            {t('home.empty')}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visible.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
