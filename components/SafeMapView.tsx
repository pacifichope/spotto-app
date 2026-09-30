import { forwardRef, type ComponentProps } from 'react';
import MapView from 'react-native-maps';

/**
 * Fabric + react-native-maps ではネイティブ showsUserLocation /
 * onUserLocationChange が topUserLocationChange クラッシュを起こすため無効化。
 * 現在地表示が必要な場合は呼び出し側で Marker を置く。
 */
export type SafeMapViewProps = Omit<
  ComponentProps<typeof MapView>,
  | 'showsUserLocation'
  | 'showsMyLocationButton'
  | 'followsUserLocation'
  | 'onUserLocationChange'
  | 'userLocationPriority'
  | 'userLocationUpdateInterval'
  | 'userLocationFastestInterval'
  | 'userLocationAnnotationTitle'
> & {
  /** 互換用。常に無視され false になる */
  showsUserLocation?: boolean;
};

const SafeMapView = forwardRef<MapView, SafeMapViewProps>(function SafeMapView(
  { showsUserLocation: _ignored, ...rest },
  ref,
) {
  return (
    <MapView
      ref={ref}
      {...rest}
      showsUserLocation={false}
      showsMyLocationButton={false}
      followsUserLocation={false}
    />
  );
});

export default SafeMapView;
