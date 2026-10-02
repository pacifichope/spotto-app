import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';
import { formatDateStamp } from '@/lib/events';
import i18n from '@/lib/i18n';

/** Date#getDay() の順（日曜始まり） */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
/** 今日を含む約1ヶ月分（横スクロール） */
const DATE_STRIP_DAYS = 30;

export type WeekDateOption = {
  stamp: string;
  weekdayLabel: string;
  dayNum: number;
  isToday: boolean;
};

type HomeWeekDateStripProps = {
  selectedStamp: string | null;
  onSelect: (stamp: string | null) => void;
  /** 基準日（未指定時は端末の今日） */
  now?: Date;
};

export function buildWeekDateOptions(now = new Date()): WeekDateOption[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: DATE_STRIP_DAYS }, (_, index) => {
    const value = new Date(today);
    value.setDate(today.getDate() + index);
    const stamp = formatDateStamp(value);
    return {
      stamp,
      weekdayLabel:
        index === 0
          ? i18n.t('home.today')
          : i18n.t(`home.weekday.${WEEKDAY_KEYS[value.getDay()]!}`),
      dayNum: value.getDate(),
      isToday: index === 0,
    };
  });
}

export default function HomeWeekDateStrip({
  selectedStamp,
  onSelect,
  now,
}: HomeWeekDateStripProps) {
  const { t, i18n: i18nInstance } = useTranslation();
  const language = i18nInstance.language;
  // language は言語切替時にラベルを再生成するための依存
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => buildWeekDateOptions(now), [now, language]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {options.map((option) => {
          const selected = selectedStamp === option.stamp;
          return (
            <Pressable
              key={option.stamp}
              onPress={() => onSelect(selected ? null : option.stamp)}
              style={styles.item}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t('home.dateStripA11y', {
                weekday: option.weekdayLabel,
                day: option.dayNum,
              })}
            >
              <Text
                style={[
                  styles.weekday,
                  selected && styles.weekdaySelected,
                  option.isToday && !selected && styles.weekdayToday,
                ]}
              >
                {option.weekdayLabel}
              </Text>
              <Text style={[styles.dayNum, selected && styles.dayNumSelected]}>
                {option.dayNum}
              </Text>
              {selected ? <View style={styles.underline} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: -16,
  },
  row: {
    paddingHorizontal: 16,
    gap: 4,
    alignItems: 'center',
  },
  item: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  weekday: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  weekdayToday: {
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
  weekdaySelected: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  dayNum: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  dayNumSelected: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  underline: {
    marginTop: 2,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
});
