import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import { LEGAL_EXTERNAL_URLS } from '@/lib/settings';

/** 旧アプリ内ルート互換。外部ブラウザで利用規約を開き設定へ戻る */
export default function TermsSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await Linking.openURL(LEGAL_EXTERNAL_URLS.terms);
      } catch {
        // ignore
      }
      if (cancelled) return;
      if (router.canGoBack()) router.back();
      else router.replace('/settings');
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={styles.root}>
      <SettingsHeader title={t('settings.terms')} />
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.loadingText}>{t('settings.openingInBrowser')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
});
