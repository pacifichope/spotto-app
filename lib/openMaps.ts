import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

import { formatLocationLabel, type SportEvent } from '@/lib/events';

function hasCoords(latitude?: number, longitude?: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function mapsUrls(event: SportEvent): string[] {
  const label = formatLocationLabel(event.location, event.locationNote);
  const query = encodeURIComponent(label || `${event.latitude},${event.longitude}`);
  const lat = event.latitude;
  const lng = event.longitude;
  const withCoords = hasCoords(lat, lng);

  if (Platform.OS === 'ios') {
    if (withCoords) {
      return [
        `http://maps.apple.com/?ll=${lat},${lng}&q=${query}`,
        `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      ];
    }
    return [
      `http://maps.apple.com/?q=${query}`,
      `https://www.google.com/maps/search/?api=1&query=${query}`,
    ];
  }

  if (Platform.OS === 'android') {
    if (withCoords) {
      return [
        `geo:${lat},${lng}?q=${lat},${lng}(${query})`,
        `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      ];
    }
    return [
      `geo:0,0?q=${query}`,
      `https://www.google.com/maps/search/?api=1&query=${query}`,
    ];
  }

  if (withCoords) {
    return [`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`];
  }
  return [`https://www.google.com/maps/search/?api=1&query=${query}`];
}

export async function openEventInMaps(event: SportEvent) {
  const urls = mapsUrls(event);
  for (const url of urls) {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) continue;
      await Linking.openURL(url);
      return;
    } catch {
      // 次の URL を試す
    }
  }
  const fallback = urls[urls.length - 1];
  if (fallback) {
    await Linking.openURL(fallback);
  }
}
