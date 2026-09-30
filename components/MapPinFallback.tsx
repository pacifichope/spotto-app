import { StyleSheet, View } from 'react-native';

import { theme } from '@/constants/theme';

/** SVG なしのシンプルな水色ピン（最終フォールバック・赤い標準ピン回避） */
export function CyanPinFallback({ size = 44 }: { size?: number }) {
  const head = Math.round(size * 0.72);
  const tip = Math.round(size * 0.28);
  return (
    <View
      collapsable={false}
      style={[styles.fallbackWrap, { width: size, height: size + tip * 0.4 }]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.fallbackHead,
          {
            width: head,
            height: head,
            borderRadius: head / 2,
          },
        ]}
      >
        <View style={styles.fallbackInner} />
      </View>
      <View style={[styles.fallbackTip, { borderTopWidth: tip }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackWrap: {
    alignItems: 'center',
  },
  fallbackHead: {
    backgroundColor: theme.colors.primary,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  fallbackInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
  fallbackTip: {
    marginTop: -4,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: theme.colors.primary,
  },
});
