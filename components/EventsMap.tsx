import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, {
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';

import CustomMapMarker from '@/components/CustomMapMarker';
import EventMapPin from '@/components/EventMapPin';
import MapClusterMarker from '@/components/MapClusterMarker';
import SafeMapView from '@/components/SafeMapView';
import type {
  EventsMapProps,
  EventsMapRef,
  MapCameraRegion,
} from '@/components/eventsMapTypes';
import { theme } from '@/constants/theme';
import { type SportEvent } from '@/lib/events';
import {
  clusterEventsForRegion,
  isClusterOnlyZoom,
  regionForClusterEvents,
} from '@/lib/mapClustering';
import { FALLBACK_REGION } from '@/lib/userLocation';

export type { EventsMapProps, EventsMapRef } from '@/components/eventsMapTypes';

const isExpoGo = Constants.appOwnership === 'expo';
const mapProvider = isExpoGo ? undefined : PROVIDER_GOOGLE;

function toCameraRegion(region: Region | MapCameraRegion): MapCameraRegion {
  return {
    latitude: region.latitude,
    longitude: region.longitude,
    latitudeDelta: region.latitudeDelta,
    longitudeDelta: region.longitudeDelta,
  };
}

function regionsNearlyEqual(a: MapCameraRegion, b: MapCameraRegion) {
  return (
    Math.abs(a.latitude - b.latitude) < 0.00008 &&
    Math.abs(a.longitude - b.longitude) < 0.00008 &&
    Math.abs(a.latitudeDelta - b.latitudeDelta) < 0.0008 &&
    Math.abs(a.longitudeDelta - b.longitudeDelta) < 0.0008
  );
}

/**
 * クラスタ展開後のカメラから、ユーザーがズーム／パンで十分動いたか。
 * 動いたら forcePointIds を解除して通常クラスタに戻す。
 */
function forceExpandCameraMoved(
  baseline: MapCameraRegion,
  current: MapCameraRegion,
): boolean {
  const baseLat = Math.max(baseline.latitudeDelta, 0.0001);
  const baseLng = Math.max(baseline.longitudeDelta, 0.0001);
  const zoomChanged =
    Math.abs(current.latitudeDelta - baseline.latitudeDelta) > baseLat * 0.1 ||
    Math.abs(current.longitudeDelta - baseline.longitudeDelta) > baseLng * 0.1;
  const panChanged =
    Math.abs(current.latitude - baseline.latitude) > baseLat * 0.28 ||
    Math.abs(current.longitude - baseline.longitude) > baseLng * 0.28;
  return zoomChanged || panChanged;
}

const EventsMap = forwardRef<EventsMapRef, EventsMapProps>(function EventsMap(
  {
    events = [],
    selectedId,
    joinedIds,
    onSelectEvent,
    onRegionChangeComplete,
    initialRegion = null,
    region = null,
    showsUserLocation = true,
    userCoordinate = null,
    style,
  },
  ref,
) {
  const mapRef = useRef<MapView>(null);
  /** Marker onPress の直後に MapView onPress が走って選択解除されるのを防ぐ */
  const ignoreNextMapPressRef = useRef(false);
  /** 親へ通知した直後の region（自分発の更新で再 animate しない） */
  const lastEmittedRegionRef = useRef<MapCameraRegion | null>(null);
  const mountedRef = useRef(false);
  const readyRef = useRef(false);
  /** クラスタ展開時のカメラ。ここから動いたら展開解除 */
  const forceExpandRegionRef = useRef<MapCameraRegion | null>(null);
  const propRegion = region ?? initialRegion ?? FALLBACK_REGION;
  const propRegionRef = useRef(propRegion);
  propRegionRef.current = propRegion;
  const [viewRegion, setViewRegion] = useState<MapCameraRegion>(propRegion);
  /** クラスタタップ後、該当イベントを必ず個別ピンにする（一時的） */
  const [forcePointIds, setForcePointIds] = useState<Set<string> | null>(null);

  const clearForceExpand = useCallback(() => {
    forceExpandRegionRef.current = null;
    setForcePointIds(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      readyRef.current = false;
    };
  }, []);

  // フィルター変更でイベント集合が変わったら展開状態をリセット
  const eventsSignature = useMemo(
    () =>
      events
        .map((e) => e.id)
        .sort()
        .join(','),
    [events],
  );
  useEffect(() => {
    if (!mountedRef.current) return;
    clearForceExpand();
  }, [eventsSignature, clearForceExpand]);

  useImperativeHandle(ref, () => ({
    animateToRegion: (next: MapCameraRegion, duration = 800) => {
      if (!mountedRef.current) return;
      lastEmittedRegionRef.current = next;
      mapRef.current?.animateToRegion(next, duration);
      setViewRegion(next);
      clearForceExpand();
    },
  }));

  // エリア変更など「親が意図したカメラ」だけ追従。パン結果のエコーは無視
  // マップ ready 前は initialRegion / onMapReady に任せ、マウント完了前の animate 連鎖を避ける
  useEffect(() => {
    if (!mountedRef.current || !readyRef.current) return;
    if (
      lastEmittedRegionRef.current &&
      regionsNearlyEqual(propRegion, lastEmittedRegionRef.current)
    ) {
      return;
    }
    lastEmittedRegionRef.current = propRegion;
    mapRef.current?.animateToRegion(propRegion, 500);
    setViewRegion(propRegion);
    clearForceExpand();
  }, [
    propRegion.latitude,
    propRegion.longitude,
    propRegion.latitudeDelta,
    propRegion.longitudeDelta,
    clearForceExpand,
  ]);

  const clusters = useMemo(
    () =>
      clusterEventsForRegion(events, viewRegion, {
        forcePointIds,
      }),
    [events, viewRegion, forcePointIds],
  );

  const handleMarkerPress = useCallback(
    (event: SportEvent) => {
      ignoreNextMapPressRef.current = true;
      onSelectEvent(event);
      setTimeout(() => {
        ignoreNextMapPressRef.current = false;
      }, 350);
    },
    [onSelectEvent],
  );

  const handleClusterPress = useCallback(
    (clusterEvents: SportEvent[]) => {
      if (!mountedRef.current) return;
      ignoreNextMapPressRef.current = true;
      onSelectEvent(null);
      const next = regionForClusterEvents(clusterEvents, viewRegion);
      forceExpandRegionRef.current = next;
      setForcePointIds(new Set(clusterEvents.map((e) => e.id)));
      setViewRegion(next);
      lastEmittedRegionRef.current = next;
      onRegionChangeComplete?.(next);
      mapRef.current?.animateToRegion(next, 480);
      setTimeout(() => {
        ignoreNextMapPressRef.current = false;
      }, 500);
    },
    [onSelectEvent, onRegionChangeComplete, viewRegion],
  );

  const handleMapPress = () => {
    if (ignoreNextMapPressRef.current) {
      ignoreNextMapPressRef.current = false;
      return;
    }
    // 選択解除と同時にクラスタ展開も戻す
    clearForceExpand();
    onSelectEvent(null);
  };

  const showUserDot =
    showsUserLocation &&
    userCoordinate != null &&
    Number.isFinite(userCoordinate.latitude) &&
    Number.isFinite(userCoordinate.longitude);

  return (
    <View collapsable={false} style={[styles.mapHost, style]}>
      <SafeMapView
        ref={mapRef}
        style={styles.map}
        provider={mapProvider}
        initialRegion={propRegion}
        onMapReady={() => {
          if (!mountedRef.current) return;
          readyRef.current = true;
          const next = propRegionRef.current;
          lastEmittedRegionRef.current = next;
          mapRef.current?.animateToRegion(next, 0);
          setViewRegion(next);
        }}
        onRegionChangeComplete={(next) => {
          if (!mountedRef.current || !readyRef.current) return;
          const camera = toCameraRegion(next);
          setViewRegion(camera);
          lastEmittedRegionRef.current = camera;
          onRegionChangeComplete?.(camera);

          // 広域ズームでは展開ピンを必ず解除（クラスタのみ表示）
          if (isClusterOnlyZoom(camera)) {
            clearForceExpand();
            return;
          }

          const baseline = forceExpandRegionRef.current;
          if (!baseline) return;
          // 展開直後の animate 着地は維持。その後のズーム／パンでクラスタに戻す
          if (regionsNearlyEqual(camera, baseline)) return;
          if (forceExpandCameraMoved(baseline, camera)) {
            clearForceExpand();
          }
        }}
        scrollEnabled
        zoomEnabled
        zoomTapEnabled
        zoomControlEnabled
        pitchEnabled
        rotateEnabled
        minZoomLevel={3}
        maxZoomLevel={20}
        showsCompass={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        onPress={handleMapPress}
      >
        {showUserDot && userCoordinate ? (
          <CustomMapMarker
            key="user-location"
            identifier="user-location"
            coordinate={userCoordinate}
            tappable={false}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={20}
            trackKey="user"
          >
            <View style={styles.userDotOuter} pointerEvents="none" collapsable={false}>
              <View style={styles.userDotInner} />
            </View>
          </CustomMapMarker>
        ) : null}
        {clusters.map((item) => {
          if (item.type === 'cluster') {
            return (
              <CustomMapMarker
                key={item.id}
                identifier={item.id}
                coordinate={{
                  latitude: item.latitude,
                  longitude: item.longitude,
                }}
                tappable
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={5}
                trackKey={`c:${item.count}:${item.id}`}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleClusterPress(item.events);
                }}
              >
                <MapClusterMarker count={item.count} />
              </CustomMapMarker>
            );
          }

          const { event } = item;
          const selected = event.id === selectedId;
          const joined = joinedIds?.has?.(event.id) ?? false;
          const isDot = item.appearance === 'dot' && !selected;
          return (
            <CustomMapMarker
              key={item.id}
              identifier={item.id}
              coordinate={{
                latitude: item.latitude,
                longitude: item.longitude,
              }}
              tappable
              anchor={isDot ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 }}
              zIndex={selected ? 10 : isDot ? 2 : 1}
              trackKey={`p:${event.id}:${selected ? 1 : 0}:${joined ? 1 : 0}:${isDot ? 'd' : 'f'}:${event.sport || ''}`}
              forceTracking={selected}
              onPress={(e) => {
                e.stopPropagation?.();
                handleMarkerPress(event);
              }}
            >
              {isDot ? (
                <View style={styles.eventDot} pointerEvents="none" collapsable={false} />
              ) : (
                <EventMapPin
                  sport={event.sport || 'その他'}
                  selected={selected}
                  joined={joined}
                  gradientId={`pin-${event.id}`}
                />
              )}
            </CustomMapMarker>
          );
        })}
      </SafeMapView>
    </View>
  );
});

export default EventsMap;

const styles = StyleSheet.create({
  mapHost: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  userDotOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(37, 99, 235, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  eventDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.primaryDark,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
