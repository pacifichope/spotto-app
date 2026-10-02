import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EventTimePickerModal, {
  type PickedEventSchedule,
} from '@/components/EventTimePickerModal';
import { theme } from '@/constants/theme';
import {
  MONTH_KEYS,
  WEEKDAY_KEYS,
} from '@/lib/createEventLabels';
import {
  ALLOW_PAST_EVENT_DATES,
  PAST_EVENT_DATE_LOOKBACK_DAYS,
} from '@/lib/devTestFlags';
import {
  addMinutesToEventTime,
  defaultEventSchedule,
  formatDateStamp,
  sortEventSessions,
  type EventSession,
} from '@/lib/events';

type SessionDraft = EventSession & { id: string };

type MultiSessionCalendarModalProps = {
  visible: boolean;
  initialSessions: EventSession[];
  onClose: () => void;
  onConfirm: (sessions: EventSession[]) => void;
};

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseStamp(stamp: string) {
  const [year, month, day] = stamp.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultSessionForDate(date: string): SessionDraft {
  const fallback = defaultEventSchedule();
  const end = addMinutesToEventTime(date, fallback.time, 120);
  const sameDay = end.date === date;
  return {
    id: makeId(),
    date,
    time: fallback.time,
    endDate: sameDay ? end.date : date,
    endTime: sameDay ? end.time : '23:55',
  };
}

function toPicked(session: EventSession): PickedEventSchedule {
  return {
    date: session.date,
    time: session.time,
    endDate: session.endDate ?? session.date,
    endTime: session.endTime ?? session.time,
  };
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

function formatRowTime(session: EventSession) {
  if (!session.endTime) return session.time;
  if (session.endDate && session.endDate !== session.date) {
    const [, month, day] = session.endDate.split('-').map(Number);
    return `${session.time}-${month}/${day} ${session.endTime}`;
  }
  return `${session.time}-${session.endTime}`;
}

export default function MultiSessionCalendarModal({
  visible,
  initialSessions,
  onClose,
  onConfirm,
}: MultiSessionCalendarModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const weekdayLabel = (dayIndex: number) =>
    t(`create.weekdaysFull.${WEEKDAY_KEYS[dayIndex] ?? 'sun'}`);
  const monthTitle = (y: number, mIndex: number) =>
    t('create.calendar.monthTitle', {
      year: y,
      month: mIndex + 1,
      monthName: t(`create.monthsShort.${MONTH_KEYS[mIndex] ?? 'jan'}`),
    });
  const today = useMemo(() => startOfToday(), [visible]);
  const todayStamp = formatDateStamp(today);

  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [sessions, setSessions] = useState<SessionDraft[]>([]);
  const [lastSelectedDate, setLastSelectedDate] = useState<string | null>(null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pickerInitial, setPickerInitial] = useState<PickedEventSchedule>(
    defaultEventSchedule(),
  );

  useEffect(() => {
    if (!visible) {
      setTimePickerVisible(false);
      setEditingId(null);
      return;
    }
    const seeded = sortEventSessions(initialSessions).map((session) => ({
      ...session,
      id: makeId(),
    }));
    setSessions(seeded);
    setLastSelectedDate(seeded[seeded.length - 1]?.date ?? null);
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    // 開いた瞬間の initialSessions だけを取り込む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, today]);

  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const cells = useMemo(
    () => buildMonthCells(year, monthIndex),
    [year, monthIndex],
  );
  const selectedDates = useMemo(
    () => new Set(sessions.map((session) => session.date)),
    [sessions],
  );
  const orderedSessions = useMemo(
    () => sortEventSessions(sessions) as SessionDraft[],
    [sessions],
  );
  const earliestStamp = useMemo(() => {
    if (!ALLOW_PAST_EVENT_DATES) return todayStamp;
    const d = new Date(today);
    d.setDate(d.getDate() - PAST_EVENT_DATE_LOOKBACK_DAYS);
    return formatDateStamp(d);
  }, [today, todayStamp]);

  const canGoPrevMonth = useMemo(() => {
    const cursorMonth = new Date(year, monthIndex, 1);
    const earliest = new Date(
      Number(earliestStamp.slice(0, 4)),
      Number(earliestStamp.slice(5, 7)) - 1,
      1,
    );
    return cursorMonth > earliest;
  }, [year, monthIndex, earliestStamp]);

  const openTimePicker = (session: SessionDraft) => {
    setEditingId(session.id);
    setPickerInitial(toPicked(session));
    setTimePickerVisible(true);
  };

  const toggleDate = (stamp: string) => {
    if (stamp < earliestStamp) return;
    const existing = sessions.filter((session) => session.date === stamp);
    if (existing.length > 0) {
      setSessions((prev) => prev.filter((session) => session.date !== stamp));
      setLastSelectedDate((prev) => (prev === stamp ? null : prev));
      return;
    }
    const last = sessions[sessions.length - 1];
    const next =
      last && (last.endDate ?? last.date) === last.date
        ? {
            id: makeId(),
            date: stamp,
            time: last.time,
            endDate: stamp,
            endTime: last.endTime ?? last.time,
          }
        : defaultSessionForDate(stamp);
    setSessions((prev) => [...prev, next]);
    setLastSelectedDate(stamp);
  };

  const addTimeRange = () => {
    const target =
      lastSelectedDate ?? orderedSessions[orderedSessions.length - 1]?.date;
    if (!target) {
      Alert.alert(
        t('create.calendar.selectDateTitle'),
        t('create.calendar.selectDateFirst'),
      );
      return;
    }
    const next = defaultSessionForDate(target);
    setLastSelectedDate(target);
    openTimePicker(next);
  };

  const removeSession = (id: string) => {
    setSessions((prev) => prev.filter((session) => session.id !== id));
  };

  const handleTimeConfirm = (picked: PickedEventSchedule) => {
    if (!editingId) {
      setTimePickerVisible(false);
      return;
    }
    const nextSession: SessionDraft = {
      id: editingId,
      date: picked.date,
      time: picked.time,
      endDate: picked.endDate,
      endTime: picked.endTime,
    };
    setSessions((prev) => {
      const exists = prev.some((session) => session.id === editingId);
      if (exists) {
        return prev.map((session) =>
          session.id === editingId ? nextSession : session,
        );
      }
      return [...prev, nextSession];
    });
    setTimePickerVisible(false);
    setEditingId(null);
  };

  const handleConfirm = () => {
    if (orderedSessions.length === 0) {
      Alert.alert(
        t('create.calendar.selectDateTitle'),
        t('create.calendar.selectAtLeastOne'),
      );
      return;
    }
    onConfirm(
      orderedSessions.map(({ date, time, endDate, endTime }) => ({
        date,
        time,
        endDate,
        endTime,
      })),
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top || 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerSide}>
            <Text style={styles.headerLeft}>{t('common.cancel')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('create.calendar.title')}</Text>
          <Pressable onPress={handleConfirm} hitSlop={8} style={styles.headerSide}>
            <View style={styles.confirmBtn}>
              <Text style={styles.confirmMark}>✓</Text>
            </View>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.monthNav}>
            <Pressable
              onPress={() => {
                if (!canGoPrevMonth) return;
                setCursor(new Date(year, monthIndex - 1, 1));
              }}
              hitSlop={12}
              style={styles.monthArrow}
            >
              <Text
                style={[
                  styles.monthArrowText,
                  !canGoPrevMonth && styles.monthArrowDisabled,
                ]}
              >
                ‹
              </Text>
            </Pressable>
            <Text style={styles.monthTitle}>{monthTitle(year, monthIndex)}</Text>
            <Pressable
              onPress={() => setCursor(new Date(year, monthIndex + 1, 1))}
              hitSlop={12}
              style={styles.monthArrow}
            >
              <Text style={styles.monthArrowText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_KEYS.map((dayKey, index) => (
              <Text
                key={dayKey}
                style={[
                  styles.weekLabel,
                  index === 0 && styles.sunday,
                  index === 6 && styles.saturday,
                ]}
              >
                {weekdayLabel(index)}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((day, index) => {
              if (day == null) {
                return <View key={`empty-${index}`} style={styles.dayCell} />;
              }
              const stamp = formatDateStamp(new Date(year, monthIndex, day));
              const selected = selectedDates.has(stamp);
              const isToday = stamp === todayStamp;
              const disabled = stamp < earliestStamp;
              const weekday = new Date(year, monthIndex, day).getDay();
              return (
                <Pressable
                  key={stamp}
                  style={styles.dayCell}
                  onPress={() => toggleDate(stamp)}
                  disabled={disabled}
                >
                  <View
                    style={[
                      styles.dayInner,
                      isToday && !selected && styles.dayToday,
                      selected && styles.daySelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        weekday === 0 && styles.sunday,
                        weekday === 6 && styles.saturday,
                        disabled && styles.dayDisabled,
                        selected && styles.daySelectedText,
                      ]}
                    >
                      {day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>
            {t('create.calendar.selectedDates')}
          </Text>
          {orderedSessions.length === 0 ? (
            <Text style={styles.emptyHint}>
              {t('create.calendar.emptyHint')}
            </Text>
          ) : (
            orderedSessions.map((session) => {
              const [, month, day] = session.date.split('-').map(Number);
              return (
                <View key={session.id} style={styles.sessionRow}>
                  <Pressable
                    style={styles.sessionMain}
                    onPress={() => openTimePicker(session)}
                  >
                    <Text style={styles.sessionDate}>
                      {t('create.calendar.rowDate', {
                        month,
                        day,
                        weekday: weekdayLabel(parseStamp(session.date).getDay()),
                      })}
                    </Text>
                    <Text style={styles.sessionTime}>
                      {formatRowTime(session)}
                    </Text>
                    <Text style={styles.sessionChevron}>›</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeSession(session.id)}
                    hitSlop={8}
                    style={styles.removeBtn}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              );
            })
          )}

          <Pressable style={styles.addBtn} onPress={addTimeRange}>
            <Text style={styles.addBtnText}>
              {t('create.calendar.addTimeRange')}
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      <EventTimePickerModal
        visible={timePickerVisible}
        fixedDate={pickerInitial.date}
        initial={pickerInitial}
        onClose={() => {
          setTimePickerVisible(false);
          setEditingId(null);
        }}
        onConfirm={handleTimeConfirm}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerSide: {
    minWidth: 72,
  },
  headerLeft: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  confirmBtn: {
    alignSelf: 'flex-end',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmMark: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  scroll: {
    paddingHorizontal: 16,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 12,
  },
  monthArrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowText: {
    fontSize: 28,
    color: theme.colors.text,
    marginTop: -4,
  },
  monthArrowDisabled: {
    color: '#D1D5DB',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  sunday: {
    color: '#F87171',
  },
  saturday: {
    color: '#60A5FA',
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
  },
  dayInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  daySelected: {
    backgroundColor: theme.colors.primary,
  },
  dayText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  dayDisabled: {
    color: '#D1D5DB',
  },
  daySelectedText: {
    color: theme.colors.onPrimary,
    fontWeight: '800',
  },
  sectionLabel: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  emptyHint: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 20,
    marginBottom: 8,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 12,
    marginBottom: 8,
  },
  sessionMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionDate: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  sessionTime: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primaryDark,
  },
  sessionChevron: {
    fontSize: 18,
    color: theme.colors.textMuted,
  },
  removeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    fontSize: 18,
    color: theme.colors.textMuted,
  },
  addBtn: {
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryMuted,
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
});
