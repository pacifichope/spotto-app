'use client';

import { ChevronLeft, ChevronRight, CalendarDays, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useLocale, useT } from '@/lib/i18n/locale-context';
import type { PublicEvent } from '@/lib/types';

const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

type DayChip = {
  eventId: string;
  date: string;
  weekday: string;
  dayNum: string;
  month: string;
  timeLabel: string;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatClock(time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time.trim() || '—';
  return `${pad2(Number(match[1]))}:${match[2]}`;
}

function timeLabel(event: PublicEvent) {
  const start = formatClock(event.eventTime);
  const end = event.endTime.trim() ? formatClock(event.endTime) : '';
  return end ? `${start} - ${end}` : start;
}

function buildChips(events: PublicEvent[]): DayChip[] {
  return [...events]
    .sort((a, b) =>
      `${a.eventDate}T${a.eventTime}`.localeCompare(`${b.eventDate}T${b.eventTime}`),
    )
    .map((event) => {
      const match = event.eventDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const d = match
        ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
        : new Date();
      return {
        eventId: event.id,
        date: event.eventDate,
        weekday: WEEKDAY_EN[d.getDay()] ?? '',
        dayNum: String(d.getDate()),
        month: MONTH_EN[d.getMonth()] ?? '',
        timeLabel: timeLabel(event),
      };
    });
}

function buildMonthCells(year: number, monthIndex: number) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function stampFromParts(year: number, monthIndex: number, day: number) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

type Props = {
  event: PublicEvent;
  occurrenceEvents?: PublicEvent[];
  cancelPolicyText?: string;
  onSelectEventId?: (eventId: string) => void;
};

export function EventScheduleCard({
  event,
  occurrenceEvents,
  cancelPolicyText,
  onSelectEventId,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const pool = occurrenceEvents && occurrenceEvents.length > 0 ? occurrenceEvents : [event];
  const chips = useMemo(() => buildChips(pool), [pool]);
  const eventDates = useMemo(() => new Set(chips.map((c) => c.date)), [chips]);

  const [selectedId, setSelectedId] = useState(event.id);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selectedChip = chips.find((c) => c.eventId === selectedId) ?? chips[0];

  const [cursor, setCursor] = useState(() => {
    const match = (selectedChip?.date || event.eventDate).match(/^(\d{4})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, 1);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    setSelectedId(event.id);
  }, [event.id]);

  useEffect(() => {
    if (!calendarOpen || !selectedChip) return;
    const match = selectedChip.date.match(/^(\d{4})-(\d{2})/);
    if (!match) return;
    setCursor(new Date(Number(match[1]), Number(match[2]) - 1, 1));
  }, [calendarOpen, selectedChip]);

  function selectId(nextId: string) {
    setSelectedId(nextId);
    onSelectEventId?.(nextId);
  }

  function selectDate(stamp: string) {
    if (!eventDates.has(stamp)) return;
    const chip = chips.find((c) => c.date === stamp);
    if (!chip) return;
    selectId(chip.eventId);
    setCalendarOpen(false);
  }

  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const cells = buildMonthCells(year, monthIndex);
  const today = new Date();
  const todayStamp = stampFromParts(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const weekdayLabels =
    locale === 'en'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['日', '月', '火', '水', '木', '金', '土'];

  return (
    <>
      <section className="rounded-3xl bg-white p-4 ring-1 ring-[#E4EBEE] sm:p-5">
        <p className="text-xs font-extrabold text-[#8A9199]">
          {t('event.scheduleLabel')}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {chips.map((chip) => {
              const selected = chip.eventId === selectedId;
              return (
                <button
                  key={chip.eventId}
                  type="button"
                  onClick={() => selectId(chip.eventId)}
                  className={`flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-2xl px-1 py-2.5 ${
                    selected
                      ? 'bg-[#12B8D0] text-white'
                      : 'bg-[#F4F7F8] text-[#5B6B75]'
                  }`}
                >
                  <span className={`text-[11px] font-bold ${selected ? 'text-white/90' : ''}`}>
                    {chip.weekday}
                  </span>
                  <span className="text-lg font-extrabold leading-none">{chip.dayNum}</span>
                  <span className={`text-[11px] font-bold ${selected ? 'text-white/90' : ''}`}>
                    {chip.month}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            aria-label={t('event.pickDateAria')}
            className="grid h-[72px] w-[52px] shrink-0 place-items-center gap-1 rounded-2xl bg-[#F4F7F8] text-[#5B6B75]"
          >
            <CalendarDays size={20} strokeWidth={2.2} aria-hidden />
            <span className="text-[10px] font-extrabold">Date</span>
          </button>
        </div>

        {selectedChip ? (
          <div className="mt-3 flex items-center justify-between rounded-2xl border-[1.5px] border-[#12B8D0] bg-[#EEF8FB] px-4 py-3.5">
            <p className="text-base font-extrabold text-[#12B8D0]">
              {selectedChip.timeLabel}
            </p>
            <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[#12B8D0] text-white">
              ✓
            </span>
          </div>
        ) : null}

        {cancelPolicyText ? (
          <div className="mt-4 flex items-start gap-3 border-t border-[#E4EBEE] pt-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E5F9FC] text-[#12B8D0]">
              <RotateCcw size={16} strokeWidth={2.4} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#8A9199]">
                {t('event.cancelLabel')}
              </p>
              <p className="mt-0.5 text-sm font-extrabold text-[#12202A]">
                {cancelPolicyText}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {calendarOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={t('common.close')}
            className="absolute inset-0 bg-[#0B1A22]/45 backdrop-blur-sm"
            onClick={() => setCalendarOpen(false)}
          />
          <div
            role="dialog"
            aria-modal
            className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#E4EBEE] px-5 py-4">
              <h2 className="text-lg font-extrabold">{t('event.calendarTitle')}</h2>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="text-sm font-extrabold text-[#12B8D0]"
              >
                {t('common.close')}
              </button>
            </div>
            <div className="px-4 pb-5 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  aria-label={t('event.prevMonth')}
                  onClick={() => setCursor(new Date(year, monthIndex - 1, 1))}
                  className="grid h-9 w-10 place-items-center text-[#12202A]"
                >
                  <ChevronLeft size={22} />
                </button>
                <p className="text-[17px] font-extrabold">
                  {locale === 'en'
                    ? `${MONTH_EN[monthIndex]} ${year}`
                    : t('event.monthTitle', { year, month: monthIndex + 1 })}
                </p>
                <button
                  type="button"
                  aria-label={t('event.nextMonth')}
                  onClick={() => setCursor(new Date(year, monthIndex + 1, 1))}
                  className="grid h-9 w-10 place-items-center text-[#12202A]"
                >
                  <ChevronRight size={22} />
                </button>
              </div>

              <div className="mb-1.5 grid grid-cols-7">
                {weekdayLabels.map((label, index) => (
                  <span
                    key={label}
                    className={`text-center text-xs font-extrabold ${
                      index === 0
                        ? 'text-[#E11D48]'
                        : index === 6
                          ? 'text-[#2563EB]'
                          : 'text-[#8A9199]'
                    }`}
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {cells.map((day, index) => {
                  if (day == null) {
                    return <div key={`e-${index}`} className="aspect-square" />;
                  }
                  const stamp = stampFromParts(year, monthIndex, day);
                  const hasEvent = eventDates.has(stamp);
                  const selected = stamp === selectedChip?.date;
                  const isToday = stamp === todayStamp;
                  const weekday = new Date(year, monthIndex, day).getDay();
                  return (
                    <button
                      key={stamp}
                      type="button"
                      disabled={!hasEvent}
                      onClick={() => selectDate(stamp)}
                      className="grid aspect-square place-items-center p-0.5"
                    >
                      <span
                        className={`flex h-11 w-10 flex-col items-center justify-center gap-0.5 rounded-xl ${
                          selected
                            ? 'bg-[#12B8D0] text-white'
                            : hasEvent
                              ? 'bg-[#E5F9FC] text-[#12202A]'
                              : isToday
                                ? 'bg-[#F2FCFE] text-[#12202A]'
                                : 'text-[#C5CCD3]'
                        }`}
                      >
                        <span
                          className={`text-[15px] font-extrabold ${
                            !hasEvent && !selected
                              ? 'font-medium'
                              : weekday === 0 && !selected
                                ? 'text-[#E11D48]'
                                : weekday === 6 && !selected
                                  ? 'text-[#2563EB]'
                                  : ''
                          }`}
                        >
                          {day}
                        </span>
                        {hasEvent ? (
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              selected ? 'bg-white' : 'bg-[#12B8D0]'
                            }`}
                          />
                        ) : (
                          <span className="h-1.5 w-1.5" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 text-center text-[13px] font-semibold leading-5 text-[#5B6B75]">
                {t('event.calendarHint')}
              </p>
            </div>
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={() => setCalendarOpen(false)}
              className="absolute right-3 top-3 hidden"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
