import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { brandGradient } from '@/constants/theme';

type BrandGradientVariant = 'cta' | 'soft' | 'vivid';

type BrandGradientProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: BrandGradientVariant;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
};

/** アイコンと同じ斜め（シアン → オレンジ）グラデーション */
export default function BrandGradient({
  children,
  style,
  variant = 'cta',
  pointerEvents,
}: BrandGradientProps) {
  const colors = [...brandGradient[variant]];
  return (
    <LinearGradient
      colors={colors}
      start={brandGradient.start}
      end={brandGradient.end}
      style={style}
      pointerEvents={pointerEvents}
    >
      {children}
    </LinearGradient>
  );
}

export const brandGradientFill = StyleSheet.absoluteFillObject;
