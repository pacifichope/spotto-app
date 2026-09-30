import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';

type MapClusterMarkerProps = {
  count: number;
};

/** 地図上の集約ピン（件数バッジ） */
export default function MapClusterMarker({ count }: MapClusterMarkerProps) {
  const label = count > 99 ? '99+' : String(count);
  const size = count >= 50 ? 58 : count >= 20 ? 52 : count >= 10 ? 48 : 44;

  return (
    <View
      collapsable={false}
      style={[styles.wrap, { width: size, height: size }]}
      pointerEvents="none"
      accessibilityRole="button"
      accessibilityLabel={`${label}件のイベント`}
    >
      <View
        style={[
          styles.halo,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      />
      <View
        style={[
          styles.core,
          {
            width: size - 10,
            height: size - 10,
            borderRadius: (size - 10) / 2,
          },
        ]}
      >
        <Text style={styles.count}>{label}</Text>
        <Text style={styles.unit}>件</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    backgroundColor: 'rgba(41, 209, 232, 0.22)',
  },
  core: {
    backgroundColor: theme.colors.primaryDark,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1A22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 6,
  },
  count: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 17,
  },
  unit: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
    marginTop: -1,
  },
});
