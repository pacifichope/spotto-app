import AppModal from '@/components/AppModal';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import {
  DATE_FILTER_OPTIONS,
  EMPTY_FILTERS,
  LEVEL_FILTER_OPTIONS,
  type DateFilterId,
  type EventFilters,
  type LevelFilterId,
} from '@/lib/eventBrowse';

type FilterPickerModalProps = {
  visible: boolean;
  filters: EventFilters;
  onChange: (next: EventFilters) => void;
  onClose: () => void;
};

export default function FilterPickerModal({
  visible,
  filters,
  onChange,
  onClose,
}: FilterPickerModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const selectLevel = (level: LevelFilterId) => {
    onChange({
      ...filters,
      level,
    });
  };

  const toggleDate = (id: DateFilterId) => {
    onChange({
      ...filters,
      date: filters.date === id ? null : id,
      // プリセット選択時は横ストリップの特定日を解除
      day: null,
    });
  };

  return (
    <AppModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.title}>{t('home.filter.title')}</Text>
              <Text style={styles.subtitle}>{t('home.filter.subtitle')}</Text>
            </View>
            <Pressable
              onPress={() => onChange(EMPTY_FILTERS)}
              hitSlop={8}
            >
              <Text style={styles.reset}>{t('home.filter.reset')}</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>{t('home.filter.levelSection')}</Text>
          <View style={styles.levelList}>
            {LEVEL_FILTER_OPTIONS.map((option) => {
              const selected = filters.level === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[styles.levelItem, selected && styles.levelItemSelected]}
                  onPress={() => selectLevel(option.id)}
                >
                  <View style={styles.levelBody}>
                    <Text
                      style={[
                        styles.levelLabel,
                        selected && styles.levelLabelSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text
                      style={[
                        styles.levelHint,
                        selected && styles.levelHintSelected,
                      ]}
                    >
                      {option.hint}
                    </Text>
                  </View>
                  {selected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.section}>{t('home.filter.dateSection')}</Text>
          <View style={styles.chips}>
            {DATE_FILTER_OPTIONS.map((option) => {
              const selected = filters.date === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleDate(option.id)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneText}>{t('home.filter.apply')}</Text>
          </Pressable>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  sheet: {
    zIndex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  reset: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primaryDark,
    marginTop: 4,
  },
  section: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 10,
  },
  levelList: {
    gap: 8,
    marginBottom: 18,
  },
  levelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceAlt,
    gap: 12,
  },
  levelItemSelected: {
    backgroundColor: theme.colors.primarySoft,
  },
  levelBody: {
    flex: 1,
    gap: 2,
  },
  levelLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  levelLabelSelected: {
    color: theme.colors.text,
  },
  levelHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  levelHintSelected: {
    color: theme.colors.textSecondary,
  },
  check: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceAlt,
  },
  chipSelected: {
    backgroundColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  doneBtn: {
    marginTop: 4,
    backgroundColor: theme.colors.text,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: {
    color: theme.colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
