import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import {
  ORGANIZER_GUIDELINE_INTRO,
  ORGANIZER_GUIDELINE_SECTIONS,
  ORGANIZER_GUIDELINE_UPDATED_AT,
} from '@/lib/organizerGuidelines';

export default function OrganizerGuidelinesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SettingsHeader title="主催者ガイドライン" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 32) },
        ]}
      >
        <Text style={styles.intro}>{ORGANIZER_GUIDELINE_INTRO}</Text>
        <Text style={styles.updated}>更新日: {ORGANIZER_GUIDELINE_UPDATED_AT}</Text>

        {ORGANIZER_GUIDELINE_SECTIONS.map((section) => (
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

        <View style={styles.links}>
          <Pressable
            style={styles.linkRow}
            onPress={() => router.push('/settings/contact')}
            accessibilityRole="button"
            accessibilityLabel="お問い合わせへ"
          >
            <Text style={styles.linkLabel}>お問い合わせ</Text>
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
