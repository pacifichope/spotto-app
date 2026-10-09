'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useLocale } from '@/lib/i18n/locale-context';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

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

function monthKey(year: number, monthIndex: number) {
  return year * 12 + monthIndex;
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

type DayCell = {
  stamp: string;
  dayNum: number;
  inMonth: boolean;
  selectable: boolean;
  isToday: boolean;
};

/**
 * 今日〜ちょうど1ヶ月先までを選ぶカレンダー。
 * 日付タップでその日のイベントに即フィルタ（再タップで解除）。
 */
export function DateTimeline({ selectedStamp, onSelect }: DateTimelineProps) {
  const { locale, t } = useLocale();
  const weekdays = locale === 'en' ? WEEKDAYS_EN : WEEKDAYS_JA;
  const todayStamp = useTodayStamp();

  const { today, endStamp, minMonth, maxMonth } = useMemo(() => {
    const todayDate = startOfLocalDay();
    const endDate = startOfLocalDay();
    endDate.setMonth(endDate.getMonth() + 1);
    return {
      today: todayDate,
      endStamp: formatDateStamp(endDate),
      minMonth: monthKey(todayDate.getFullYear(), todayDate.getMonth()),
      maxMonth: monthKey(endDate.getFullYear(), endDate.getMonth()),
    };
  }, [todayStamp]);

  const [viewYear, setViewYear] = useState(() => today.getFullYear());
  const [viewMonthIndex, setViewMonthIndex] = useState(() => today.getMonth());

  // 暦日が変わったら（未選択時のみ）表示月を今日へ寄せる
  useEffect(() => {
    if (selectedStamp) return;
    setViewYear(today.getFullYear());
    setViewMonthIndex(today.getMonth());
  }, [todayStamp, today, selectedStamp]);

  useEffect(() => {
    if (!selectedStamp) return;
    if (selectedStamp < todayStamp || selectedStamp > endStamp) {
      onSelect(null);
      return;
    }
    const selected = parseStamp(selectedStamp);
    setViewYear(selected.getFullYear());
    setViewMonthIndex(selected.getMonth());
  }, [selectedStamp, todayStamp, endStamp, onSelect]);

  const viewKey = monthKey(viewYear, viewMonthIndex);
  const canPrev = viewKey > minMonth;
  const canNext = viewKey < maxMonth;

  const monthTitle = useMemo(() => {
    const value = new Date(viewYear, viewMonthIndex, 1);
    return value.toLocaleDateString(locale === 'en' ? 'en-US' : 'ja-JP', {
      year: 'numeric',
      month: 'long',
    });
  }, [viewYear, viewMonthIndex, locale]);

  const cells = useMemo((): DayCell[] => {
    const first = new Date(viewYear, viewMonthIndex, 1);
    const lead = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonthIndex + 1, 0).getDate();
    const total = Math.ceil((lead + daysInMonth) / 7) * 7;
    const result: DayCell[] = [];

    for (let index = 0; index < total; index++) {
      const dayNum = index - lead + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      if (!inMonth) {
        result.push({
          stamp: `pad-${index}`,
          dayNum: 0,
          inMonth: false,
          selectable: false,
          isToday: false,
        });
        continue;
      }
      const value = new Date(viewYear, viewMonthIndex, dayNum);
      const stamp = formatDateStamp(value);
      result.push({
        stamp,
        dayNum,
        inMonth: true,
        selectable: stamp >= todayStamp && stamp <= endStamp,
        isToday: stamp === todayStamp,
      });
    }
    return result;
  }, [viewYear, viewMonthIndex, todayStamp, endStamp]);

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonthIndex + delta, 1);
    const key = monthKey(next.getFullYear(), next.getMonth());
    if (key < minMonth || key > maxMonth) return;
    setViewYear(next.getFullYear());
    setViewMonthIndex(next.getMonth());
  }

  return (
    <div className="date-calendar">
      <p className="mb-2 text-xs font-extrabold text-[#5B6B75]">{t('home.date')}</p>

      <div className="date-calendar-header">
        <button
          type="button"
          className="date-calendar-nav"
          aria-label={t('common.back')}
          disabled={!canPrev}
          onClick={() => shiftMonth(-1)}
        >
          <ChevronLeft size={18} strokeWidth={2.4} aria-hidden />
        </button>
        <p className="date-calendar-month">{monthTitle}</p>
        <button
          type="button"
          className="date-calendar-nav"
          aria-label={locale === 'en' ? 'Next month' : '翌月'}
          disabled={!canNext}
          onClick={() => shiftMonth(1)}
        >
          <ChevronRight size={18} strokeWidth={2.4} aria-hidden />
        </button>
      </div>

      <div className="date-calendar-weekdays" role="row">
        {weekdays.map((label) => (
          <span key={label} className="date-calendar-weekday">
            {label}
          </span>
        ))}
      </div>

      <div className="date-calendar-grid" role="grid" aria-label={t('home.date')}>
        {cells.map((cell) => {
          if (!cell.inMonth) {
            return <span key={cell.stamp} className="date-calendar-cell" aria-hidden />;
          }
          const selected = selectedStamp === cell.stamp;
          return (
            <button
              key={cell.stamp}
              type="button"
              role="gridcell"
              disabled={!cell.selectable}
              aria-selected={selected}
              aria-current={cell.isToday ? 'date' : undefined}
              aria-label={`${cell.stamp}${cell.isToday ? ` ${t('home.today')}` : ''}`}
              className={`date-calendar-cell date-calendar-day${
                selected ? ' date-calendar-day--selected' : ''
              }${cell.isToday && !selected ? ' date-calendar-day--today' : ''}${
                !cell.selectable ? ' date-calendar-day--muted' : ''
              }`}
              onClick={() => {
                if (!cell.selectable) return;
                onSelect(selected ? null : cell.stamp);
              }}
            >
              <span
                className={`date-calendar-day-num${
                  selected ? ' brand-gradient' : ''
                }`}
              >
                {cell.dayNum}
              </span>
              <span
                className={`date-calendar-today-dot${
                  cell.isToday ? ' date-calendar-today-dot--on' : ''
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
