'use client';

export const PRICE_RANGE_MIN = 0;
export const PRICE_RANGE_MAX = 10_000;
export const PRICE_RANGE_STEP = 100;

export type PriceRange = {
  min: number;
  max: number;
};

export const DEFAULT_PRICE_RANGE: PriceRange = {
  min: PRICE_RANGE_MIN,
  max: PRICE_RANGE_MAX,
};

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}

function snap(value: number) {
  return Math.round(value / PRICE_RANGE_STEP) * PRICE_RANGE_STEP;
}

export function formatPriceYen(value: number) {
  if (value <= 0) return '0円';
  return `${value.toLocaleString('ja-JP')}円`;
}

export function formatPriceRangeLabel(range: PriceRange) {
  const min = clamp(range.min, PRICE_RANGE_MIN, PRICE_RANGE_MAX);
  const max = clamp(range.max, PRICE_RANGE_MIN, PRICE_RANGE_MAX);
  if (min <= PRICE_RANGE_MIN && max >= PRICE_RANGE_MAX) {
    return '指定なし（0円 〜 10,000円以上）';
  }
  if (max >= PRICE_RANGE_MAX) {
    return `${formatPriceYen(min)} 〜 10,000円以上`;
  }
  return `${formatPriceYen(min)} 〜 ${formatPriceYen(max)}`;
}

/** スライダー範囲にイベント価格が含まれるか（上限到達時は 10,000円超も通す） */
export function matchesPriceRange(priceYen: number, range: PriceRange) {
  const amount = Math.max(0, Math.floor(Number(priceYen) || 0));
  const min = clamp(range.min, PRICE_RANGE_MIN, PRICE_RANGE_MAX);
  const max = clamp(range.max, PRICE_RANGE_MIN, PRICE_RANGE_MAX);
  if (amount < min) return false;
  if (max >= PRICE_RANGE_MAX) return true;
  return amount <= max;
}

type PriceRangeSliderProps = {
  value: PriceRange;
  onChange: (next: PriceRange) => void;
};

export function PriceRangeSlider({ value, onChange }: PriceRangeSliderProps) {
  const min = clamp(value.min, PRICE_RANGE_MIN, value.max);
  const max = clamp(value.max, value.min, PRICE_RANGE_MAX);
  const span = PRICE_RANGE_MAX - PRICE_RANGE_MIN || 1;
  const leftPct = ((min - PRICE_RANGE_MIN) / span) * 100;
  const rightPct = ((max - PRICE_RANGE_MIN) / span) * 100;

  function setMin(raw: number) {
    const next = clamp(snap(raw), PRICE_RANGE_MIN, max);
    onChange({ min: next, max });
  }

  function setMax(raw: number) {
    const next = clamp(snap(raw), min, PRICE_RANGE_MAX);
    onChange({ min, max: next });
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-xs font-extrabold text-[#5B6B75]">価格帯</p>
        <p className="text-sm font-extrabold tracking-tight text-[#12B8D0]">
          {formatPriceRangeLabel({ min, max })}
        </p>
      </div>

      <div className="relative mt-4 h-8 touch-none select-none">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#E4EBEE]" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full brand-gradient"
          style={{ left: `${leftPct}%`, width: `${Math.max(0, rightPct - leftPct)}%` }}
        />

        <input
          type="range"
          aria-label="最低価格"
          min={PRICE_RANGE_MIN}
          max={PRICE_RANGE_MAX}
          step={PRICE_RANGE_STEP}
          value={min}
          onChange={(event) => setMin(Number(event.target.value))}
          className="price-range-thumb absolute inset-0 z-20 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          aria-label="最高価格"
          min={PRICE_RANGE_MIN}
          max={PRICE_RANGE_MAX}
          step={PRICE_RANGE_STEP}
          value={max}
          onChange={(event) => setMax(Number(event.target.value))}
          className="price-range-thumb absolute inset-0 z-30 w-full appearance-none bg-transparent"
        />
      </div>

      <div className="mt-1 flex justify-between text-[11px] font-bold text-[#8A9199]">
        <span>0円</span>
        <span>10,000円</span>
      </div>
    </div>
  );
}
