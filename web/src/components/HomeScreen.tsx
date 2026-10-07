'use client';

import { useMemo, useState } from 'react';

import { EventCard } from '@/components/EventCard';
import { Header } from '@/components/Header';
import { eventMatchesCategory, type CategoryId } from '@/constants/theme';
import type { PublicEvent } from '@/lib/types';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

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
      weekday: index === 0 ? '今日' : WEEKDAYS[value.getDay()],
      dayNum: value.getDate(),
    };
  });
}

export function HomeScreen({
  events,
  error,
}: {
  events: PublicEvent[];
  error: string;
}) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState<string>('現在地付近');
  const [category, setCategory] = useState<CategoryId>('all');
  const [date, setDate] = useState<string | null>(null);
  const days = useMemo(() => dateOptions(), []);

  const visible = events.filter((event) => {
    if (date && !event.eventDate.startsWith(date)) return false;
    if (area !== '現在地付近' && !event.location.includes(area)) return false;
    if (!eventMatchesCategory(event.sport, event.joinedCount, category)) return false;
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
            query={query}
            category={category}
            onArea={setArea}
            onQuery={setQuery}
            onCategory={setCategory}
          />
          <p className="mb-2 mt-5 text-xs font-extrabold text-[#5B6B75]">日付</p>
          <div className="flex gap-1 overflow-x-auto pb-2 [scrollbar-width:none] lg:grid lg:grid-cols-7 lg:overflow-visible">
            {days.map((option) => {
              const selected = date === option.stamp;
              return (
                <button
                  key={option.stamp}
                  type="button"
                  aria-pressed={selected}
                  className={`flex min-w-12 flex-col items-center rounded-xl px-2.5 py-1.5 lg:min-w-0 lg:px-0 ${
                    selected ? 'bg-white' : ''
                  }`}
                  onClick={() => setDate(selected ? null : option.stamp)}
                >
                  <span className={`text-[11px] font-bold ${selected ? 'text-[#12202A]' : 'text-[#8A9199]'}`}>
                    {option.weekday}
                  </span>
                  <span className={`text-base font-extrabold ${selected ? 'text-[#12202A]' : 'text-[#5B6B75]'}`}>
                    {option.dayNum}
                  </span>
                  {selected ? <span className="mt-0.5 h-[3px] w-4 rounded-full bg-[#FF9533]" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <main>
        <div className="mb-3 flex items-end justify-between">
          <h1 className="text-xl font-extrabold tracking-tight lg:text-2xl">開催中のイベント</h1>
          <p className="text-sm font-bold text-[#5B6B75]">{visible.length}件</p>
        </div>
        {error ? <p className="mb-3 text-sm font-bold text-[#EF4444]">{error}</p> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
        {!error && visible.length === 0 ? (
          <p className="card-shadow mt-4 px-4 py-8 text-center text-sm font-bold text-[#5B6B75]">
            条件に合うイベントはまだありません
          </p>
        ) : null}
      </main>
    </div>
  );
}
