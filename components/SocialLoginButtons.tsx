import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppleLogoMark,
  GoogleGMark,
  LineSpeechMark,
} from '@/components/socialBrandMarks';
import { SOCIAL_PROVIDER_COPY, type SocialProvider } from '@/lib/auth';

type SocialLoginButtonsProps = {
  disabled?: boolean;
  onPress: (provider: SocialProvider) => void;
};

/**
 * LINE / Google / Apple のログインボタン群。
 * 3つとも「アイコン + ラベル」を横並び中央揃えにして見た目のバランスを揃える。
 * Apple は iOS ネイティブのみ（Android では非表示）。
 */
export default function SocialLoginButtons({
  disabled,
  onPress,
}: SocialLoginButtonsProps) {
  const showApple = Platform.OS === 'ios' || Platform.OS === 'web';

  return (
    <View style={styles.stack}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={SOCIAL_PROVIDER_COPY.line.label}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={() => onPress('line')}
        style={({ pressed }) => [
          styles.lineBtn,
          disabled && styles.disabled,
          pressed && !disabled && styles.linePressed,
        ]}
      >
        <View style={styles.iconSlot}>
          <LineSpeechMark size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.lineText} numberOfLines={1}>
          {SOCIAL_PROVIDER_COPY.line.label}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={SOCIAL_PROVIDER_COPY.google.label}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={() => onPress('google')}
        style={({ pressed }) => [
          styles.googleBtn,
          disabled && styles.disabled,
          pressed && !disabled && styles.googlePressed,
        ]}
      >
        <View style={styles.iconSlot}>
          <GoogleGMark size={20} />
        </View>
        <Text style={styles.googleText} numberOfLines={1}>
          {SOCIAL_PROVIDER_COPY.google.label}
        </Text>
      </Pressable>

      {showApple ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SOCIAL_PROVIDER_COPY.apple.label}
          accessibilityState={{ disabled: !!disabled }}
          disabled={disabled}
          onPress={() => onPress('apple')}
          style={({ pressed }) => [
            styles.appleBtn,
            disabled && styles.disabled,
            pressed && !disabled && styles.applePressed,
          ]}
        >
          <View style={styles.iconSlot}>
            <AppleLogoMark size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.appleText} numberOfLines={1}>
            {SOCIAL_PROVIDER_COPY.apple.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
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
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#06C755',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
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
  },

  // --- Google ---
  googleBtn: {
    minHeight: 48,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#747775',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
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
  },

  // --- Apple ---
  appleBtn: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
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
  },
});
