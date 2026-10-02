import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppleLogoMark,
  GoogleGMark,
  LineSpeechMark,
} from '@/components/socialBrandMarks';
import { theme } from '@/constants/theme';
import { loginMethodLabel, type AuthUser } from '@/lib/auth';

type LoginProviderBadgeProps = {
  provider?: AuthUser['provider'];
};

/** アカウント画面用: 公式ロゴ + プロバイダー名 */
export default function LoginProviderBadge({
  provider,
}: LoginProviderBadgeProps) {
  const { t } = useTranslation();
  const label = loginMethodLabel(provider);

  return (
    <View
      style={styles.row}
      accessibilityLabel={t('auth.loginMethodA11y', { label })}
    >
      <View style={styles.iconWrap}>
        {provider === 'line' ? (
          <View style={[styles.badge, styles.lineBadge]}>
            <LineSpeechMark size={14} color="#FFFFFF" />
          </View>
        ) : provider === 'google' ? (
          <View style={[styles.badge, styles.googleBadge]}>
            <GoogleGMark size={16} />
          </View>
        ) : provider === 'apple' ? (
          <View style={[styles.badge, styles.appleBadge]}>
            <AppleLogoMark size={14} color="#FFFFFF" />
          </View>
        ) : (
          <View style={[styles.badge, styles.fallbackBadge]}>
            <Text style={styles.fallbackMark}>@</Text>
          </View>
        )}
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  iconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineBadge: {
    backgroundColor: '#06C755',
  },
  googleBadge: {
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17, 24, 39, 0.12)',
  },
  appleBadge: {
    backgroundColor: '#111827',
  },
  fallbackBadge: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  fallbackMark: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  label: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
});
