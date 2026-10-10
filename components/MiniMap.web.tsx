import { createElement, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import EventMapPin from '@/components/EventMapPin';
import { theme } from '@/constants/theme';
import type { SportEvent } from '@/lib/events';
import { openEventInMaps } from '@/lib/openMaps';

type MiniMapProps = {
  event: SportEvent;
  /** @deprecated ピン横ラベルは非表示のため未使用 */
  placeLabel?: string;
};

/** Web 埋め込み地図の固定高さ（% 指定だと親経由で 0 になりグレー表示になる） */
const MAP_HEIGHT_PX = 200;

function embedSrc(lat: number, lng: number) {
  // OpenStreetMap: API キー不要・iframe 埋め込みが安定（Google embed は環境によってグレーになる）
  const delta = 0.012;
  const bbox = [
    lng - delta,
    lat - delta,
    lng + delta,
    lat + delta,
  ].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;
}

/**
 * Expo Web / react-native-web 向けミニマップ。
 * react-native-maps は使わず iframe で地図タイルを表示する。
 * 高さはすべて px で明示し、タップで Google Maps 等を外部オープンする。
 */
export default function MiniMap({ event }: MiniMapProps) {
  const { t } = useTranslation();
  const lat = Number(event.latitude);
  const lng = Number(event.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const mapSrc = useMemo(
    () => (hasCoords ? embedSrc(lat, lng) : null),
    [hasCoords, lat, lng],
  );

  const openMaps = () => {
    void openEventInMaps(event);
  };

  const iframe = mapSrc
    ? createElement('iframe', {
        title: t('join.openMapA11y'),
        src: mapSrc,
        width: '100%',
        height: String(MAP_HEIGHT_PX),
        frameBorder: '0',
        loading: 'lazy',
        referrerPolicy: 'no-referrer-when-downgrade',
        allowFullScreen: true,
        style: {
          display: 'block',
          width: '100%',
          height: `${MAP_HEIGHT_PX}px`,
          minHeight: `${MAP_HEIGHT_PX}px`,
          border: 0,
          margin: 0,
          padding: 0,
          // 親 Pressable がタップを受け取る
          pointerEvents: 'none',
        },
      })
    : null;

  return (
    <Pressable
      style={styles.wrap}
      onPress={openMaps}
      accessibilityRole="link"
      accessibilityLabel={t('join.openMapA11y')}
    >
      {iframe ? (
        <View style={styles.mapLayer} pointerEvents="none">
          <View style={styles.iframeHost} pointerEvents="none">
            {iframe}
          </View>
          <View style={styles.pinOverlay} pointerEvents="none">
            <EventMapPin
              sport={event.sport || 'その他'}
              compact
              gradientId={`mini-web-${event.id}`}
            />
          </View>
        </View>
      ) : (
        <View style={[styles.mapLayer, styles.fallback]}>
          <EventMapPin
            sport={event.sport || 'その他'}
            compact
            gradientId={`mini-web-fb-${event.id}`}
          />
          <Text style={styles.fallbackLink}>{t('join.tapToOpenMap')}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: MAP_HEIGHT_PX,
    minHeight: MAP_HEIGHT_PX,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceAlt,
  },
  mapLayer: {
    width: '100%',
    height: MAP_HEIGHT_PX,
    minHeight: MAP_HEIGHT_PX,
    position: 'relative',
  },
  iframeHost: {
    width: '100%',
    height: MAP_HEIGHT_PX,
    minHeight: MAP_HEIGHT_PX,
    overflow: 'hidden',
  },
  pinOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -10 }],
  },
  fallback: {
    backgroundColor: theme.colors.iconActiveBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  fallbackLink: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
});
