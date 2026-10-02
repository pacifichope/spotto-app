import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type {
  EventsMapProps,
  EventsMapRef,
  MapCameraRegion,
} from '@/components/eventsMapTypes';
import EventMapPin from '@/components/EventMapPin';
import MapClusterMarker from '@/components/MapClusterMarker';
import {
  clusterEventsForRegion,
  regionForClusterEvents,
} from '@/lib/mapClustering';
import { FALLBACK_REGION } from '@/lib/userLocation';

export type { EventsMapProps, EventsMapRef } from '@/components/eventsMapTypes';

function toPercent(
  latitude: number,
  longitude: number,
  region: MapCameraRegion,
) {
  const minLat = region.latitude - region.latitudeDelta / 2;
  const maxLat = region.latitude + region.latitudeDelta / 2;
  const minLng = region.longitude - region.longitudeDelta / 2;
  const maxLng = region.longitude + region.longitudeDelta / 2;
  const left =
    ((longitude - minLng) / Math.max(maxLng - minLng, 0.0001)) * 100;
  const top =
    ((maxLat - latitude) / Math.max(maxLat - minLat, 0.0001)) * 100;
  return {
    left: Math.min(92, Math.max(8, left)),
    top: Math.min(90, Math.max(10, top)),
  };
}

const EventsMap = forwardRef<EventsMapRef, EventsMapProps>(function EventsMap(
  {
    events = [],
    selectedId,
    joinedIds,
    onSelectEvent,
    initialRegion = null,
    region = null,
    style,
  },
  ref,
) {
  const propRegion = region ?? initialRegion ?? FALLBACK_REGION;
  const [viewRegion, setViewRegion] = useState(propRegion);
  const [forcePointIds, setForcePointIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    setViewRegion(propRegion);
    setForcePointIds(null);
  }, [
    propRegion.latitude,
    propRegion.longitude,
    propRegion.latitudeDelta,
    propRegion.longitudeDelta,
  ]);

  useImperativeHandle(ref, () => ({
    animateToRegion: (next) => {
      setViewRegion(next);
      setForcePointIds(null);
    },
  }));

  const activeRegion = viewRegion.latitude ? viewRegion : propRegion;

  const mapSrc = useMemo(() => {
    const { latitude, longitude } = activeRegion;
    return `https://maps.google.com/maps?q=${latitude},${longitude}&z=13&output=embed&hl=ja`;
  }, [activeRegion]);

  const clusters = useMemo(
    () =>
      clusterEventsForRegion(events, activeRegion, {
        forcePointIds,
      }),
    [events, activeRegion, forcePointIds],
  );

  const iframe = createElement('iframe', {
    title: 'Google Map',
    src: mapSrc,
    style: {
      border: 0,
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'auto',
    },
    loading: 'lazy',
    referrerPolicy: 'no-referrer-when-downgrade',
    allowFullScreen: true,
  });

  return (
    <View style={[styles.map, style]} pointerEvents="auto">
      <View style={styles.iframeHost} pointerEvents="auto">
        {iframe}
      </View>
      <Pressable
        style={styles.overlay}
        pointerEvents="box-none"
        onPress={() => {
          setForcePointIds(null);
          onSelectEvent(null);
        }}
      >
        {clusters.map((item) => {
          if (item.type === 'cluster') {
            const pos = toPercent(item.latitude, item.longitude, activeRegion);
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  onSelectEvent(null);
                  const next = regionForClusterEvents(
                    item.events,
                    activeRegion,
                  );
                  setForcePointIds(new Set(item.events.map((e) => e.id)));
                  setViewRegion(next);
                }}
                style={[
                  styles.clusterWrap,
                  { left: `${pos.left}%`, top: `${pos.top}%` },
                ]}
              >
                <MapClusterMarker count={item.count} />
              </Pressable>
            );
          }

          const selected = item.event.id === selectedId;
          const joined = joinedIds?.has(item.event.id) ?? false;
          const pos = toPercent(item.latitude, item.longitude, activeRegion);
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelectEvent(item.event)}
              style={[
                styles.pinWrap,
                { left: `${pos.left}%`, top: `${pos.top}%` },
                selected && styles.pinWrapSelected,
              ]}
            >
              <EventMapPin
                sport={item.event.sport}
                selected={selected}
                joined={joined}
                gradientId={`web-pin-${item.event.id}`}
              />
            </Pressable>
          );
        })}
      </Pressable>
    </View>
  );
});

export default EventsMap;

const styles = StyleSheet.create({
  map: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  iframeHost: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2,
  },
  pinWrap: {
    position: 'absolute',
    marginLeft: -23,
    marginTop: -58,
  },
  clusterWrap: {
    position: 'absolute',
    marginLeft: -28,
    marginTop: -28,
    zIndex: 4,
  },
  pinWrapSelected: {
    zIndex: 5,
  },
});
