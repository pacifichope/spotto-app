import { StyleSheet, View } from 'react-native';
import { PROVIDER_GOOGLE } from 'react-native-maps';
import Constants from 'expo-constants';

import CustomMapMarker from '@/components/CustomMapMarker';
import EventMapPin from '@/components/EventMapPin';
import SafeMapView from '@/components/SafeMapView';
import type { SportEvent } from '@/lib/events';

const isExpoGo = Constants.appOwnership === 'expo';

type MiniMapProps = {
  event: SportEvent;
  /** @deprecated ピン横ラベルは非表示のため未使用 */
  placeLabel?: string;
};

export default function MiniMap({ event }: MiniMapProps) {
  return (
    <View style={styles.wrap}>
      <SafeMapView
        style={styles.miniMap}
        provider={isExpoGo ? undefined : PROVIDER_GOOGLE}
        pointerEvents="none"
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterest={false}
        showsCompass={false}
        initialRegion={{
          latitude: event.latitude,
          longitude: event.longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }}
      >
        <CustomMapMarker
          coordinate={{
            latitude: event.latitude,
            longitude: event.longitude,
          }}
          anchor={{ x: 0.5, y: 1 }}
          tappable={false}
          trackKey={`mini:${event.id}:${event.sport}`}
        >
          <EventMapPin
            sport={event.sport || 'その他'}
            compact
            gradientId={`mini-${event.id}`}
          />
        </CustomMapMarker>
      </SafeMapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: 148,
    overflow: 'hidden',
    borderRadius: 12,
  },
  miniMap: {
    width: '100%',
    height: '100%',
  },
});
