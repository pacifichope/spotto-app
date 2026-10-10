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

/**
 * Expo Web / react-native-web 向けミニマップ。
 * react-native-maps / Static Maps API は使わず、Google Maps の embed iframe で
 * タイルを確実に表示する（EventsMap.web と同じ方式）。
 * タップで外部 Google Maps を開く。
 */
export default function MiniMap({ event }: MiniMapProps) {
  const { t } = useTranslation();
  const lat = Number(event.latitude);
  const lng = Number(event.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const mapSrc = useMemo(() => {
    if (!hasCoords) return null;
    return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed&hl=ja`;
  }, [hasCoords, lat, lng]);

  const openMaps = () => {
    void openEventInMaps(event);
  };

  const iframe = mapSrc
    ? createElement('iframe', {
        title: t('join.openMapA11y'),
        src: mapSrc,
        style: {
          border: 0,
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          // 親 Pressable がタップを受け取る
          pointerEvents: 'none',
        },
        loading: 'lazy',
        referrerPolicy: 'no-referrer-when-downgrade',
        allowFullScreen: true,
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
        <View style={[styles.mapImage, styles.fallback]}>
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
    height: 168,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceAlt,
  },
  mapLayer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  iframeHost: {
    ...StyleSheet.absoluteFillObject,
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  /** ピン先端が地図中心に来るよう、コンパクトピンを少し上にずらす */
  pinOverlay: {
    ...StyleSheet.absoluteFillObject,
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
