import type { StyleProp, ViewStyle } from 'react-native';

import type { SportEvent } from '@/lib/events';

export type MapCameraRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type EventsMapProps = {
  events?: SportEvent[];
  selectedId: string | null;
  joinedIds?: Set<string>;
  onSelectEvent: (event: SportEvent | null) => void;
  /** マップの表示領域。react-native-maps の region に渡す */
  region?: MapCameraRegion | null;
  /** 初回描画用。region が来るまでのフォールバック */
  initialRegion?: MapCameraRegion | null;
  /**
   * 現在地ドットを出すか。
   * New Architecture では MapView の showsUserLocation が
   * topUserLocationChange クラッシュを起こすため、独自 Marker で描画する。
   */
  showsUserLocation?: boolean;
  /** 現在地座標（showsUserLocation 時に使用） */
  userCoordinate?: { latitude: number; longitude: number } | null;
  style?: StyleProp<ViewStyle>;
};

export type EventsMapRef = {
  animateToRegion: (region: MapCameraRegion, duration?: number) => void;
};
