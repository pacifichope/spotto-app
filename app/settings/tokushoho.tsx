import { useEffect } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import { LEGAL_EXTERNAL_URLS } from '@/lib/settings';

/** 旧アプリ内ルート互換。外部ブラウザで特商法表記を開き設定へ戻る */
export default function TokushohoSettingsScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await Linking.openURL(LEGAL_EXTERNAL_URLS.tokushoho);
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
      <SettingsHeader title="特定商取引法に基づく表記" />
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.loadingText}>ブラウザで開いています…</Text>
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
