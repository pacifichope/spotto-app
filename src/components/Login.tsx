import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SocialLoginButtons from '@/components/SocialLoginButtons';
import {
  isAccountBannedMessage,
  showAccountBannedAlert,
} from '@/lib/accountBan';
import { useAuth } from '@/lib/authContext';
import type { SocialProvider } from '@/lib/auth';
import {
  SOCIAL_LOGIN_USER_ERRORS,
  userFacingSocialLoginError,
} from '@/lib/socialLoginErrors';
import { theme } from '@/constants/theme';

const NATIVE_AUTH_UI_GUARD_MS = 90_000;

type LoginProps = {
  /** true のとき「ゲストとして続ける」を表示 */
  allowGuest?: boolean;
};

export default function Login({ allowGuest = true }: LoginProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signInWithSocial, continueAsGuest } = useAuth();
  const [loading, setLoading] = useState(false);

  const goHome = () => {
    router.replace('/(tabs)/home');
  };

  const handleGuest = () => {
    continueAsGuest();
    goHome();
  };

  const handleProvider = async (provider: SocialProvider) => {
    if (loading) return;
    setLoading(true);

    let settled = false;
    const clearBusy = () => {
      if (settled) return;
      settled = true;
      setLoading(false);
    };

    const showLoginError = (message: string) => {
      if (isAccountBannedMessage(message)) {
        showAccountBannedAlert(message);
        return;
      }
      Alert.alert('ログインエラー', message);
    };

    // UI 側の最終ガード: 内部がハングしてもローディングを必ず解除
    const uiGuard = setTimeout(() => {
      clearBusy();
      showLoginError(SOCIAL_LOGIN_USER_ERRORS.timeout);
    }, NATIVE_AUTH_UI_GUARD_MS);

    try {
      const result = await signInWithSocial(provider);

      if (!result.ok) {
        if (!result.cancelled) {
          if (result.banned) {
            showAccountBannedAlert(result.error);
            return;
          }
          showLoginError(userFacingSocialLoginError(provider, result.error));
        }
        return;
      }
      goHome();
    } catch (error) {
      if (__DEV__) {
        console.warn('[Login] social sign-in', provider, error);
      }
      showLoginError(userFacingSocialLoginError(provider));
    } finally {
      clearTimeout(uiGuard);
      clearBusy();
    }
  };

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: Math.max(insets.top, 24),
          paddingBottom: Math.max(insets.bottom, 24),
        },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.brand}>spotto</Text>
          <Text style={styles.title}>ようこそ</Text>
          <Text style={styles.subtitle}>
            LINE・Google・Apple のいずれかでログインしてください
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.primaryDark} />
            <Text style={styles.loadingText}>認証を処理しています…</Text>
          </View>
        ) : null}

        <SocialLoginButtons
          disabled={loading}
          onPress={(provider) => void handleProvider(provider)}
        />

        {allowGuest ? (
          <Text
            style={styles.guestText}
            onPress={loading ? undefined : handleGuest}
            accessibilityRole="button"
            accessibilityLabel="ゲストとして続ける"
          >
            ゲストとして続ける
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    shadowColor: '#0B1220',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  header: {
    alignItems: 'center',
  },
  brand: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.primaryDark,
    letterSpacing: 0.4,
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
    textAlign: 'center',
  },
  loadingRow: {
    marginTop: 20,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  guestText: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
});
