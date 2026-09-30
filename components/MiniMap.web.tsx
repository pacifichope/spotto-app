import { StyleSheet, View } from 'react-native';

import EventMapPin from '@/components/EventMapPin';
import { theme } from '@/constants/theme';
import type { SportEvent } from '@/lib/events';

type MiniMapProps = {
  event: SportEvent;
  /** @deprecated ピン横ラベルは非表示のため未使用 */
  placeLabel?: string;
};

export default function MiniMap({ event }: MiniMapProps) {
  return (
    <View style={[styles.miniMap, styles.fallback]}>
      <EventMapPin
        sport={event.sport}
        compact
        gradientId={`mini-web-${event.id}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  miniMap: {
    width: '100%',
    height: 148,
    borderRadius: 12,
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: theme.colors.iconActiveBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
