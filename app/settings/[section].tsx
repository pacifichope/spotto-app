import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import {
  openLegalDocument,
  parseSettingsSection,
  type LegalDocumentId,
} from '@/lib/settings';

function isLegalDocument(value: string): value is LegalDocumentId {
  return value === 'terms' || value === 'privacy' || value === 'tokushoho';
}

/**
 * 旧ディープリンク互換。
 * 利用規約・プライバシー・特商法表記は外部ブラウザへ。
 */
export default function SettingsSectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const section = parseSettingsSection(params.section);

  useEffect(() => {
    if (!section || section === 'blocklist') {
      if (router.canGoBack()) router.back();
      else router.replace('/settings');
      return;
    }
    if (isLegalDocument(section)) {
      void openLegalDocument(section).finally(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/settings');
      });
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }, [section, router]);

  return (
    <View style={styles.root}>
      <SettingsHeader title="設定" />
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.loadingText}>ページを開いています…</Text>
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
