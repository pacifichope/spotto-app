import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import { useAppLanguage } from '@/lib/useAppLanguage';
import type { AppLanguage } from '@/lib/languagePreference';

const OPTIONS: { value: AppLanguage; labelKey: string }[] = [
  { value: 'ja', labelKey: 'settings.languageJapanese' },
  { value: 'en', labelKey: 'settings.languageEnglish' },
];

export default function LanguageSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { language, changeLanguage } = useAppLanguage();

  return (
    <View style={styles.root}>
      <SettingsHeader title={t('settings.languageScreenTitle')} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 28) },
        ]}
      >
        <Text style={styles.hint}>{t('settings.languageHint')}</Text>
        <View style={styles.card}>
          {OPTIONS.map((option, index) => {
            const selected = language === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  void changeLanguage(option.value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t(option.labelKey)}
                style={[styles.row, index > 0 && styles.rowBorder]}
              >
                <Text style={[styles.label, selected && styles.labelSelected]}>
                  {t(option.labelKey)}
                </Text>
                <View
                  style={[styles.radio, selected && styles.radioSelected]}
                >
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  hint: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    paddingHorizontal: 4,
    lineHeight: 18,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  labelSelected: {
    color: theme.colors.primaryDark,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: theme.colors.primaryDark,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primaryDark,
  },
});
