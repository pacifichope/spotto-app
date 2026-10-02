import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import {
  formatDateStamp,
  occurrenceSlotKey,
  sessionFromEvent,
  sortEventSessions,
  type EventSession,
  type SportEvent,
} from '@/lib/events';

const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;
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

export type ScheduleSlot = {
  key: string;
  date: string;
  time: string;
  endTime?: string;
  label: string;
  session: EventSession;
  /** シリーズ開催の場合、その開催回の event id */
  eventId?: string;
};

export type ScheduleDay = {
  date: string;
  weekday: string;
  dayNum: string;
  month: string;
  slots: ScheduleSlot[];
};

export type ScheduleSelection = {
  key: string;
  session: EventSession;
  eventId?: string;
};

function parseStamp(stamp: string) {
  const [y, m, d] = stamp.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatTimeRange(time: string, endTime?: string) {
  if (!endTime) return time;
  return `${time} - ${endTime}`;
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

function daysFromSlots(slots: ScheduleSlot[]): ScheduleDay[] {
  const byDate = new Map<string, ScheduleSlot[]>();
  for (const slot of slots) {
    const list = byDate.get(slot.date) ?? [];
    list.push(slot);
    byDate.set(slot.date, list);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySlots]) => {
      const d = parseStamp(date);
      return {
        date,
        weekday: WEEKDAY_EN[d.getDay()] ?? '',
        dayNum: String(d.getDate()),
        month: MONTH_EN[d.getMonth()] ?? '',
        slots: daySlots,
      };
    });
}

/**
 * 単一イベント（peers 無し）の日付タブ。
 * レガシー sessions に別日があっても DB 参加は 1 id のため、独立日付としては出さない。
 * 同一日の複数時間枠のみ選択可能にする。
 */
export function buildEventScheduleDays(
  event: Pick<
    SportEvent,
    'id' | 'date' | 'time' | 'endTime' | 'endDate' | 'sessions'
  >,
): ScheduleDay[] {
  const primary = sessionFromEvent(event);
  const sameDaySessions =
    event.sessions && event.sessions.length > 0
      ? sortEventSessions(event.sessions).filter(
          (session) => session.date === primary.date,
        )
      : [];
  const sessions: EventSession[] =
    sameDaySessions.length > 0 ? sameDaySessions : [primary];

  const slots: ScheduleSlot[] = sessions.map((session) => ({
    key: `${event.id}|${session.date}|${session.time}|${session.endTime ?? ''}`,
    date: session.date,
    time: session.time,
    endTime: session.endTime,
    label: formatTimeRange(session.time, session.endTime),
    session,
    eventId: event.id,
  }));

  return daysFromSlots(slots);
}

/** 開催回ごとに別 event id の一覧を日付タブとして並べる */
export function buildSeriesScheduleDays(
  occurrences: SportEvent[],
): ScheduleDay[] {
  const slots: ScheduleSlot[] = occurrences.map((item) => {
    const session = sessionFromEvent(item);
    return {
      key: occurrenceSlotKey(item),
      date: session.date,
      time: session.time,
      endTime: session.endTime,
      label: formatTimeRange(session.time, session.endTime),
      session,
      eventId: item.id,
    };
  });
  return daysFromSlots(slots);
}

type EventScheduleSectionProps = {
  event: Pick<
    SportEvent,
    'id' | 'date' | 'time' | 'endTime' | 'endDate' | 'sessions'
  >;
  /**
   * 同一タイトル等の独立開催回。渡すと日付ごとに別 eventId を選択できる。
   * 未指定時は当該イベント単体（レガシー sessions 含む）のみ。
   */
  occurrenceEvents?: SportEvent[];
  selectedEventId?: string;
  onSelect?: (selection: ScheduleSelection) => void;
};

export default function EventScheduleSection({
  event,
  occurrenceEvents,
  selectedEventId,
  onSelect,
}: EventScheduleSectionProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const days = useMemo(() => {
    if (occurrenceEvents && occurrenceEvents.length > 0) {
      return buildSeriesScheduleDays(occurrenceEvents);
    }
    return buildEventScheduleDays(event);
  }, [event, occurrenceEvents]);

  const eventDates = useMemo(
    () => new Set(days.map((day) => day.date)),
    [days],
  );

  const initialSlot = useMemo(() => {
    if (!days.length) return null;
    if (selectedEventId) {
      for (const day of days) {
        const match = day.slots.find((slot) => slot.eventId === selectedEventId);
        if (match) return match;
      }
    }
    return days[0]?.slots[0] ?? null;
  }, [days, selectedEventId]);

  const [selectedDate, setSelectedDate] = useState(initialSlot?.date ?? '');
  const [selectedSlotKey, setSelectedSlotKey] = useState(
    initialSlot?.key ?? '',
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const stamp = initialSlot?.date;
    if (stamp) {
      const d = parseStamp(stamp);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (!days.length) return;
    // 開催回（eventId）単位で選択を同期。親が別 id に載せ替えたら必ず追従する。
    let nextSlot: ScheduleSlot | undefined;
    if (selectedEventId) {
      for (const day of days) {
        const match = day.slots.find((slot) => slot.eventId === selectedEventId);
        if (match) {
          nextSlot = match;
          break;
        }
      }
    }
    if (!nextSlot) {
      const stillValid = days.some((day) =>
        day.slots.some((slot) => slot.key === selectedSlotKey),
      );
      if (stillValid) {
        const day = days.find((item) => item.date === selectedDate) ?? days[0];
        nextSlot =
          day?.slots.find((slot) => slot.key === selectedSlotKey) ??
          day?.slots[0];
      } else {
        nextSlot = days[0]?.slots[0];
      }
    }
    if (!nextSlot) return;
    if (nextSlot.date !== selectedDate) setSelectedDate(nextSlot.date);
    if (nextSlot.key !== selectedSlotKey) setSelectedSlotKey(nextSlot.key);
  }, [days, selectedEventId, selectedDate, selectedSlotKey]);

  useEffect(() => {
    if (!calendarOpen) return;
    const focus = selectedDate || days[0]?.date;
    if (!focus) return;
    const d = parseStamp(focus);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    // 開いた瞬間だけフォーカス月へ。以降の月移動はユーザー操作を優先
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarOpen]);

  const emitSelect = (slot: ScheduleSlot) => {
    setSelectedDate(slot.date);
    setSelectedSlotKey(slot.key);
    onSelect?.({
      key: slot.key,
      session: slot.session,
      eventId: slot.eventId,
    });
  };

  const selectDateFromCalendar = (stamp: string) => {
    if (!eventDates.has(stamp)) return;
    const day = days.find((item) => item.date === stamp);
    const first = day?.slots[0];
    if (!first) return;
    emitSelect(first);
    setCalendarOpen(false);
  };

  const activeDay = days.find((day) => day.date === selectedDate) ?? days[0];
  const slots = activeDay?.slots ?? [];

  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const cells = useMemo(
    () => buildMonthCells(year, monthIndex),
    [year, monthIndex],
  );
  const todayStamp = useMemo(() => formatDateStamp(new Date()), []);

  const goPrevMonth = () => {
    setCursor(new Date(year, monthIndex - 1, 1));
  };

  const goNextMonth = () => {
    setCursor(new Date(year, monthIndex + 1, 1));
  };

  if (!days.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>{t('events.schedule.sectionLabel')}</Text>

      <View style={styles.dateRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dateScrollView}
          contentContainerStyle={styles.dateScroll}
        >
          {days.map((day) => {
            const selected = day.date === selectedDate;
            return (
              <Pressable
                key={day.date}
                onPress={() => {
                  const first = day.slots[0];
                  if (first) emitSelect(first);
                }}
                style={[styles.dateChip, selected && styles.dateChipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${day.weekday} ${day.month} ${day.dayNum}`}
              >
                <Text
                  style={[
                    styles.dateWeekday,
                    selected && styles.dateTextSelected,
                  ]}
                >
                  {day.weekday}
                </Text>
                <Text
                  style={[
                    styles.dateDayNum,
                    selected && styles.dateDayNumSelected,
                  ]}
                >
                  {day.dayNum}
                </Text>
                <Text
                  style={[
                    styles.dateMonth,
                    selected && styles.dateTextSelected,
                  ]}
                >
                  {day.month}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          style={styles.datePickerBtn}
          onPress={() => setCalendarOpen(true)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('events.schedule.pickDateA11y')}
        >
          <Feather
            name="calendar"
            size={20}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.datePickerLabel}>Date</Text>
        </Pressable>
      </View>

      <View style={styles.slotList}>
        {slots.map((slot) => {
          const selected = slot.key === selectedSlotKey;
          return (
            <Pressable
              key={slot.key}
              onPress={() => emitSelect(slot)}
              style={[styles.slotCard, selected && styles.slotCardSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[styles.slotTime, selected && styles.slotTimeSelected]}
              >
                {slot.label}
              </Text>
              {selected ? (
                <View style={styles.slotCheck}>
                  <Feather name="check" size={12} color="#FFF" />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={calendarOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        transparent={false}
        onRequestClose={() => setCalendarOpen(false)}
      >
        <View style={[styles.calModal, { paddingTop: insets.top || 12 }]}>
          <View style={styles.calHeader}>
            <Text style={styles.calTitle}>{t('events.schedule.calendarTitle')}</Text>
            <Pressable
              onPress={() => setCalendarOpen(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Text style={styles.calClose}>{t('common.close')}</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.calBody,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.monthNav}>
              <Pressable
                onPress={goPrevMonth}
                hitSlop={12}
                style={styles.monthArrow}
                accessibilityRole="button"
                accessibilityLabel={t('events.schedule.prevMonth')}
              >
                <Text style={styles.monthArrowText}>‹</Text>
              </Pressable>
              <Text style={styles.monthTitle}>
                {t('events.schedule.monthTitle', {
                  year,
                  month: monthIndex + 1,
                  monthName: MONTH_EN[monthIndex] ?? '',
                })}
              </Text>
              <Pressable
                onPress={goNextMonth}
                hitSlop={12}
                style={styles.monthArrow}
                accessibilityRole="button"
                accessibilityLabel={t('events.schedule.nextMonth')}
              >
                <Text style={styles.monthArrowText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAY_INDEXES.map((index) => (
                <Text
                  key={index}
                  style={[
                    styles.weekLabel,
                    index === 0 && styles.sunday,
                    index === 6 && styles.saturday,
                  ]}
                >
                  {t(`events.weekdayShort.${index}`)}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, index) => {
                if (day == null) {
                  return <View key={`empty-${index}`} style={styles.dayCell} />;
                }
                const stamp = formatDateStamp(
                  new Date(year, monthIndex, day),
                );
                const hasEvent = eventDates.has(stamp);
                const selected = stamp === selectedDate;
                const isToday = stamp === todayStamp;
                const weekday = new Date(year, monthIndex, day).getDay();
                return (
                  <Pressable
                    key={stamp}
                    style={styles.dayCell}
                    onPress={() => selectDateFromCalendar(stamp)}
                    disabled={!hasEvent}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: !hasEvent }}
                    accessibilityLabel={t(
                      hasEvent
                        ? 'events.schedule.dayA11yWithEvent'
                        : 'events.schedule.dayA11y',
                      {
                        month: monthIndex + 1,
                        monthName: MONTH_EN[monthIndex] ?? '',
                        day,
                      },
                    )}
                  >
                    <View
                      style={[
                        styles.dayInner,
                        isToday && !selected && styles.dayToday,
                        selected && styles.daySelected,
                        hasEvent && !selected && styles.dayHasEvent,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          weekday === 0 && styles.sunday,
                          weekday === 6 && styles.saturday,
                          !hasEvent && styles.dayMuted,
                          selected && styles.daySelectedText,
                        ]}
                      >
                        {day}
                      </Text>
                      {hasEvent ? (
                        <View
                          style={[
                            styles.eventDot,
                            selected && styles.eventDotSelected,
                          ]}
                        />
                      ) : (
                        <View style={styles.eventDotPlaceholder} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.calHint}>
              {t('events.schedule.calendarHint')}
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    letterSpacing: 0.3,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateScrollView: {
    flex: 1,
  },
  dateScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  dateChip: {
    width: 56,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    gap: 2,
  },
  dateChipSelected: {
    backgroundColor: theme.colors.primaryDark,
  },
  dateWeekday: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  dateDayNum: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  dateDayNumSelected: {
    color: '#FFFFFF',
  },
  dateMonth: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  dateTextSelected: {
    color: 'rgba(255,255,255,0.85)',
  },
  datePickerBtn: {
    width: 52,
    height: 72,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  datePickerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  slotList: {
    gap: 8,
  },
  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  slotCardSelected: {
    backgroundColor: '#EEF8FB',
    borderColor: theme.colors.primaryDark,
  },
  slotTime: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  slotTimeSelected: {
    color: theme.colors.primaryDark,
  },
  slotCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calModal: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  calTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  calClose: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  calBody: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthArrow: {
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowText: {
    fontSize: 28,
    fontWeight: '300',
    color: theme.colors.text,
    lineHeight: 32,
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  sunday: {
    color: '#E11D48',
  },
  saturday: {
    color: '#2563EB',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  dayInner: {
    width: 40,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayToday: {
    backgroundColor: theme.colors.primaryMuted,
  },
  dayHasEvent: {
    backgroundColor: theme.colors.primarySoft,
  },
  daySelected: {
    backgroundColor: theme.colors.primaryDark,
  },
  dayText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  dayMuted: {
    color: '#C5CCD3',
    fontWeight: '500',
  },
  daySelectedText: {
    color: theme.colors.onPrimary,
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  eventDotSelected: {
    backgroundColor: theme.colors.onPrimary,
  },
  eventDotPlaceholder: {
    width: 5,
    height: 5,
  },
  calHint: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
