import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import { runGuardedSocialSignIn } from '@/lib/socialSignInGuard';
import { theme } from '@/constants/theme';

type LoginProps = {
  /** true のとき「ゲストとして続ける」を表示 */
  allowGuest?: boolean;
};

export default function Login({ allowGuest = true }: LoginProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signInWithSocial, continueAsGuest } = useAuth();
  const [loading, setLoading] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(
    null,
  );
  const busyRef = useRef(false);

  const goHome = () => {
    router.replace('/(tabs)/home');
  };

  const handleGuest = () => {
    if (busyRef.current) return;
    continueAsGuest();
    goHome();
  };

  const handleProvider = (provider: SocialProvider) => {
    void runGuardedSocialSignIn({
      provider,
      busyRef,
      setBusy: (busy) => {
        setLoading(busy);
        setPendingProvider(busy ? provider : null);
      },
      signIn: signInWithSocial,
      showError: (message) => {
        if (isAccountBannedMessage(message)) {
          showAccountBannedAlert(message);
          return;
        }
        Alert.alert(t('auth.loginErrorTitle'), message);
      },
      showBanned: showAccountBannedAlert,
    }).then((outcome) => {
      if (!outcome.ignored && outcome.result?.ok) goHome();
    });
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
          <Text style={styles.title}>{t('auth.welcomeTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.primaryDark} />
            <Text style={styles.loadingText}>{t('auth.processing')}</Text>
          </View>
        ) : null}

        <SocialLoginButtons
          disabled={loading}
          pendingProvider={pendingProvider}
          onPress={handleProvider}
        />

        {allowGuest ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.continueAsGuest')}
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            hitSlop={8}
            onPress={handleGuest}
          >
            <Text style={styles.guestText}>{t('auth.continueAsGuest')}</Text>
          </Pressable>
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
