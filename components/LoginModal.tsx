import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LegalConsentNote } from '@/components/LegalLinks';
import SocialLoginButtons from '@/components/SocialLoginButtons';
import { theme } from '@/constants/theme';
import {
  isAccountBannedMessage,
  showAccountBannedAlert,
} from '@/lib/accountBan';
import {
  AUTH_REASON_COPY,
  type AuthReason,
  type AuthResult,
  type SocialProvider,
} from '@/lib/auth';
import {
  SOCIAL_LOGIN_USER_ERRORS,
  userFacingSocialLoginError,
} from '@/lib/socialLoginErrors';

/** ネイティブ SDK 認証の UI ガード（ブラウザ OAuth 待ちは使わない） */
const NATIVE_AUTH_UI_GUARD_MS = 90_000;

type LoginModalProps = {
  visible: boolean;
  reason?: AuthReason;
  presentation?: 'modal' | 'overlay';
  onClose: () => void;
  onSocialSignIn: (provider: SocialProvider) => Promise<AuthResult>;
};

export default function LoginModal({
  visible,
  reason,
  presentation = 'modal',
  onClose,
  onSocialSignIn,
}: LoginModalProps) {
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSubmitting(false);
  }, [visible, reason]);

  const copy = reason ? AUTH_REASON_COPY[reason] : null;

  const submitSocial = async (provider: SocialProvider) => {
    if (submitting) return;
    setSubmitting(true);
    let settled = false;
    const clearBusy = () => {
      if (settled) return;
      settled = true;
      setSubmitting(false);
    };
    const showLoginError = (message: string) => {
      if (isAccountBannedMessage(message)) {
        showAccountBannedAlert(message);
        return;
      }
      Alert.alert('ログインエラー', message);
    };
    const uiGuard = setTimeout(() => {
      clearBusy();
      showLoginError(SOCIAL_LOGIN_USER_ERRORS.timeout);
    }, NATIVE_AUTH_UI_GUARD_MS);
    try {
      const result = await onSocialSignIn(provider);
      if (!result.ok && !result.cancelled) {
        if (result.banned) {
          showAccountBannedAlert(result.error);
          return;
        }
        showLoginError(userFacingSocialLoginError(provider, result.error));
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[LoginModal] social sign-in', provider, error);
      }
      showLoginError(userFacingSocialLoginError(provider));
    } finally {
      clearTimeout(uiGuard);
      clearBusy();
    }
  };

  const body = (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <View style={styles.handle} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <Text style={styles.kicker}>spotto</Text>
          <Text style={styles.title}>{copy?.title ?? 'ログイン'}</Text>
          <Text style={styles.body}>
            {copy?.body ??
              'LINE・Google・Apple のいずれかのアカウントでログインできます。参加・送信・主催のときだけログインが必要です。'}
          </Text>

          <SocialLoginButtons
            disabled={submitting}
            onPress={(provider) => void submitSocial(provider)}
          />

          {submitting ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={theme.colors.primaryDark} />
              <Text style={styles.busyText}>認証中…</Text>
            </View>
          ) : null}

          <LegalConsentNote variant="continue" />

          <Pressable
            onPress={onClose}
            style={styles.guestBtn}
            accessibilityRole="button"
            accessibilityLabel="今は閲覧だけ続ける"
          >
            <Text style={styles.guestText}>今は閲覧だけ続ける</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );

  // overlay: 親 Modal 内でも前面に出せるよう View オーバーレイにする
  if (presentation === 'overlay') {
    if (!visible) return null;
    return <View style={styles.overlayRoot}>{body}</View>;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalFill}>{body}</View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalFill: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlayRoot: {
    ...Platform.select({
      web: { position: 'fixed' as const },
      default: { position: 'absolute' as const },
    }),
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginTop: 10,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.primaryDark,
    letterSpacing: 0.4,
  },
  title: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
  },
  body: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
  },
  busyRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  busyText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  guestBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  guestText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
});
