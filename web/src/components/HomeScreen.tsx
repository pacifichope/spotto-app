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
import { useUserLocation } from '@/hooks/useUserLocation';
import type { PublicEvent } from '@/lib/types';
import {
  NEARBY_RADIUS_KM,
  isWithinRadiusKm,
  toMapLatLng,
} from '@/lib/userLocation';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;
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

  const [query, setQuery] = useState('');
  const [area, setArea] = useState<string>(NEARBY_AREA);
  const [category, setCategory] = useState<CategoryId>('all');
  const [priceRange, setPriceRange] = useState<PriceRange>(DEFAULT_PRICE_RANGE);
  const [date, setDate] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const days = useMemo(() => dateOptions(), []);
  const leadBlanks = days[0]?.weekdayIndex ?? 0;

  const isNearbyMode = area === NEARBY_AREA;
  const browseOrigin = locationCenter;

  const mapCenter = useMemo(() => {
    if (isNearbyMode) return toMapLatLng(browseOrigin);
    return areaMapCenter(area) ?? toMapLatLng(browseOrigin);
  }, [area, browseOrigin, isNearbyMode]);

  const areaLabel = locating
    ? '現在地を取得中…'
    : isNearbyMode && status === 'denied'
      ? '現在地付近（位置情報オフ）'
      : isNearbyMode && !userCoords && (status === 'unavailable' || status === 'unsupported')
        ? '現在地付近（東京都）'
        : area;

  const handleArea = useCallback(
    (next: string) => {
      setArea(next);
      if (next === NEARBY_AREA) {
        void refresh();
      }
    },
    [refresh],
  );

  const handleRecenter = useCallback(() => {
    setArea(NEARBY_AREA);
    void refresh();
  }, [refresh]);

  const visible = events.filter((event) => {
    if (date && !event.eventDate.startsWith(date)) return false;
    if (!matchesPriceRange(event.priceYen, priceRange)) return false;
    if (!eventMatchesCategory(event.sport, event.joinedCount, category)) return false;

    if (isNearbyMode) {
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
    <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-8">
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
          <p className="mb-2 mt-5 text-xs font-extrabold text-[#5B6B75]">日付</p>
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAYS.map((label) => (
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
                  aria-label={`${option.stamp}${option.isToday ? ' 今日' : ''}`}
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
          <h1 className="text-xl font-extrabold tracking-tight lg:text-2xl">開催中のイベント</h1>
          <div className="flex items-center gap-3">
            <p className="text-sm font-bold text-[#5B6B75]">{visible.length}件</p>
            <div className="flex rounded-full bg-white/80 p-1" role="group" aria-label="表示の切り替え">
              <button
                type="button"
                aria-pressed={view === 'list'}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-extrabold ${
                  view === 'list' ? 'brand-gradient' : 'text-[#5B6B75]'
                }`}
                onClick={() => setView('list')}
              >
                <List size={15} />
                リスト
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
                マップ
              </button>
            </div>
          </div>
        </div>
        {error ? <p className="mb-3 text-sm font-bold text-[#EF4444]">{error}</p> : null}
        {isNearbyMode && status === 'denied' ? (
          <p className="mb-3 text-sm font-bold text-[#5B6B75]">
            位置情報がブロックされています。ブラウザの設定で許可するか、エリアを選んでください。マップは東京都心を中心に表示します。
          </p>
        ) : null}
        {view === 'map' ? (
          <EventMap
            events={visible}
            center={mapCenter}
            userCoords={userCoords}
            locating={locating}
            onRecenter={handleRecenter}
            preferCenter
          />
        ) : visible.length === 0 ? (
          <p className="card-shadow px-4 py-8 text-center text-sm font-bold text-[#5B6B75]">
            条件に合うイベントはまだありません
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
