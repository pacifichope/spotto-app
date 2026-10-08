/**
 * Web 版の現在地取得。
 * アプリ版 `lib/userLocation.ts`（expo-location）と同等の契約・フォールバックを、
 * ブラウザの Geolocation API で実装する。
 */

export type LatLng = {
  latitude: number;
  longitude: number;
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

/** 「現在地付近」の検索半径（アプリ版 NEARBY_RADIUS_KM と揃える） */
export const NEARBY_RADIUS_KM = 40;

const GPS_TIMEOUT_MS = 20_000;
const MAX_AGE_MS = 1000 * 60 * 2;

export type GeolocationFailureReason =
  | 'unsupported'
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'invalid'
  | 'unknown';

export function isValidCoords(coords: LatLng | null | undefined): coords is LatLng {
  return (
    !!coords &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude) &&
    Math.abs(coords.latitude) <= 90 &&
    Math.abs(coords.longitude) <= 180
  );
}

export function coordsOrFallback(coords: LatLng | null | undefined): LatLng {
  return isValidCoords(coords) ? coords : FALLBACK_COORDS;
}

export function toMapLatLng(coords: LatLng): { lat: number; lng: number } {
  return { lat: coords.latitude, lng: coords.longitude };
}

export function distanceKm(from: LatLng, to: LatLng): number {
  const dLat = (to.latitude - from.latitude) * 111;
  const dLng =
    (to.longitude - from.longitude) *
    111 *
    Math.cos((from.latitude * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function isWithinRadiusKm(
  origin: LatLng,
  point: { latitude: number; longitude: number },
  radiusKm: number = NEARBY_RADIUS_KM,
): boolean {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    !Number.isFinite(radiusKm)
  ) {
    return false;
  }
  const distance = distanceKm(origin, {
    latitude: point.latitude,
    longitude: point.longitude,
  });
  return Number.isFinite(distance) && distance <= radiusKm;
}

/** マップ表示範囲（北東・南西） */
export type MapBoundsLiteral = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export function isValidMapBounds(
  bounds: MapBoundsLiteral | null | undefined,
): bounds is MapBoundsLiteral {
  return (
    !!bounds &&
    Number.isFinite(bounds.north) &&
    Number.isFinite(bounds.south) &&
    Number.isFinite(bounds.east) &&
    Number.isFinite(bounds.west) &&
    bounds.north >= bounds.south
  );
}

/** 点が表示範囲内か（簡易。日本国内想定で日付変更線は未対応） */
export function isWithinMapBounds(
  point: { lat: number; lng: number },
  bounds: MapBoundsLiteral,
): boolean {
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    !isValidMapBounds(bounds)
  ) {
    return false;
  }
  return (
    point.lat <= bounds.north &&
    point.lat >= bounds.south &&
    point.lng <= bounds.east &&
    point.lng >= bounds.west
  );
}

/** カメラが大きく動いたか（再検索ボタン表示用） */
export function mapBoundsMovedSignificantly(
  a: MapBoundsLiteral,
  b: MapBoundsLiteral,
  threshold = 0.12,
): boolean {
  if (!isValidMapBounds(a) || !isValidMapBounds(b)) return true;
  const height = Math.max(Math.abs(a.north - a.south), 1e-6);
  const width = Math.max(Math.abs(a.east - a.west), 1e-6);
  const dLat = Math.abs((a.north + a.south) / 2 - (b.north + b.south) / 2);
  const dLng = Math.abs((a.east + a.west) / 2 - (b.east + b.west) / 2);
  const dH = Math.abs(height - Math.abs(b.north - b.south)) / height;
  const dW = Math.abs(width - Math.abs(b.east - b.west)) / width;
  return (
    dLat / height > threshold ||
    dLng / width > threshold ||
    dH > threshold ||
    dW > threshold
  );
}

function reasonFromGeolocationError(
  error: GeolocationPositionError | null | undefined,
): GeolocationFailureReason {
  if (!error) return 'unknown';
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'permission_denied';
    case error.POSITION_UNAVAILABLE:
      return 'position_unavailable';
    case error.TIMEOUT:
      return 'timeout';
    default:
      return 'unknown';
  }
}

/**
 * ブラウザから現在地を1回取得する。
 * 権限拒否・未対応・タイムアウト時は null（画面はフォールバック座標で継続）。
 */
export function getCurrentCoordinates(): Promise<{
  coords: LatLng | null;
  reason: GeolocationFailureReason | null;
}> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ coords: null, reason: 'unsupported' });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (
      coords: LatLng | null,
      reason: GeolocationFailureReason | null,
    ) => {
      if (settled) return;
      settled = true;
      resolve({ coords, reason });
    };

    const timer = window.setTimeout(() => {
      finish(null, 'timeout');
    }, GPS_TIMEOUT_MS + 500);

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          window.clearTimeout(timer);
          const next: LatLng = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          if (!isValidCoords(next)) {
            finish(null, 'invalid');
            return;
          }
          finish(next, null);
        },
        (error) => {
          window.clearTimeout(timer);
          finish(null, reasonFromGeolocationError(error));
        },
        {
          enableHighAccuracy: true,
          timeout: GPS_TIMEOUT_MS,
          maximumAge: MAX_AGE_MS,
        },
      );
    } catch {
      window.clearTimeout(timer);
      finish(null, 'unknown');
    }
  });
}

/** 権限ダイアログを含めて現在地を取る（アプリ版 requestPermissionAndGetCoordinates 相当） */
export async function requestPermissionAndGetCoordinates(): Promise<{
  coords: LatLng | null;
  reason: GeolocationFailureReason | null;
}> {
  return getCurrentCoordinates();
}
