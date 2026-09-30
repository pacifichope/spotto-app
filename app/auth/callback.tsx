import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { theme } from '@/constants/theme';
import { useAuth } from '@/lib/authContext';

/**
 * 旧 Supabase OAuth コールバック用ルート。
 * Firebase Auth 移行後は不要だが、ディープリンク互換のためホームへ誘導する。
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { isLoggedIn, isReady } = useAuth();

  useEffect(() => {
    if (!isReady) return;
    router.replace(isLoggedIn ? '/(tabs)/home' : '/');
  }, [isLoggedIn, isReady, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={theme.colors.primary} />
      <Text style={styles.text}>ログインを確認しています…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  text: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
});
