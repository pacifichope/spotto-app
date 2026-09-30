import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';
import { LEGAL_EXTERNAL_URLS } from '@/lib/settings';

type LegalConsentNoteProps = {
  /** signup = 新規登録の同意文。continue = ソーシャルログイン含む続行時 */
  variant: 'signup' | 'continue';
};

function openTerms() {
  void Linking.openURL(LEGAL_EXTERNAL_URLS.terms);
}

function openPrivacy() {
  void Linking.openURL(LEGAL_EXTERNAL_URLS.privacy);
}

function openTokushoho() {
  void Linking.openURL(LEGAL_EXTERNAL_URLS.tokushoho);
}

export function LegalConsentNote({ variant }: LegalConsentNoteProps) {
  const prefix =
    variant === 'signup' ? '登録することで、' : '続行することで、';

  return (
    <Text style={styles.note}>
      {prefix}
      <Text
        style={styles.link}
        onPress={openTerms}
        accessibilityRole="link"
        accessibilityLabel="利用規約"
      >
        利用規約
      </Text>
      および
      <Text
        style={styles.link}
        onPress={openPrivacy}
        accessibilityRole="link"
        accessibilityLabel="プライバシーポリシー"
      >
        プライバシーポリシー
      </Text>
      に同意したものとみなします
    </Text>
  );
}

export function LegalLinksRow() {
  return (
    <View style={styles.row} accessibilityRole="text">
      <Pressable
        onPress={openTerms}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel="利用規約"
      >
        <Text style={styles.rowLink}>利用規約</Text>
      </Pressable>
      <Text style={styles.dot}>·</Text>
      <Pressable
        onPress={openPrivacy}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel="プライバシーポリシー"
      >
        <Text style={styles.rowLink}>プライバシー</Text>
      </Pressable>
      <Text style={styles.dot}>·</Text>
      <Pressable
        onPress={openTokushoho}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel="特定商取引法に基づく表記"
      >
        <Text style={styles.rowLink}>特商法表記</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  link: {
    color: theme.colors.primaryDark,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 16,
  },
  rowLink: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline',
  },
  dot: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
});
