'use client';

import { Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  defaultSessionForDate,
  formatDateStamp,
  formatSessionRowLabel,
  sortEventSessions,
  type EventSession,
} from '@/lib/createEventModel';
import { useLocale, useT } from '@/lib/i18n/locale-context';

type SessionDraft = EventSession & { id: string };

type Props = {
  open: boolean;
  initialSessions: EventSession[];
  onClose: () => void;
  onConfirm: (sessions: EventSession[]) => void;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

function toDraft(session: EventSession): SessionDraft {
  return { ...session, id: makeId() };
}

export function MultiSessionCalendarModal({
  open,
  initialSessions,
  onClose,
  onConfirm,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const today = useMemo(() => startOfToday(), [open]);
  const todayStamp = formatDateStamp(today);

  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [sessions, setSessions] = useState<SessionDraft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const seeded =
      initialSessions.length > 0
        ? sortEventSessions(initialSessions).map(toDraft)
        : [];
    setSessions(seeded);
    setEditingId(null);
    const first = seeded[0];
    if (first) {
      const [y, m] = first.date.split('-').map(Number);
      setCursor(new Date(y || today.getFullYear(), (m || 1) - 1, 1));
    } else {
      setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    }
  }, [open, initialSessions, today]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const cells = buildMonthCells(year, monthIndex);
  const selectedDates = new Set(sessions.map((s) => s.date));
  const weekdayLabels =
    locale === 'en'
      ? ['S', 'M', 'T', 'W', 'T', 'F', 'S']
      : ['日', '月', '火', '水', '木', '金', '土'];

  function toggleDate(day: number) {
    const stamp = formatDateStamp(new Date(year, monthIndex, day));
    if (stamp < todayStamp) return;
    setSessions((prev) => {
      const existing = prev.filter((s) => s.date === stamp);
      if (existing.length > 0) {
        return prev.filter((s) => s.date !== stamp);
      }
      return sortEventSessions([
        ...prev,
        toDraft(defaultSessionForDate(stamp)),
      ]) as SessionDraft[];
    });
  }

  function addTimeSlot() {
    const baseDate =
      sessions[sessions.length - 1]?.date ||
      formatDateStamp(today);
    const next = toDraft(defaultSessionForDate(baseDate));
    setSessions((prev) => [...prev, next]);
    setEditingId(next.id);
  }

  function updateSession(id: string, patch: Partial<EventSession>) {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  function removeSession(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function confirm() {
    if (sessions.length === 0) return;
    const cleaned = sortEventSessions(
      sessions.map(({ id: _id, ...rest }) => ({
        ...rest,
        endDate: rest.endDate || rest.date,
        endTime: rest.endTime || rest.time,
      })),
    );
    onConfirm(cleaned);
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-[#0B1A22]/5 backdrop-blur-md"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className="relative z-10 flex max-h-[min(94dvh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_24px_64px_rgba(11,26,34,0.28)] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#E4EBEE] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-extrabold text-[#5B6B75]"
          >
            {t('common.cancel')}
          </button>
          <h2 className="text-base font-extrabold text-[#12202A]">
            {t('createEvent.activityDateTime')}
          </h2>
          <button
            type="button"
            disabled={sessions.length === 0}
            onClick={confirm}
            className="grid h-9 w-9 place-items-center rounded-full bg-[#12B8D0] text-white disabled:opacity-40"
            aria-label={t('common.done')}
          >
            <Check size={18} strokeWidth={2.6} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="rounded-2xl bg-[#FAFCFD] p-3 ring-1 ring-[#E4EBEE]">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-full text-[#5B6B75] hover:bg-white"
                onClick={() =>
                  setCursor(new Date(year, monthIndex - 1, 1))
                }
                aria-label={t('createEvent.prevMonth')}
              >
                <ChevronLeft size={18} />
              </button>
              <p className="text-sm font-extrabold text-[#12202A]">
                {t('createEvent.calendarMonth', {
                  year,
                  month: monthIndex + 1,
                })}
              </p>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-full text-[#5B6B75] hover:bg-white"
                onClick={() =>
                  setCursor(new Date(year, monthIndex + 1, 1))
                }
                aria-label={t('createEvent.nextMonth')}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-[#8A9199]">
              {weekdayLabels.map((label, i) => (
                <span
                  key={`${label}-${i}`}
                  className={
                    i === 0
                      ? 'text-[#EF4444]'
                      : i === 6
                        ? 'text-[#3B82F6]'
                        : undefined
                  }
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((day, index) => {
                if (day == null) {
                  return <span key={`e-${index}`} className="h-9" />;
                }
                const stamp = formatDateStamp(
                  new Date(year, monthIndex, day),
                );
                const selected = selectedDates.has(stamp);
                const disabled = stamp < todayStamp;
                const dow = new Date(year, monthIndex, day).getDay();
                return (
                  <button
                    key={stamp}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleDate(day)}
                    className={`h-9 rounded-lg text-sm font-extrabold transition ${
                      selected
                        ? 'bg-[#12B8D0] text-white'
                        : disabled
                          ? 'text-[#C5CDD2]'
                          : dow === 0
                            ? 'text-[#EF4444] hover:bg-[#E5F9FC]'
                            : dow === 6
                              ? 'text-[#3B82F6] hover:bg-[#E5F9FC]'
                              : 'text-[#12202A] hover:bg-[#E5F9FC]'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.selectedDates')}
            </p>
            <div className="space-y-2">
              {sessions.map((session) => {
                const editing = editingId === session.id;
                return (
                  <div
                    key={session.id}
                    className="rounded-2xl bg-[#F4F7F8] px-3 py-2.5 ring-1 ring-[#E4EBEE]"
                  >
                    {editing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block text-[11px] font-bold text-[#8A9199]">
                            {t('createEvent.startTime')}
                            <input
                              type="time"
                              step={300}
                              className="mt-1 h-10 w-full rounded-xl border border-[#E4EBEE] bg-white px-2 text-sm font-bold"
                              value={session.time}
                              onChange={(e) =>
                                updateSession(session.id, {
                                  time: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="block text-[11px] font-bold text-[#8A9199]">
                            {t('createEvent.endTime')}
                            <input
                              type="time"
                              step={300}
                              className="mt-1 h-10 w-full rounded-xl border border-[#E4EBEE] bg-white px-2 text-sm font-bold"
                              value={session.endTime || session.time}
                              onChange={(e) =>
                                updateSession(session.id, {
                                  endTime: e.target.value,
                                  endDate: session.date,
                                })
                              }
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="text-xs font-extrabold text-[#12B8D0]"
                          onClick={() => setEditingId(null)}
                        >
                          {t('common.done')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left text-sm font-extrabold text-[#12202A]"
                          onClick={() => setEditingId(session.id)}
                        >
                          <span className="text-[#12B8D0]">
                            {formatSessionRowLabel(
                              session,
                              locale === 'en' ? 'en' : 'ja',
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSession(session.id)}
                          className="grid h-8 w-8 place-items-center rounded-full text-[#8A9199] hover:bg-white"
                          aria-label={t('common.delete')}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addTimeSlot}
              className="mt-3 flex h-11 w-full items-center justify-center gap-1 rounded-2xl border border-dashed border-[#12B8D0] text-sm font-extrabold text-[#12B8D0]"
            >
              <Plus size={16} />
              {t('createEvent.addTimeSlot')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
