import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import { useAuth } from '@/lib/authContext';
import { usePhoneVerification } from '@/lib/phoneVerificationContext';

/**
 * 電話番号認証の専用ルート。
 * 設定などから `/auth/phone` へ遷移してモーダルを開く。
 */
export default function PhoneAuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLoggedIn, requireAuth, isReady: authReady } = useAuth();
  const {
    isPhoneVerified,
    openPhoneVerification,
    isReady: phoneReady,
  } = usePhoneVerification();

  useEffect(() => {
    if (!authReady || !phoneReady) return;

    if (!isLoggedIn) {
      requireAuth(() => {
        router.replace('/auth/phone');
      }, 'create-event');
      return;
    }

    if (isPhoneVerified) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/home');
      }
      return;
    }

    openPhoneVerification(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/home');
      }
    });
  }, [
    authReady,
    phoneReady,
    isLoggedIn,
    isPhoneVerified,
    openPhoneVerification,
    requireAuth,
    router,
  ]);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: Math.max(insets.top, 24),
          paddingBottom: Math.max(insets.bottom, 24),
        },
      ]}
    >
      <ActivityIndicator color={theme.colors.primaryDark} />
      <Text style={styles.label}>電話番号認証を準備しています…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: theme.colors.surfaceAlt,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
});
