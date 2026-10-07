'use client';

import { ChevronDown, Search } from 'lucide-react';
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
    <div>
      <div className="relative">
        <button
          type="button"
          className="flex items-center gap-1 py-1"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="truncate text-base font-extrabold tracking-tight lg:text-lg">{area}</span>
          <ChevronDown size={14} strokeWidth={2.5} />
        </button>
        {open ? (
          <ul
            role="listbox"
            className="glass absolute left-0 top-10 z-30 max-h-64 w-44 overflow-auto rounded-2xl py-1"
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

      <label className="glass mt-3 flex h-11 items-center gap-2 rounded-full px-3.5">
        <Search size={16} className="shrink-0 text-[#8A9199]" />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="スポーツや場所を検索"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[#8A9199]"
        />
      </label>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible">
        {CATEGORIES.map((item) => {
          const active = item.id === category;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-extrabold ${
                active ? 'brand-gradient' : 'bg-white/70 text-[#5B6B75]'
              }`}
              onClick={() => onCategory(active && item.id !== 'all' ? 'all' : item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
