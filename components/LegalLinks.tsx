import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const prefix =
    variant === 'signup'
      ? t('auth.legal.signupPrefix')
      : t('auth.legal.continuePrefix');

  return (
    <Text style={styles.note}>
      {prefix}
      <Text
        style={styles.link}
        onPress={openTerms}
        accessibilityRole="link"
        accessibilityLabel={t('auth.legal.terms')}
      >
        {t('auth.legal.terms')}
      </Text>
      {t('auth.legal.and')}
      <Text
        style={styles.link}
        onPress={openPrivacy}
        accessibilityRole="link"
        accessibilityLabel={t('auth.legal.privacy')}
      >
        {t('auth.legal.privacy')}
      </Text>
      {t('auth.legal.suffix')}
    </Text>
  );
}

export function LegalLinksRow() {
  const { t } = useTranslation();
  return (
    <View style={styles.row} accessibilityRole="text">
      <Pressable
        onPress={openTerms}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel={t('auth.legal.terms')}
      >
        <Text style={styles.rowLink}>{t('auth.legal.terms')}</Text>
      </Pressable>
      <Text style={styles.dot}>·</Text>
      <Pressable
        onPress={openPrivacy}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel={t('auth.legal.privacy')}
      >
        <Text style={styles.rowLink}>{t('auth.legal.privacyShort')}</Text>
      </Pressable>
      <Text style={styles.dot}>·</Text>
      <Pressable
        onPress={openTokushoho}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel={t('auth.legal.tokushoho')}
      >
        <Text style={styles.rowLink}>{t('auth.legal.tokushohoShort')}</Text>
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
