import AppModal from '@/components/AppModal';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import { MONTH_KEYS, WEEKDAY_KEYS } from '@/lib/createEventLabels';
import {
  ALLOW_PAST_EVENT_DATES,
  PAST_EVENT_DATE_LOOKBACK_DAYS,
} from '@/lib/devTestFlags';
import {
  addMinutesToEventTime,
  formatDateStamp,
  parseEventDateTime,
} from '@/lib/events';
import i18n from '@/lib/i18n';

export type PickedEventSchedule = {
  date: string;
  time: string;
  endDate: string;
  endTime: string;
};

type EventTimePickerModalProps = {
  visible: boolean;
  initial: PickedEventSchedule;
  /** 指定時は日付ホイールを隠し、その日の開始・終了時刻だけ選ぶ */
  fixedDate?: string;
  onClose: () => void;
  onConfirm: (picked: PickedEventSchedule) => void;
};

type WheelItem = { key: string; label: string };

const ITEM_H = 48;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;
const DAY_COUNT = 45;
const MINUTE_STEP = 5;
function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateLabel(value: Date, today: Date) {
  const diffDays = Math.round(
    (value.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return i18n.t('create.timePicker.today');
  if (diffDays === 1) return i18n.t('create.timePicker.tomorrow');
  if (diffDays === -1) return i18n.t('create.timePicker.yesterday');
  const base = i18n.t('create.timePicker.dateFormat', {
    weekday: i18n.t(`create.weekdaysShort.${WEEKDAY_KEYS[value.getDay()]}`),
    month: value.getMonth() + 1,
    monthName: i18n.t(`create.monthsShort.${MONTH_KEYS[value.getMonth()]}`),
    day: value.getDate(),
  });
  if (diffDays < 0) return `${base} ${i18n.t('create.timePicker.past')}`;
  return base;
}

function buildAllDateItems(): WheelItem[] {
  const today = startOfToday();
  const lookback = ALLOW_PAST_EVENT_DATES ? PAST_EVENT_DATE_LOOKBACK_DAYS : 0;
  const total = lookback + DAY_COUNT;
  return Array.from({ length: total }, (_, index) => {
    const value = new Date(today);
    value.setDate(today.getDate() - lookback + index);
    return {
      key: formatDateStamp(value),
      label: dateLabel(value, today),
    };
  });
}

function buildHourItems(): WheelItem[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    key: pad2(hour),
    label: pad2(hour),
  }));
}

function buildMinuteItems(): WheelItem[] {
  return Array.from({ length: 60 / MINUTE_STEP }, (_, index) => {
    const minute = index * MINUTE_STEP;
    return { key: pad2(minute), label: pad2(minute) };
  });
}

const ALL_HOURS = buildHourItems();
const ALL_MINUTES = buildMinuteItems();

function indexOfKey(items: WheelItem[], key: string) {
  const found = items.findIndex((item) => item.key === key);
  return found >= 0 ? found : 0;
}

function roundMinuteKey(minute: string) {
  const rounded = Math.round(Number(minute || 0) / MINUTE_STEP) * MINUTE_STEP;
  if (rounded >= 60) return '00';
  return pad2(rounded);
}

function pickInList(items: WheelItem[], key: string) {
  if (items.some((item) => item.key === key)) return key;
  return items[0]?.key ?? key;
}

function dateItemForKey(key: string): WheelItem {
  const [year, month, day] = key.split('-').map(Number);
  const value = new Date(year, (month || 1) - 1, day || 1);
  return { key, label: dateLabel(value, startOfToday()) };
}

function fixedDateLabel(key: string) {
  const [, month, day] = key.split('-').map(Number);
  return `${month}/${day}`;
}

function WheelColumn({
  items,
  selectedIndex,
  onChange,
  flex,
  align = 'center',
}: {
  items: WheelItem[];
  selectedIndex: number;
  onChange: (index: number) => void;
  flex?: number;
  align?: 'left' | 'center';
}) {
  const scrollRef = useRef<ScrollView>(null);
  const safeIndex = Math.max(0, Math.min(items.length - 1, selectedIndex));
  const [active, setActive] = useState(safeIndex);

  const scrollToIndex = (index: number, animated: boolean) => {
    scrollRef.current?.scrollTo({
      y: index * ITEM_H,
      animated,
    });
  };

  const clampIndex = (index: number) =>
    Math.max(0, Math.min(items.length - 1, index));

  useEffect(() => {
    setActive(safeIndex);
    requestAnimationFrame(() => scrollToIndex(safeIndex, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (offsetY: number) => {
    const next = clampIndex(Math.round(offsetY / ITEM_H));
    setActive(next);
    onChange(next);
    scrollToIndex(next, true);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = clampIndex(
      Math.round(event.nativeEvent.contentOffset.y / ITEM_H),
    );
    if (next !== active) setActive(next);
  };

  return (
    <View style={[styles.wheel, flex != null && { flex }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        snapToAlignment="start"
        decelerationRate="fast"
        nestedScrollEnabled
        onScroll={handleScroll}
        onMomentumScrollEnd={(event) =>
          commit(event.nativeEvent.contentOffset.y)
        }
        onScrollEndDrag={(event) => {
          if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) {
            commit(event.nativeEvent.contentOffset.y);
          }
        }}
        scrollEventThrottle={16}
      >
        <View style={{ height: PAD }} />
        {items.map((item, index) => {
          const distance = Math.abs(index - active);
          return (
            <View key={item.key} style={styles.wheelItem}>
              <Text
                numberOfLines={1}
                style={[
                  styles.wheelText,
                  align === 'left' && styles.wheelTextLeft,
                  distance === 0 && styles.wheelTextActive,
                  distance === 1 && styles.wheelTextNear,
                  distance >= 2 && styles.wheelTextFar,
                ]}
              >
                {item.label}
              </Text>
            </View>
          );
        })}
        <View style={{ height: PAD }} />
      </ScrollView>
    </View>
  );
}

export default function EventTimePickerModal({
  visible,
  initial,
  fixedDate,
  onClose,
  onConfirm,
}: EventTimePickerModalProps) {
  const { t, i18n: i18nInstance } = useTranslation();
  const language = i18nInstance.language;
  const insets = useSafeAreaInsets();
  // 日付ラベルは言語に依存するため、言語変更・再オープンのたびに作り直す
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allDates = useMemo(() => buildAllDateItems(), [language, visible]);
  const [step, setStep] = useState<'start' | 'end'>('start');
  const [start, setStart] = useState(initial);
  const [dateKey, setDateKey] = useState(initial.date);
  const [hourKey, setHourKey] = useState('10');
  const [minuteKey, setMinuteKey] = useState('00');
  const [wheelsReady, setWheelsReady] = useState(false);

  const minEnd = useMemo(
    () => addMinutesToEventTime(start.date, start.time, MINUTE_STEP),
    [start.date, start.time],
  );

  const dateItems = useMemo(() => {
    if (fixedDate) {
      if (step !== 'end') return [dateItemForKey(fixedDate)];
      const keys = [fixedDate];
      if (minEnd.date > fixedDate) keys.push(minEnd.date);
      return keys
        .filter((key) => key >= minEnd.date)
        .map(dateItemForKey);
    }
    if (step !== 'end') return allDates;
    return allDates.filter((item) => item.key >= minEnd.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, minEnd.date, fixedDate, allDates, language]);

  const hourItems = useMemo(() => {
    if (step !== 'end') return ALL_HOURS;
    if (dateKey > minEnd.date) return ALL_HOURS;
    if (dateKey < minEnd.date) return [];
    return ALL_HOURS.filter((item) => item.key >= minEnd.time.slice(0, 2));
  }, [step, dateKey, minEnd.date, minEnd.time]);

  const minuteItems = useMemo(() => {
    if (step !== 'end') return ALL_MINUTES;
    if (dateKey > minEnd.date) return ALL_MINUTES;
    if (dateKey < minEnd.date) return [];
    if (hourKey > minEnd.time.slice(0, 2)) return ALL_MINUTES;
    if (hourKey < minEnd.time.slice(0, 2)) return [];
    return ALL_MINUTES.filter((item) => item.key >= minEnd.time.slice(3));
  }, [step, dateKey, hourKey, minEnd.date, minEnd.time]);

  const applyValue = (date: string, time: string) => {
    const [hour, minute] = time.split(':');
    setDateKey(date);
    setHourKey(pad2(Number(hour || 0)));
    setMinuteKey(roundMinuteKey(minute || '00'));
  };

  const showWheels = (
    date: string,
    time: string,
    nextStep: 'start' | 'end',
  ) => {
    applyValue(date, time);
    setStep(nextStep);
    setWheelsReady(false);
    setTimeout(() => setWheelsReady(true), 0);
  };

  useEffect(() => {
    if (!visible) {
      setWheelsReady(false);
      return;
    }
    setStart(initial);
    showWheels(fixedDate ?? initial.date, initial.time, 'start');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (step !== 'end' || !wheelsReady) return;
    const nextDate = pickInList(dateItems, dateKey);
    if (nextDate !== dateKey) setDateKey(nextDate);
  }, [step, wheelsReady, dateItems, dateKey]);

  useEffect(() => {
    if (step !== 'end' || !wheelsReady) return;
    const nextHour = pickInList(hourItems, hourKey);
    if (nextHour !== hourKey) setHourKey(nextHour);
  }, [step, wheelsReady, hourItems, hourKey]);

  useEffect(() => {
    if (step !== 'end' || !wheelsReady) return;
    const nextMinute = pickInList(minuteItems, minuteKey);
    if (nextMinute !== minuteKey) setMinuteKey(nextMinute);
  }, [step, wheelsReady, minuteItems, minuteKey]);

  const currentValue = () => ({
    date: dateKey,
    time: `${hourKey}:${minuteKey}`,
  });

  const handleConfirm = () => {
    const picked = currentValue();
    if (step === 'start') {
      let suggested = addMinutesToEventTime(picked.date, picked.time, 120);
      if (fixedDate && suggested.date !== picked.date) {
        suggested = { date: picked.date, time: '23:55' };
        const minSameDay = addMinutesToEventTime(
          picked.date,
          picked.time,
          MINUTE_STEP,
        );
        if (minSameDay.date !== picked.date || suggested.time <= picked.time) {
          suggested = minSameDay;
        }
      }
      setStart({
        date: picked.date,
        time: picked.time,
        endDate: suggested.date,
        endTime: suggested.time,
      });
      showWheels(suggested.date, suggested.time, 'end');
      return;
    }

    const startAt = parseEventDateTime(start.date, start.time).getTime();
    const endAt = parseEventDateTime(picked.date, picked.time).getTime();
    if (!Number.isFinite(endAt) || endAt <= startAt) {
      Alert.alert(
        t('create.timePicker.endErrorTitle'),
        t('create.timePicker.endErrorBody'),
      );
      showWheels(minEnd.date, minEnd.time, 'end');
      return;
    }

    onConfirm({
      date: start.date,
      time: start.time,
      endDate: picked.date,
      endTime: picked.time,
    });
  };

  const handleLeft = () => {
    if (step === 'end') {
      showWheels(start.date, start.time, 'start');
      return;
    }
    onClose();
  };

  const dateIndex = indexOfKey(dateItems, dateKey);
  const hourIndex = indexOfKey(hourItems, hourKey);
  const minuteIndex = indexOfKey(minuteItems, minuteKey);

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleLeft}
    >
      <View style={[styles.root, { paddingTop: insets.top || 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={handleLeft} hitSlop={12} style={styles.headerSide}>
            <Text style={styles.headerLeft}>
              {step === 'end' ? t('common.back') : t('common.cancel')}
            </Text>
          </Pressable>
          <Text style={styles.title}>
            {step === 'start'
              ? t('create.timePicker.startTitle')
              : t('create.timePicker.endTitle')}
          </Text>
          <Pressable onPress={handleConfirm} hitSlop={8} style={styles.headerSide}>
            <View style={styles.confirmBtn}>
              <Text style={styles.confirmMark}>✓</Text>
            </View>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          {fixedDate
            ? step === 'start'
              ? t('create.timePicker.subtitleStartFixed', {
                  date: fixedDateLabel(fixedDate),
                })
              : t('create.timePicker.subtitleEndFixed', {
                  date: fixedDateLabel(fixedDate),
                })
            : step === 'start'
              ? t('create.timePicker.subtitleStart')
              : t('create.timePicker.subtitleEnd')}
        </Text>

        {wheelsReady && dateItems.length > 0 && hourItems.length > 0 && minuteItems.length > 0 ? (
          <View style={styles.wheelsWrap}>
            <View style={styles.highlight} pointerEvents="none" />
            {fixedDate ? null : (
              <WheelColumn
                key={`date-${step}-${dateItems[0].key}-${dateItems.length}`}
                items={dateItems}
                selectedIndex={dateIndex}
                onChange={(index) => setDateKey(dateItems[index].key)}
                flex={1.5}
                align="left"
              />
            )}
            <WheelColumn
              key={`hour-${step}-${dateKey}-${hourItems[0].key}-${hourItems.length}`}
              items={hourItems}
              selectedIndex={hourIndex}
              onChange={(index) => setHourKey(hourItems[index].key)}
              flex={fixedDate ? 1 : undefined}
            />
            <Text style={styles.colon}>:</Text>
            <WheelColumn
              key={`minute-${step}-${dateKey}-${hourKey}-${minuteItems[0].key}-${minuteItems.length}`}
              items={minuteItems}
              selectedIndex={minuteIndex}
              onChange={(index) => setMinuteKey(minuteItems[index].key)}
              flex={fixedDate ? 1 : undefined}
            />
          </View>
        ) : (
          <View style={styles.wheelsWrap} />
        )}
      </View>
    </AppModal>
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
  subtitle: {
    textAlign: 'center',
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 12,
  },
  wheelsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ITEM_H * VISIBLE,
    marginHorizontal: 16,
    paddingHorizontal: 8,
  },
  highlight: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: ITEM_H * 2,
    height: ITEM_H,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  wheel: {
    height: ITEM_H * VISIBLE,
    minWidth: 64,
  },
  wheelItem: {
    height: ITEM_H,
    justifyContent: 'center',
  },
  wheelText: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    color: 'rgba(17,24,39,0.22)',
  },
  wheelTextLeft: {
    textAlign: 'left',
    paddingLeft: 12,
    fontSize: 18,
  },
  wheelTextActive: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 22,
  },
  wheelTextNear: {
    color: 'rgba(17,24,39,0.38)',
  },
  wheelTextFar: {
    color: 'rgba(17,24,39,0.18)',
  },
  colon: {
    width: 16,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 2,
  },
});
