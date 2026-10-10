'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { absoluteImageUrl } from '@/lib/eventSeo';

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
  const resolved = uris
    .map((uri) => absoluteImageUrl(uri) || uri)
    .filter(Boolean);
  const slides = resolved.length > 0 ? resolved : [fallbackUri];

  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const paused = useRef(false);

  const go = useCallback(
    (next: number) => {
      const len = slides.length;
      if (len <= 1) return;
      setIndex(((next % len) + len) % len);
    },
    [slides.length],
  );

  useEffect(() => {
    setIndex(0);
  }, [slides.join('|')]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      if (paused.current) return;
      setIndex((prev) => (prev + 1) % slides.length);
    }, AUTO_MS);
    return () => window.clearInterval(timer);
  }, [slides.length]);

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
        if (start == null || slides.length <= 1) return;
        const end = event.changedTouches[0]?.clientX ?? start;
        const delta = end - start;
        if (Math.abs(delta) < 40) return;
        go(index + (delta < 0 ? 1 : -1));
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slides[index] || fallbackUri}
        alt={alt}
        className="h-full w-full object-cover"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-black/25" />
      {children}
      {slides.length > 1 ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center gap-1.5"
          aria-hidden
        >
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/55'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
