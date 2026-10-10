import AppModal from '@/components/AppModal';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
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
  getAuthReasonCopy,
  type AuthReason,
  type AuthResult,
  type SocialProvider,
} from '@/lib/auth';
import { runGuardedSocialSignIn } from '@/lib/socialSignInGuard';
import { useSettledWindow } from '@/lib/useSettledWindow';

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useSettledWindow();
  const [submitting, setSubmitting] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(
    null,
  );
  /** システム認可シートを出す直前に RN Modal を閉じる */
  const [sheetHidden, setSheetHidden] = useState(false);
  const busyRef = useRef(false);
  const dismissListeners = useRef<Array<() => void>>([]);
  const ipad = Platform.OS === 'ios' && Platform.isPad;
  const centerSheet = ipad || width >= 600;

  useEffect(() => {
    if (visible) return;
    busyRef.current = false;
    setSubmitting(false);
    setPendingProvider(null);
    setSheetHidden(false);
  }, [visible]);

  const copy = reason ? getAuthReasonCopy(reason) : null;

  const hideSheetForNativeAuth = useCallback(() => {
    // オーバーレイは別の ViewController を作らないので、隠さずに認可シートを出せる。
    // iPad では RN Modal を隠すと画面が空のまま固まり、戻ったあともタッチが死ぬ。
    // → web / overlay / iPad では絶対にシートを消さない。
    if (Platform.OS === 'web' || presentation === 'overlay' || ipad) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fallbackMs = 500;
      const timer = setTimeout(finish, fallbackMs);
      dismissListeners.current.push(() => {
        clearTimeout(timer);
        finish();
      });
      setSheetHidden(true);
    });
  }, [ipad, presentation]);

  const submitSocial = async (provider: SocialProvider) => {
    if (busyRef.current) return;
    let holdSheetUntilAlert = false;
    const outcome = await runGuardedSocialSignIn({
      provider,
      busyRef,
      setBusy: (busy) => {
        setSubmitting(busy);
        setPendingProvider(busy ? provider : null);
      },
      signIn: onSocialSignIn,
      beforeNativePrompt: hideSheetForNativeAuth,
      showError: (message) => {
        if (isAccountBannedMessage(message)) {
          showAccountBannedAlert(message);
          setSheetHidden(false);
          return;
        }
        holdSheetUntilAlert = true;
        Alert.alert(t('auth.loginErrorTitle'), message, [
          { text: t('common.ok'), onPress: () => setSheetHidden(false) },
        ]);
      },
      showBanned: (message) => {
        showAccountBannedAlert(message);
        setSheetHidden(false);
      },
    });
    if (outcome.ignored || outcome.result?.ok) return;
    if (!holdSheetUntilAlert) setSheetHidden(false);
  };

  const [contentHeight, setContentHeight] = useState(0);
  const [scrollHeight, setScrollHeight] = useState(0);
  const sheetMaxHeight = Math.max(
    280,
    height > 200
      ? height - insets.top - insets.bottom - (centerSheet ? 48 : 12)
      : 280,
  );
  const needsScroll = contentHeight > scrollHeight + 8;

  const body = (
    <View
      collapsable={false}
      pointerEvents="box-none"
      style={[styles.root, centerSheet && styles.rootCentered]}
    >
      <Pressable
        accessibilityElementsHidden
        disabled={submitting}
        importantForAccessibility="no"
        pointerEvents={submitting ? 'none' : 'auto'}
        style={styles.backdrop}
        onPress={submitting ? undefined : onClose}
      />
      <View
        collapsable={false}
        // シート全体で背面 backdrop のタッチを遮断（iPad でボタン無反応対策）
        pointerEvents="auto"
        style={[
          styles.sheet,
          centerSheet ? styles.sheetCentered : styles.sheetBottom,
          {
            maxHeight: sheetMaxHeight,
            paddingBottom: Math.max(insets.bottom, 16),
            width: '100%',
            maxWidth: centerSheet ? 480 : undefined,
            zIndex: 10,
            elevation: 24,
          },
        ]}
      >
        <View style={styles.handle} />
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          scrollEnabled={needsScroll}
          showsVerticalScrollIndicator={needsScroll}
          style={[styles.scroll, { maxHeight: sheetMaxHeight - 28 }]}
          contentContainerStyle={styles.content}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            setScrollHeight((prev) => (prev === next ? prev : next));
          }}
          onContentSizeChange={(_w, nextHeight) => {
            const next = Math.round(nextHeight);
            setContentHeight((prev) => (prev === next ? prev : next));
          }}
        >
          <Text style={styles.kicker}>spotto</Text>
          <Text style={styles.title}>{copy?.title ?? t('auth.loginTitleDefault')}</Text>
          <Text style={styles.body}>
            {copy?.body ?? t('auth.loginBodyDefault')}
          </Text>

          <SocialLoginButtons
            disabled={submitting}
            pendingProvider={pendingProvider}
            onPress={(provider) => {
              void submitSocial(provider);
            }}
          />

          {submitting ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={theme.colors.primaryDark} />
              <Text style={styles.busyText}>{t('auth.authenticating')}</Text>
            </View>
          ) : null}

          <LegalConsentNote variant="continue" />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.keepBrowsing')}
            accessibilityState={{ disabled: submitting }}
            disabled={submitting}
            hitSlop={8}
            onPress={onClose}
            style={styles.guestBtn}
          >
            <Text style={styles.guestText}>{t('auth.keepBrowsing')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );

  const showSurface = visible && !sheetHidden;

  if (presentation === 'overlay') {
    if (!showSurface) return null;
    return <View accessibilityViewIsModal style={styles.overlayRoot}>{body}</View>;
  }

  return (
    <AppModal
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={showSurface}
      onDismiss={() => {
        const listeners = dismissListeners.current.splice(0);
        listeners.forEach((listener) => listener());
      }}
      onRequestClose={submitting ? () => undefined : onClose}
    >
      <View collapsable={false} style={styles.modalFill}>
        {body}
      </View>
    </AppModal>
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
  rootCentered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    zIndex: 0,
  },
  sheet: {
    position: 'relative',
    backgroundColor: theme.colors.surface,
    zIndex: 2,
    elevation: 8,
  },
  sheetBottom: {
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    alignSelf: 'stretch',
  },
  sheetCentered: {
    borderRadius: theme.radius.xxl,
    alignSelf: 'center',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
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
    paddingVertical: 12,
    minHeight: 44,
  },
  guestText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
});
