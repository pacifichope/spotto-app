'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { absoluteImageUrl } from '@/lib/eventSeo';
import { useT } from '@/lib/i18n/locale-context';

const AUTO_MS = 3500;

type Props = {
  uris: string[];
  fallbackUri: string;
  alt?: string;
  className?: string;
  children?: ReactNode;
};

export function EventImageCarousel({
  uris,
  fallbackUri,
  alt = '',
  className = '',
  children,
}: Props) {
  const t = useT();
  const resolved = uris
    .map((uri) => absoluteImageUrl(uri) || uri)
    .filter(Boolean);
  const slides = resolved.length > 0 ? resolved : [fallbackUri];
  const multi = slides.length > 1;

  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const paused = useRef(false);
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const go = useCallback(
    (next: number, wrap = false) => {
      const len = slides.length;
      if (len <= 1) return;
      const clamped = wrap
        ? ((next % len) + len) % len
        : Math.max(0, Math.min(len - 1, next));
      setIndex(clamped);
    },
    [slides.length],
  );

  useEffect(() => {
    setIndex(0);
  }, [slides.join('|')]);

  useEffect(() => {
    if (!multi) return;
    const timer = window.setInterval(() => {
      if (paused.current) return;
      go(indexRef.current + 1, true);
    }, AUTO_MS);
    return () => window.clearInterval(timer);
  }, [multi, go]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onMouseEnter={() => {
        paused.current = true;
      }}
      onMouseLeave={() => {
        paused.current = false;
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
        paused.current = true;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        paused.current = false;
        if (start == null || !multi) return;
        const end = event.changedTouches[0]?.clientX ?? start;
        const delta = end - start;
        if (Math.abs(delta) < 40) return;
        go(index + (delta < 0 ? 1 : -1), false);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slides[index] || fallbackUri}
        alt={alt}
        className="h-full w-full object-cover select-none"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-black/25" />
      {children}

      {multi ? (
        <>
          <button
            type="button"
            onClick={() => go(index - 1, false)}
            disabled={index <= 0}
            aria-label={t('event.prevPhoto')}
            className="pointer-events-auto absolute left-2 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm disabled:opacity-30"
          >
            <ChevronLeft size={22} strokeWidth={2.4} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1, false)}
            disabled={index >= slides.length - 1}
            aria-label={t('event.nextPhoto')}
            className="pointer-events-auto absolute right-2 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm disabled:opacity-30"
          >
            <ChevronRight size={22} strokeWidth={2.4} aria-hidden />
          </button>
          <div className="absolute inset-x-0 bottom-8 z-20 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1} / ${slides.length}`}
                aria-current={i === index}
                onClick={() => go(i, false)}
                className="pointer-events-auto grid h-6 w-6 place-items-center"
              >
                <span
                  className={`rounded-full transition-all ${
                    i === index
                      ? 'h-2 w-4 bg-white'
                      : 'h-1.5 w-1.5 bg-white/55'
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
