'use client';

import { ChevronDown, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  PriceRangeSlider,
  type PriceRange,
} from '@/components/PriceRangeSlider';
import { CATEGORIES, type CategoryId } from '@/constants/theme';
import {
  NEARBY_AREA,
  PREFECTURE_GROUPS,
  getPrefectureById,
} from '@/lib/areas';
import {
  areaLabel as translateArea,
  categoryLabel as translateCategory,
} from '@/lib/i18n/labels';
import { useLocale, useT } from '@/lib/i18n/locale-context';

export type LevelFilterId = 'all' | 'beginner' | 'intermediate' | 'advanced';

const LEVEL_OPTIONS: { id: LevelFilterId; labelKey: string }[] = [
  { id: 'all', labelKey: 'home.levelAll' },
  { id: 'beginner', labelKey: 'home.levelBeginner' },
  { id: 'intermediate', labelKey: 'home.levelIntermediate' },
  { id: 'advanced', labelKey: 'home.levelAdvanced' },
];

type HeaderProps = {
  area: string;
  /** 表示用ラベル（取得中など）。未指定時は area を表示 */
  areaLabel?: string;
  query: string;
  category: CategoryId;
  level: LevelFilterId;
  priceRange: PriceRange;
  onArea: (area: string) => void;
  onQuery: (query: string) => void;
  onCategory: (category: CategoryId) => void;
  onLevel: (level: LevelFilterId) => void;
  onPriceRange: (range: PriceRange) => void;
};

export function Header({
  area,
  areaLabel,
  query,
  category,
  level,
  priceRange,
  onArea,
  onQuery,
  onCategory,
  onLevel,
  onPriceRange,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const { locale } = useLocale();
  const displayArea = areaLabel || translateArea(area, t, locale);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div>
      <div className="relative" ref={rootRef}>
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
          <div
            role="listbox"
            className="glass absolute left-0 top-10 z-30 max-h-80 w-56 overflow-auto rounded-2xl py-1 shadow-lg"
          >
            <button
              type="button"
              role="option"
              aria-selected={area === NEARBY_AREA}
              className={`block w-full px-3 py-2.5 text-left text-sm font-bold hover:bg-white/70 ${
                area === NEARBY_AREA ? 'bg-white/80 text-[#12B8D0]' : ''
              }`}
              onClick={() => {
                onArea(NEARBY_AREA);
                setOpen(false);
              }}
            >
              {t('area.nearby')}
            </button>
            {PREFECTURE_GROUPS.map((group) => (
              <div key={group.titleJa}>
                <p className="sticky top-0 bg-[#F4F7F8]/95 px-3 py-1.5 text-[10px] font-extrabold tracking-wide text-[#8A9199]">
                  {locale === 'en' ? group.titleEn : group.titleJa}
                </p>
                {group.ids.map((id) => {
                  const prefecture = getPrefectureById(id);
                  if (!prefecture) return null;
                  const selected = area === prefecture.shortLabel;
                  const label =
                    locale === 'en' ? prefecture.nameEn : prefecture.shortLabel;
                  return (
                    <button
                      key={prefecture.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`block w-full px-3 py-2 text-left text-sm font-bold hover:bg-white/70 ${
                        selected ? 'bg-white/80 text-[#12B8D0]' : ''
                      }`}
                      onClick={() => {
                        onArea(prefecture.shortLabel);
                        setOpen(false);
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
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
              onClick={() =>
                onCategory(active && item.id !== 'all' ? 'all' : item.id)
              }
            >
              {translateCategory(item.id as string, t)}
            </button>
          );
        })}
      </div>

      <p className="mb-2 mt-4 text-xs font-extrabold text-[#5B6B75]">
        {t('home.level')}
      </p>
      <div className="flex flex-wrap gap-2">
        {LEVEL_OPTIONS.map((item) => {
          const active = item.id === level;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-extrabold ${
                active ? 'brand-gradient' : 'bg-white/70 text-[#5B6B75]'
              }`}
              onClick={() => onLevel(active && item.id !== 'all' ? 'all' : item.id)}
            >
              {t(item.labelKey)}
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
