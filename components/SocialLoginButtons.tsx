import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';

import {
  AppleLogoMark,
  GoogleGMark,
  LineSpeechMark,
} from '@/components/socialBrandMarks';
import type { SocialProvider } from '@/lib/auth';

type SocialLoginButtonsProps = {
  disabled?: boolean;
  /** 処理中のプロバイダー。そのボタンだけスピナーにする */
  pendingProvider?: SocialProvider | null;
  onPress: (provider: SocialProvider) => void;
};

const HIT_SLOP = { top: 10, bottom: 10, left: 8, right: 8 };

/**
 * LINE / Google / Apple のログインボタン群。
 * 3つとも「アイコン + ラベル」を横並び中央揃えにして見た目のバランスを揃える。
 * Apple は iOS ネイティブのみ（Android では非表示）。
 */
export default function SocialLoginButtons({
  disabled,
  pendingProvider,
  onPress,
}: SocialLoginButtonsProps) {
  const { t } = useTranslation();
  const showApple = Platform.OS === 'ios' || Platform.OS === 'web';

  return (
    <View collapsable={false} pointerEvents="auto" style={styles.stack}>
      <ProviderButton
        provider="line"
        label={t('auth.social.line')}
        disabled={disabled}
        pending={pendingProvider === 'line'}
        pendingLabel={t('auth.authenticating')}
        onPress={onPress}
        buttonStyle={styles.lineBtn}
        pressedStyle={styles.linePressed}
        textStyle={styles.lineText}
        spinnerColor="#FFFFFF"
        icon={<LineSpeechMark size={22} color="#FFFFFF" />}
      />

      <ProviderButton
        provider="google"
        label={t('auth.social.google')}
        disabled={disabled}
        pending={pendingProvider === 'google'}
        pendingLabel={t('auth.authenticating')}
        onPress={onPress}
        buttonStyle={styles.googleBtn}
        pressedStyle={styles.googlePressed}
        textStyle={styles.googleText}
        spinnerColor="#1F1F1F"
        icon={<GoogleGMark size={20} />}
      />

      {showApple ? (
        <ProviderButton
          provider="apple"
          label={t('auth.social.apple')}
          disabled={disabled}
          pending={pendingProvider === 'apple'}
          pendingLabel={t('auth.authenticating')}
          onPress={onPress}
          buttonStyle={styles.appleBtn}
          pressedStyle={styles.applePressed}
          textStyle={styles.appleText}
          spinnerColor="#FFFFFF"
          icon={<AppleLogoMark size={18} color="#FFFFFF" />}
        />
      ) : null}
    </View>
  );
}

function ProviderButton({
  provider,
  label,
  disabled,
  pending,
  pendingLabel,
  onPress,
  buttonStyle,
  pressedStyle,
  textStyle,
  spinnerColor,
  icon,
}: {
  provider: SocialProvider;
  label: string;
  disabled?: boolean;
  pending: boolean;
  pendingLabel: string;
  onPress: (provider: SocialProvider) => void;
  buttonStyle: StyleProp<ViewStyle>;
  pressedStyle: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
  spinnerColor: string;
  icon: ReactNode;
}) {
  const blocked = !!disabled || pending;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pending ? pendingLabel : label}
      accessibilityState={{ disabled: blocked, busy: pending }}
      collapsable={false}
      disabled={blocked}
      hitSlop={HIT_SLOP}
      onPress={() => onPress(provider)}
      style={({ pressed }) => [
        buttonStyle,
        blocked && !pending && styles.disabled,
        pressed && !blocked && pressedStyle,
      ]}
    >
      <View pointerEvents="none" style={styles.iconSlot}>
        {pending ? (
          <ActivityIndicator color={spinnerColor} size="small" />
        ) : (
          icon
        )}
      </View>
      <Text pointerEvents="none" style={textStyle} numberOfLines={1}>
        {pending ? pendingLabel : label}
      </Text>
    </Pressable>
  );
}

const GOOGLE_FONT = Platform.select({
  ios: 'System',
  android: 'sans-serif-medium',
  default: undefined,
});

const APPLE_FONT = Platform.select({
  ios: 'System',
  android: 'sans-serif-medium',
  default: undefined,
});

const styles = StyleSheet.create({
  stack: {
    gap: 12,
    marginTop: 18,
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.55,
  },
  /** 3ボタン共通: アイコン枠を同じ幅にしてテキスト開始位置を揃える */
  iconSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- LINE ---
  lineBtn: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: '#06C755',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linePressed: {
    backgroundColor: '#04A848',
  },
  lineText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
    flexShrink: 1,
  },

  // --- Google ---
  googleBtn: {
    minHeight: 52,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#747775',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  googlePressed: {
    backgroundColor: '#F2F2F2',
  },
  googleText: {
    color: '#1F1F1F',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    fontFamily: GOOGLE_FONT,
    letterSpacing: 0.15,
    textAlign: 'center',
    flexShrink: 1,
  },

  // --- Apple ---
  appleBtn: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  applePressed: {
    backgroundColor: '#1A1A1A',
  },
  appleText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: APPLE_FONT,
    letterSpacing: -0.2,
    textAlign: 'center',
    flexShrink: 1,
  },
});
