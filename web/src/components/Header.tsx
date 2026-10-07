'use client';

import { ChevronDown, MapPin, Search } from 'lucide-react';
import { useState } from 'react';

import { AREAS, CATEGORIES, type CategoryId } from '@/constants/theme';

type HeaderProps = {
  area: string;
  query: string;
  category: CategoryId;
  onArea: (area: string) => void;
  onQuery: (query: string) => void;
  onCategory: (category: CategoryId) => void;
};

export function Header({
  area,
  query,
  category,
  onArea,
  onQuery,
  onCategory,
}: HeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 px-4 pb-2 pt-4">
      <div className="flex items-center gap-2.5">
        <div className="relative max-w-[148px] shrink-0">
          <button
            type="button"
            className="flex max-w-[148px] items-center gap-0.5 py-1"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="truncate text-base font-extrabold tracking-tight">{area}</span>
            <ChevronDown size={14} strokeWidth={2.5} />
          </button>
          {open ? (
            <ul
              role="listbox"
              className="glass absolute left-0 top-10 z-30 max-h-64 w-40 overflow-auto rounded-2xl py-1"
            >
              {AREAS.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={item === area}
                    className="block w-full px-3 py-2 text-left text-sm font-bold hover:bg-white/70"
                    onClick={() => {
                      onArea(item);
                      setOpen(false);
                    }}
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <label className="glass flex h-[42px] min-w-0 flex-1 items-center gap-2 rounded-full px-3.5">
          <Search size={15} className="shrink-0 text-[#8A9199]" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="スポーツや場所を検索"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[#8A9199]"
          />
        </label>

        <span
          className="brand-gradient grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-md"
          aria-hidden
        >
          <MapPin size={18} />
        </span>
      </div>

      <div className="mt-3 flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none]">
        {CATEGORIES.map((item) => {
          const active = item.id === category;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              className="relative shrink-0 pb-1.5 text-[15px] font-extrabold"
              onClick={() => onCategory(active && item.id !== 'all' ? 'all' : item.id)}
            >
              <span className={active ? 'text-[#12202A]' : 'text-[#8A9199]'}>{item.label}</span>
              {active ? <span className="brand-mark absolute inset-x-[-2px] bottom-0.5 -z-10" /> : null}
            </button>
          );
        })}
      </div>
    </header>
  );
}
