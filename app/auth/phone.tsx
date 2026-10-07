import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PhoneVerificationModal from '@/components/PhoneVerificationModal';
import { theme } from '@/constants/theme';
import { useAuth } from '@/lib/authContext';
import { usePhoneVerification } from '@/lib/phoneVerificationContext';
import {
  confirmPhoneOtp,
  requestPhoneOtp,
} from '@/lib/phoneVerification';

/**
 * 電話番号認証の専用ルート。
 * フォームを画面に直接埋め込む（iOS で root Modal が見えない対策）。
 */
export default function PhoneAuthScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLoggedIn, requireAuth, isReady: authReady } = useAuth();
  const {
    isPhoneVerified,
    isReady: phoneReady,
    isPhoneGateRequired,
    closePhoneVerification,
    completePhoneVerification,
  } = usePhoneVerification();

  useEffect(() => {
    if (!authReady) return;
    if (!isLoggedIn) {
      requireAuth(() => {
        router.replace('/auth/phone');
      }, 'create-event');
    }
  }, [authReady, isLoggedIn, requireAuth, router]);

  useEffect(() => {
    if (!phoneReady) return;
    if (!isPhoneVerified) return;
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/home');
    }
  }, [phoneReady, isPhoneVerified, router]);

  useEffect(() => {
    if (__DEV__) {
      console.log('[phone] /auth/phone mount', {
        authReady,
        phoneReady,
        isLoggedIn,
        isPhoneVerified,
        isPhoneGateRequired,
      });
    }
  }, [
    authReady,
    phoneReady,
    isLoggedIn,
    isPhoneVerified,
    isPhoneGateRequired,
  ]);

  const leave = () => {
    closePhoneVerification();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/home');
    }
  };

  // ログイン待ち / 認証済みで戻る途中だけスピナー
  if (!authReady || !isLoggedIn) {
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
        <Text style={styles.label}>{t('auth.phonePreparing')}</Text>
      </View>
    );
  }

  if (phoneReady && isPhoneVerified) {
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
        <Text style={styles.label}>{t('auth.phonePreparing')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.host}>
      <PhoneVerificationModal
        embedded
        visible
        required={isPhoneGateRequired}
        onClose={leave}
        onVerified={completePhoneVerification}
        requestOtp={async (phoneInput, options) => {
          try {
            return await requestPhoneOtp(phoneInput, options);
          } catch (error) {
            return {
              ok: false as const,
              error:
                error instanceof Error
                  ? error.message
                  : t('auth.phone.errorSendFailed'),
            };
          }
        }}
        confirmOtp={async (phoneE164, code, channel) => {
          try {
            return await confirmPhoneOtp(phoneE164, code, channel);
          } catch (error) {
            return {
              ok: false as const,
              error:
                error instanceof Error
                  ? error.message
                  : t('auth.phone.errorCodeInvalid'),
            };
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
  },
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
