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
    <div>
      <Header
        area={area}
        query={query}
        category={category}
        onArea={setArea}
        onQuery={setQuery}
        onCategory={setCategory}
      />
      <div className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
        {days.map((option) => {
          const selected = date === option.stamp;
          return (
            <button
              key={option.stamp}
              type="button"
              aria-pressed={selected}
              className="flex min-w-12 flex-col items-center px-2.5 py-1.5"
              onClick={() => setDate(selected ? null : option.stamp)}
            >
              <span className={`text-xs font-bold ${selected ? 'text-[#12202A]' : 'text-[#8A9199]'}`}>
                {option.weekday}
              </span>
              <span className={`text-lg font-extrabold ${selected ? 'text-[#12202A]' : 'text-[#5B6B75]'}`}>
                {option.dayNum}
              </span>
              {selected ? <span className="mt-0.5 h-[3px] w-4 rounded-full bg-[#FF9533]" /> : null}
            </button>
          );
        })}
      </div>
      <main className="grid gap-3 px-4 pb-6">
        {error ? <p className="text-sm font-bold text-[#EF4444]">{error}</p> : null}
        {visible.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
        {!error && visible.length === 0 ? (
          <p className="card-shadow px-4 py-8 text-center text-sm font-bold text-[#5B6B75]">
            条件に合うイベントはまだありません
          </p>
        ) : null}
      </main>
    </div>
  );
}
