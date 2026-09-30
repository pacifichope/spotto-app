import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';
import { LEGAL_DOC_META } from '@/lib/legalDocuments';
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
  const title = LEGAL_DOC_META[document]?.title ?? '法的文書';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>
        外部ブラウザで最新の内容をご確認ください。
      </Text>
      <Pressable
        style={styles.button}
        onPress={() => {
          void openLegalDocument(document);
        }}
        accessibilityRole="link"
        accessibilityLabel={`${title}を開く`}
      >
        <Text style={styles.buttonText}>ブラウザで開く</Text>
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
