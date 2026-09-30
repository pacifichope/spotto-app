import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import BrandGradient from '@/components/BrandGradient';
import { theme } from '@/constants/theme';

type HeaderRoundButtonProps = {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
};

/** ホーム右上と同型のグラデーション丸ボタン（42×42） */
export default function HeaderRoundButton({
  onPress,
  accessibilityLabel,
  children,
}: HeaderRoundButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      <BrandGradient style={styles.btn}>{children}</BrandGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    shadowColor: theme.colors.accentDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  btn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
