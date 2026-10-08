'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { useLocale } from '@/lib/i18n/locale-context';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** 一度に前後へ足す日数（おおよそ1ヶ月） */
const CHUNK_DAYS = 31;
/** 初回表示：今日から何日先まで */
const INITIAL_FORWARD = 45;
/** 端に近づいたら追加するしきい値（px） */
const EDGE_PX = 120;
/** アイテム幅（padding込み・スクロール位置補正用） */
const ITEM_WIDTH = 48;

export type DateTimelineOption = {
  stamp: string;
  weekdayIndex: number;
  dayNum: number;
  monthNum: number;
  isToday: boolean;
  isMonthStart: boolean;
};

function startOfLocalDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatDateStamp(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function parseStamp(stamp: string) {
  const [y, m, d] = stamp.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function buildRange(start: Date, count: number, todayStamp: string): DateTimelineOption[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    const stamp = formatDateStamp(value);
    return {
      stamp,
      weekdayIndex: value.getDay(),
      dayNum: value.getDate(),
      monthNum: value.getMonth() + 1,
      isToday: stamp === todayStamp,
      isMonthStart: value.getDate() === 1,
    };
  });
}

function useTodayStamp() {
  const [todayStamp, setTodayStamp] = useState(() => formatDateStamp(new Date()));

  useEffect(() => {
    const sync = () => {
      const next = formatDateStamp(new Date());
      setTodayStamp((prev) => (prev === next ? prev : next));
    };
    const intervalId = window.setInterval(sync, 60_000);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return todayStamp;
}

type DateTimelineProps = {
  selectedStamp: string | null;
  onSelect: (stamp: string | null) => void;
};

export function DateTimeline({ selectedStamp, onSelect }: DateTimelineProps) {
  const { locale, t } = useLocale();
  const weekdays = locale === 'en' ? WEEKDAYS_EN : WEEKDAYS_JA;
  const todayStamp = useTodayStamp();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const prependPendingRef = useRef(0);
  const extendingRef = useRef(false);

  const [days, setDays] = useState<DateTimelineOption[]>(() => {
    const today = startOfLocalDay();
    return buildRange(today, INITIAL_FORWARD + 1, formatDateStamp(today));
  });

  // 暦日が変わったら、今日を先頭にした範囲を作り直す
  useEffect(() => {
    const today = startOfLocalDay();
    setDays(buildRange(today, INITIAL_FORWARD + 1, todayStamp));
  }, [todayStamp]);

  useEffect(() => {
    if (
      selectedStamp &&
      !days.some((option) => option.stamp === selectedStamp)
    ) {
      onSelect(null);
    }
  }, [days, selectedStamp, onSelect]);

  // 先頭に日を足したあと見た目の位置を保ち、拡張ロックを解除
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const prepended = prependPendingRef.current;
    if (scroller && prepended > 0) {
      scroller.scrollLeft += prepended * ITEM_WIDTH;
      prependPendingRef.current = 0;
    }
    extendingRef.current = false;
  }, [days]);

  const extendBackward = useCallback(() => {
    if (extendingRef.current) return;
    extendingRef.current = true;
    setDays((prev) => {
      if (prev.length === 0) return prev;
      const first = parseStamp(prev[0]!.stamp);
      const start = new Date(first);
      start.setDate(first.getDate() - CHUNK_DAYS);
      const chunk = buildRange(start, CHUNK_DAYS, todayStamp);
      prependPendingRef.current = chunk.length;
      return [...chunk, ...prev];
    });
  }, [todayStamp]);

  const extendForward = useCallback(() => {
    if (extendingRef.current) return;
    extendingRef.current = true;
    setDays((prev) => {
      if (prev.length === 0) return prev;
      const last = parseStamp(prev[prev.length - 1]!.stamp);
      const start = new Date(last);
      start.setDate(last.getDate() + 1);
      const chunk = buildRange(start, CHUNK_DAYS, todayStamp);
      return [...prev, ...chunk];
    });
  }, [todayStamp]);

  const onScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || extendingRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scroller;
    if (scrollLeft < EDGE_PX) {
      extendBackward();
    } else if (scrollLeft + clientWidth > scrollWidth - EDGE_PX) {
      extendForward();
    }
  }, [extendBackward, extendForward]);

  // マウス／ペンでのドラッグスクロール（タッチはネイティブ慣性に任せる）
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let pointerId: number | null = null;
    let startX = 0;
    let startScroll = 0;
    let moved = false;
    let lastX = 0;
    let lastTs = 0;
    let velocity = 0;
    let rafId = 0;

    const stopInertia = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const runInertia = () => {
      const el = scrollerRef.current;
      if (!el || Math.abs(velocity) < 0.15) {
        rafId = 0;
        return;
      }
      el.scrollLeft -= velocity;
      velocity *= 0.95;
      rafId = requestAnimationFrame(runInertia);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      stopInertia();
      pointerId = event.pointerId;
      startX = event.clientX;
      lastX = event.clientX;
      lastTs = performance.now();
      startScroll = scroller.scrollLeft;
      moved = false;
      velocity = 0;
      scroller.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      const dx = event.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      scroller.scrollLeft = startScroll - dx;
      const now = performance.now();
      const dt = now - lastTs;
      if (dt > 0) {
        velocity = ((event.clientX - lastX) / dt) * 16;
      }
      lastX = event.clientX;
      lastTs = now;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      if (moved) {
        // クリック選択を抑止したい場合は次の click を潰す
        const blockClick = (clickEvent: MouseEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          scroller.removeEventListener('click', blockClick, true);
        };
        scroller.addEventListener('click', blockClick, true);
        runInertia();
      }
    };

    scroller.addEventListener('pointerdown', onPointerDown);
    scroller.addEventListener('pointermove', onPointerMove);
    scroller.addEventListener('pointerup', onPointerUp);
    scroller.addEventListener('pointercancel', onPointerUp);

    return () => {
      stopInertia();
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('pointermove', onPointerMove);
      scroller.removeEventListener('pointerup', onPointerUp);
      scroller.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  return (
    <div className="date-timeline">
      <p className="mb-2 text-xs font-extrabold text-[#5B6B75]">{t('home.date')}</p>
      <div
        ref={scrollerRef}
        className="date-timeline-scroll"
        onScroll={onScroll}
        role="listbox"
        aria-label={t('home.date')}
      >
        <div className="date-timeline-track">
          {days.map((option) => {
            const selected = selectedStamp === option.stamp;
            const weekday = weekdays[option.weekdayIndex]!;
            return (
              <button
                key={option.stamp}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={`${option.stamp}${option.isToday ? ` ${t('home.today')}` : ''}`}
                className="date-timeline-item"
                onClick={() => onSelect(selected ? null : option.stamp)}
              >
                {option.isMonthStart ? (
                  <span className="date-timeline-month" aria-hidden>
                    {option.monthNum}
                  </span>
                ) : (
                  <span className="date-timeline-month-spacer" aria-hidden />
                )}
                <span
                  className={`date-timeline-weekday${
                    selected ? ' date-timeline-weekday--selected' : ''
                  }${option.isToday && !selected ? ' date-timeline-weekday--today' : ''}`}
                >
                  {weekday}
                </span>
                <span
                  className={`date-timeline-day${
                    selected ? ' date-timeline-day--selected brand-gradient' : ''
                  }${option.isToday && !selected ? ' date-timeline-day--today' : ''}`}
                >
                  {option.dayNum}
                </span>
                <span
                  className={`date-timeline-today-mark${
                    option.isToday ? ' date-timeline-today-mark--visible' : ''
                  }`}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
