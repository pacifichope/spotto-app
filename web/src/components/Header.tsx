'use client';

import { ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';

import {
  PriceRangeSlider,
  type PriceRange,
} from '@/components/PriceRangeSlider';
import { AREAS, CATEGORIES, type CategoryId } from '@/constants/theme';
import {
  areaLabel as translateArea,
  categoryLabel as translateCategory,
} from '@/lib/i18n/labels';
import { useT } from '@/lib/i18n/locale-context';

type HeaderProps = {
  area: string;
  /** 表示用ラベル（取得中など）。未指定時は area を表示 */
  areaLabel?: string;
  query: string;
  category: CategoryId;
  priceRange: PriceRange;
  onArea: (area: string) => void;
  onQuery: (query: string) => void;
  onCategory: (category: CategoryId) => void;
  onPriceRange: (range: PriceRange) => void;
};

export function Header({
  area,
  areaLabel,
  query,
  category,
  priceRange,
  onArea,
  onQuery,
  onCategory,
  onPriceRange,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const displayArea = areaLabel || translateArea(area, t);

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
          <span className="truncate text-base font-extrabold tracking-tight lg:text-lg">
            {displayArea}
          </span>
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
                  {translateArea(item, t)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="mb-2 mt-4 text-xs font-extrabold text-[#5B6B75]">
        {t('home.keyword')}
      </p>
      <label className="glass flex h-11 items-center gap-2 rounded-full px-3.5">
        <Search size={16} className="shrink-0 text-[#8A9199]" />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t('home.searchPlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[#8A9199]"
        />
      </label>

      <p className="mb-2 mt-4 text-xs font-extrabold text-[#5B6B75]">
        {t('home.category')}
      </p>
      <div className="flex flex-wrap gap-2">
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
              {translateCategory(item.id as string, t)}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <PriceRangeSlider value={priceRange} onChange={onPriceRange} />
      </div>
    </div>
  );
}
