import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type MapRegion = LatLng & {
  latitudeDelta: number;
  longitudeDelta: number;
};

/** 地図カメラ用のフォールバック（東京都心）。UIラベルには使わない */
export const FALLBACK_COORDS: LatLng = {
  latitude: 35.6895,
  longitude: 139.6917,
};

export const FALLBACK_DELTA = {
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
} as const;

export const FALLBACK_REGION: MapRegion = {
  ...FALLBACK_COORDS,
  ...FALLBACK_DELTA,
};

const GPS_TIMEOUT_MS = 20_000;
const LAST_KNOWN_MAX_AGE_MS = 1000 * 60 * 2;
const LAST_KNOWN_REQUIRED_ACCURACY_M = 200;

export function regionFromCoords(
  coords: LatLng,
  latitudeDelta: number = FALLBACK_DELTA.latitudeDelta,
  longitudeDelta: number = FALLBACK_DELTA.longitudeDelta,
): MapRegion {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

function isValidCoords(coords: LatLng | null | undefined): coords is LatLng {
  return (
    !!coords &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude) &&
    Math.abs(coords.latitude) <= 90 &&
    Math.abs(coords.longitude) <= 180
  );
}

function coordsFromPosition(
  position: Location.LocationObject | null | undefined,
): LatLng | null {
  if (!position) return null;
  const coords = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
  return isValidCoords(coords) ? coords : null;
}

export async function hasForegroundLocationPermission(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    return current.granted === true;
  } catch {
    return false;
  }
}

export async function requestForegroundLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function ensureForegroundLocationPermission(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return true;
    if (current.status === 'undetermined' || current.canAskAgain !== false) {
      if (current.status === 'denied' && current.canAskAgain === false) {
        return false;
      }
      return requestForegroundLocationPermission();
    }
    return false;
  } catch {
    return false;
  }
}

async function readRecentLastKnown(): Promise<LatLng | null> {
  return coordsFromPosition(
    await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_M,
    }).catch(() => null),
  );
}

async function readFreshPosition(): Promise<LatLng | null> {
  if (Platform.OS === 'android') {
    await Location.enableNetworkProviderAsync().catch(() => undefined);
  }

  try {
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), GPS_TIMEOUT_MS);
      }),
    ]);
    return coordsFromPosition(fresh);
  } catch {
    return null;
  }
}

async function readCurrentPosition(): Promise<LatLng | null> {
  // 新鮮な GPS を優先。失敗時のみ直近の lastKnown を使う
  // （古い MapKit キャッシュの San Francisco へ落ちるのを避ける）
  const fresh = await readFreshPosition();
  if (fresh) return fresh;
  return readRecentLastKnown();
}

export async function getCurrentCoordinates(): Promise<LatLng | null> {
  try {
    const servicesOn = await Location.hasServicesEnabledAsync();
    if (!servicesOn) return null;
    const granted = await hasForegroundLocationPermission();
    if (!granted) return null;
    return await readCurrentPosition();
  } catch {
    return null;
  }
}

/** 許可ダイアログ → 現在地。拒否・失敗時は null */
export async function requestPermissionAndGetCoordinates(): Promise<LatLng | null> {
  try {
    const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!servicesOn) return null;
    const granted = await ensureForegroundLocationPermission();
    if (!granted) return null;
    return await readCurrentPosition();
  } catch {
    return null;
  }
}

export function coordsOrFallback(coords: LatLng | null | undefined): LatLng {
  return isValidCoords(coords) ? coords : FALLBACK_COORDS;
}

export type ReverseGeocodePlace = {
  region: string | null;
  subregion: string | null;
  city: string | null;
  district: string | null;
  name: string | null;
};

export async function reverseGeocodePlace(
  coords: LatLng,
): Promise<ReverseGeocodePlace | null> {
  try {
    const results = await Location.reverseGeocodeAsync(coords);
    const first = results[0];
    if (!first) return null;
    return {
      region: first.region ?? null,
      subregion: first.subregion ?? null,
      city: first.city ?? null,
      district: first.district ?? null,
      name: first.name ?? null,
    };
  } catch {
    return null;
  }
}

export type ResolvedUserLocation = {
  coords: LatLng;
  place: ReverseGeocodePlace | null;
};

/** 起動時用: 権限要求 → GPS → 逆ジオコードまで一括 */
export async function resolveUserLocation(): Promise<ResolvedUserLocation | null> {
  const coords = await requestPermissionAndGetCoordinates();
  if (!coords) return null;
  const place = await reverseGeocodePlace(coords);
  return { coords, place };
}
