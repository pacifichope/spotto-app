import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { theme } from '@/constants/theme';
import { legalDocTitle } from '@/lib/legalDocuments';
import {
  openLegalDocument,
  type LegalDocumentId,
} from '@/lib/settings';

/** 互換: アプリ内規約ページへの導線カード */
export default function LegalDocumentView({
  document,
}: {
  document: LegalDocumentId;
}) {
  const { t } = useTranslation();
  const title = legalDocTitle(document);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{t('legal.externalHint')}</Text>
      <Pressable
        style={styles.button}
        onPress={() => {
          void openLegalDocument(document);
        }}
        accessibilityRole="link"
        accessibilityLabel={t('legal.openA11y', { title })}
      >
        <Text style={styles.buttonText}>{t('legal.openInBrowser')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: {
    color: theme.colors.onPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
