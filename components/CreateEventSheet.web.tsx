import AppModal from '@/components/AppModal';
import {
  forwardRef,
  useImperativeHandle,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DEFAULT_CANCEL_POLICY,
  LEVEL_OPTIONS,
  SPORT_IMAGE_PRESETS,
  SPORT_OPTIONS,
  TIME_OPTIONS,
  type SkillLevel,
} from '@/lib/events';
import { KeyboardFormScrollView } from '@/components/KeyboardForm';
import { SportIcon } from '@/components/icons';
import { levelDisplayLabel, sportDisplayLabel } from '@/lib/createEventLabels';
import { theme } from '@/constants/theme';
import type {
  CreateEventPayload,
  CreateEventSheetProps,
  CreateEventSheetRef,
} from '@/components/createEventSheetTypes';

export type { CreateEventPayload, CreateEventSheetRef } from '@/components/createEventSheetTypes';

/**
 * Web 専用: @gorhom/bottom-sheet を使わず Modal で同等 UI を出す
 */
const CreateEventSheet = forwardRef<CreateEventSheetRef, CreateEventSheetProps>(
  function CreateEventSheet({ onSubmit }, ref) {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);
    const [title, setTitle] = useState('');
    const [sportIndex, setSportIndex] = useState(0);
    const [level, setLevel] = useState<SkillLevel>('誰でも歓迎');
    const [date, setDate] = useState('2026-08-22');
    const [time, setTime] = useState('10:00');
    const [location, setLocation] = useState('');

    const reset = () => {
      setTitle('');
      setSportIndex(0);
      setLevel('誰でも歓迎');
      setDate('2026-08-22');
      setTime('10:00');
      setLocation('');
    };

    useImperativeHandle(ref, () => ({
      present: () => setVisible(true),
      dismiss: () => {
        setVisible(false);
        reset();
      },
    }));

    const handleSubmit = () => {
      if (!title.trim() || !location.trim()) {
        Alert.alert(
          t('create.alerts.missingTitle'),
          t('create.sheet.missingBody'),
        );
        return;
      }

      const sport = SPORT_OPTIONS[sportIndex];
      const payload: CreateEventPayload = {
        title: title.trim(),
        sport: sport.label,
        emoji: sport.emoji,
        level,
        date,
        time,
        location: location.trim(),
        description: `${title.trim()}\n\n${t('create.sheet.defaultDescription')}`,
        imageUri:
          SPORT_IMAGE_PRESETS[sport.label] ?? SPORT_IMAGE_PRESETS.default,
        imageUris: [
          SPORT_IMAGE_PRESETS[sport.label] ?? SPORT_IMAGE_PRESETS.default,
        ],
        capacity: 12,
        priceYen: 0,
        cancelPolicy: DEFAULT_CANCEL_POLICY,
        protection: '主催者サポートのみ',
        scheduleType: 'single',
        latitude: 35.6595,
        longitude: 139.7005,
      };

      onSubmit?.(payload);
      Alert.alert(
        t('create.sheet.createdTitle'),
        `${payload.emoji} ${payload.title}\n${payload.location}\n${payload.date} ${payload.time} · ${levelDisplayLabel(payload.level)}`,
      );
      setVisible(false);
      reset();
    };

    return (
      <AppModal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setVisible(false);
          reset();
        }}
      >
        <View style={styles.backdrop}>
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
            <View style={styles.handle} />
            <KeyboardFormScrollView contentContainerStyle={styles.content}>
              <Text style={styles.heading}>{t('create.sheet.heading')}</Text>
              <Text style={styles.subheading}>
                {t('create.sheet.subheading')}
              </Text>

              <Text style={styles.label}>{t('create.sheet.titleLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('create.sheet.titlePlaceholder')}
                placeholderTextColor="#9AA59E"
                value={title}
                onChangeText={setTitle}
              />

              <Text style={styles.label}>{t('create.sheet.sportLabel')}</Text>
              <View style={styles.chipRow}>
                {SPORT_OPTIONS.map((option, index) => {
                  const active = index === sportIndex;
                  return (
                    <Pressable
                      key={option.label}
                      onPress={() => setSportIndex(index)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <SportIcon
                        sport={option.label}
                        size={14}
                        color={
                          active ? theme.colors.iconActive : undefined
                        }
                      />
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
                      >
                        {sportDisplayLabel(option.label)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>{t('create.sheet.levelLabel')}</Text>
              <View style={styles.chipRow}>
                {LEVEL_OPTIONS.map((option) => {
                  const active = option === level;
                  return (
                    <Pressable
                      key={levelDisplayLabel(option)}
                      onPress={() => setLevel(option)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>{t('create.sheet.dateLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('create.sheet.datePlaceholder')}
                placeholderTextColor="#9AA59E"
                value={date}
                onChangeText={setDate}
                autoCapitalize="none"
              />

              <Text style={styles.label}>{t('create.sheet.timeLabel')}</Text>
              <View style={styles.chipRow}>
                {TIME_OPTIONS.map((option) => {
                  const active = option === time;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setTime(option)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>{t('create.sheet.locationLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('create.sheet.locationPlaceholder')}
                placeholderTextColor="#9AA59E"
                value={location}
                onChangeText={setLocation}
              />

              <Pressable
                style={({ pressed }) => [
                  styles.submit,
                  pressed && styles.submitPressed,
                ]}
                onPress={handleSubmit}
              >
                <Text style={styles.submitText}>{t('create.sheet.submit')}</Text>
              </Pressable>

              <Pressable
                style={styles.cancel}
                onPress={() => {
                  setVisible(false);
                  reset();
                }}
              >
                <Text style={styles.cancelText}>{t('common.close')}</Text>
              </Pressable>
            </KeyboardFormScrollView>
          </SafeAreaView>
        </View>
      </AppModal>
    );
  },
);

export default CreateEventSheet;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: '#FAFCFA',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C9D4CE',
    marginTop: 10,
    marginBottom: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#14201A',
    marginBottom: 6,
  },
  subheading: {
    fontSize: 13,
    color: '#6B7A72',
    lineHeight: 19,
    marginBottom: 8,
  },
  label: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#314039',
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#E2EAE4',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: '#14201A',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#E2EAE4',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: theme.colors.iconActiveBg,
    borderColor: theme.colors.iconActive,
  },
  chipText: {
    fontSize: 13,
    color: theme.colors.iconInactive,
    fontWeight: '500',
  },
  chipTextActive: {
    color: theme.colors.iconActive,
    fontWeight: '700',
  },
  submit: {
    marginTop: 28,
    backgroundColor: '#14201A',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitPressed: {
    opacity: 0.88,
  },
  submitText: {
    color: theme.colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  cancel: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelText: {
    color: '#6B7A72',
    fontSize: 14,
    fontWeight: '600',
  },
});
