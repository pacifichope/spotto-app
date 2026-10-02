import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import {
  LEGAL_UPDATED_AT,
  legalDocIntro,
  legalDocTitle,
  legalSections,
  type LegalDocumentId,
} from '@/lib/legalDocuments';

export default function LegalDocumentScreen({
  document,
}: {
  document: LegalDocumentId;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const title = legalDocTitle(document);
  const intro = legalDocIntro(document);
  const sections = legalSections(document);

  return (
    <View style={styles.root}>
      <SettingsHeader title={title} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 32) },
        ]}
      >
        <Text style={styles.intro}>{intro}</Text>
        <Text style={styles.updated}>
          {t('settings.updatedOn', { date: LEGAL_UPDATED_AT })}
        </Text>

        {sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((p, index) => (
              <Text key={`${section.id}-p-${index}`} style={styles.paragraph}>
                {p}
              </Text>
            ))}
            {section.bullets?.length ? (
              <View style={styles.bullets}>
                {section.bullets.map((item, index) => (
                  <View key={`${section.id}-b-${index}`} style={styles.bulletRow}>
                    <Text style={styles.bulletMark}>・</Text>
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
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
    marginTop: -8,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.textSecondary,
  },
  bullets: {
    gap: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 2,
  },
  bulletMark: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.textSecondary,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.textSecondary,
  },
});
