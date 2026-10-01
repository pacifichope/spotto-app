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
import { type SportEvent } from '@/lib/events';
import {
  CLUSTER_DISABLE_LAT_DELTA,
  clusterEventsForRegion,
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

function shouldKeepForcePoints(
  events: SportEvent[],
  region: MapCameraRegion,
  forceIds: ReadonlySet<string>,
): boolean {
  if (forceIds.size === 0) return false;
  if (region.latitudeDelta <= CLUSTER_DISABLE_LAT_DELTA) return false;
  const natural = clusterEventsForRegion(events, region);
  return natural.some(
    (item) =>
      item.type === 'cluster' && item.events.some((e) => forceIds.has(e.id)),
  );
}

const EventsMap = forwardRef<EventsMapRef, EventsMapProps>(function EventsMap(
  {
    events = [],
    selectedId,
    joinedIds,
    onSelectEvent,
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
  const propRegion = region ?? initialRegion ?? FALLBACK_REGION;
  const [viewRegion, setViewRegion] = useState<MapCameraRegion>(propRegion);
  /** クラスタタップ後、該当イベントを必ず個別ピンにする */
  const [forcePointIds, setForcePointIds] = useState<Set<string> | null>(null);

  useImperativeHandle(ref, () => ({
    animateToRegion: (next: MapCameraRegion, duration = 800) => {
      mapRef.current?.animateToRegion(next, duration);
      setViewRegion(next);
      setForcePointIds(null);
    },
  }));

  useEffect(() => {
    mapRef.current?.animateToRegion(propRegion, 800);
    setViewRegion(propRegion);
    setForcePointIds(null);
  }, [
    propRegion.latitude,
    propRegion.longitude,
    propRegion.latitudeDelta,
    propRegion.longitudeDelta,
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
      ignoreNextMapPressRef.current = true;
      onSelectEvent(null);
      const next = regionForClusterEvents(clusterEvents, viewRegion);
      setForcePointIds(new Set(clusterEvents.map((e) => e.id)));
      setViewRegion(next);
      mapRef.current?.animateToRegion(next, 480);
      setTimeout(() => {
        ignoreNextMapPressRef.current = false;
      }, 500);
    },
    [onSelectEvent, viewRegion],
  );

  const handleMapPress = () => {
    if (ignoreNextMapPressRef.current) {
      ignoreNextMapPressRef.current = false;
      return;
    }
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
          mapRef.current?.animateToRegion(propRegion, 0);
        }}
        onRegionChangeComplete={(next) => {
          const camera = toCameraRegion(next);
          setViewRegion(camera);
          setForcePointIds((prev) => {
            if (!prev || prev.size === 0) return null;
            return shouldKeepForcePoints(events, camera, prev) ? prev : null;
          });
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
          return (
            <CustomMapMarker
              key={item.id}
              identifier={item.id}
              coordinate={{
                latitude: item.latitude,
                longitude: item.longitude,
              }}
              tappable
              anchor={{ x: 0.5, y: 1 }}
              zIndex={selected ? 10 : 1}
              trackKey={`p:${event.id}:${selected ? 1 : 0}:${joined ? 1 : 0}:${event.sport || ''}`}
              forceTracking={selected}
              onPress={(e) => {
                e.stopPropagation?.();
                handleMarkerPress(event);
              }}
            >
              <EventMapPin
                sport={event.sport || 'その他'}
                selected={selected}
                joined={joined}
                gradientId={`pin-${event.id}`}
              />
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
});
