import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import {
  ORGANIZER_GUIDELINE_INTRO,
  ORGANIZER_GUIDELINE_SECTIONS,
  ORGANIZER_GUIDELINE_UPDATED_AT,
} from '@/lib/organizerGuidelines';

function asStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : fallback;
}

export default function OrganizerGuidelinesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SettingsHeader title={t('organizerGuidelines.title')} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 32) },
        ]}
      >
        <Text style={styles.intro}>
          {t('organizerGuidelines.intro', {
            defaultValue: ORGANIZER_GUIDELINE_INTRO,
          })}
        </Text>
        <Text style={styles.updated}>
          {t('organizerGuidelines.updatedAt', {
            date: ORGANIZER_GUIDELINE_UPDATED_AT,
          })}
        </Text>

        {ORGANIZER_GUIDELINE_SECTIONS.map((section) => {
          const sectionKey = `organizerGuidelines.sections.${section.id}`;
          const title = t(`${sectionKey}.title`, {
            defaultValue: section.title,
          });
          const paragraphs = asStringArray(
            t(`${sectionKey}.paragraphs`, {
              returnObjects: true,
              defaultValue: section.paragraphs,
            }),
            section.paragraphs,
          );
          const bullets = asStringArray(
            t(`${sectionKey}.bullets`, {
              returnObjects: true,
              defaultValue: section.bullets ?? [],
            }),
            section.bullets ?? [],
          );
          return (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {paragraphs.map((p, index) => (
              <Text key={`${section.id}-p-${index}`} style={styles.paragraph}>
                {p}
              </Text>
            ))}
            {bullets.length ? (
              <View style={styles.bullets}>
                {bullets.map((item, index) => (
                  <View key={`${section.id}-b-${index}`} style={styles.bulletRow}>
                    <Text style={styles.bulletMark}>・</Text>
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          );
        })}

        <View style={styles.links}>
          <Pressable
            style={styles.linkRow}
            onPress={() => router.push('/settings/contact')}
            accessibilityRole="button"
            accessibilityLabel={t('organizerGuidelines.contactA11y')}
          >
            <Text style={styles.linkLabel}>{t('organizerGuidelines.contact')}</Text>
            <Text style={styles.linkChevron}>›</Text>
          </Pressable>
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
    gap: 16,
  },
  intro: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  updated: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
    marginTop: -8,
  },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.2,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  bullets: {
    gap: 6,
    marginTop: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 2,
  },
  bulletMark: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  links: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  linkRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  linkChevron: {
    fontSize: 22,
    fontWeight: '300',
    color: theme.colors.textMuted,
  },
});
