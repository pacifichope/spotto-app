import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';

import { compactLocationAddress } from '@/lib/formatLocationAddress';

export type PlacePrediction = {
  placeId: string;
  description: string;
  mainText: string;
  latitude?: number;
  longitude?: number;
};

export type PlaceLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

const PLACEHOLDER_KEY_RE = /^(YOUR_|CHANGE_ME|TODO|xxx)/i;

/** Google のキー拒否・CORS 失敗後は、同じセッションでは再リクエストしない */
let googlePlacesDisabled = false;
let googleGeocodeDisabled = false;

export function getGoogleMapsApiKey() {
  const key = (
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
    Constants.expoConfig?.android?.config?.googleMaps?.apiKey ||
    ''
  ).trim();

  if (!key || PLACEHOLDER_KEY_RE.test(key) || key === 'YOUR_GOOGLE_MAPS_API_KEY') {
    return '';
  }
  return key;
}

export function formatCoordLabel(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

/** 緯度経度っぽい文字列か（例: "35.65950, 139.70050"） */
export function looksLikeCoordinateLabel(value: string) {
  const t = String(value || '').trim();
  if (!t) return false;
  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(t);
}

/**
 * 集合場所の「施設名・わかりやすい名称」を優先して返す。
 * 「施設名 · 住所」形式なら施設名側を採用。座標のみなら空文字。
 */
export function preferredPlaceName(location: string, note?: string) {
  const raw = String(location || '').trim();
  const extra = String(note || '').trim();
  if (!raw) return extra;
  if (looksLikeCoordinateLabel(raw)) return extra;

  const compacted = compactLocationAddress(raw);
  const primary =
    compacted.split(/\s*[·•]\s*/u)[0]?.trim() || compacted || raw;

  // 「体育館-2号門」のように note をハイフン連結（参考UIに近い）
  if (extra) {
    if (primary.includes(extra)) return primary;
    return `${primary}-${extra}`;
  }
  return primary;
}

function formatExpoPlace(place: Location.LocationGeocodedAddress) {
  // 施設名（name）を最優先
  const name = place.name?.trim();
  if (name && !looksLikeCoordinateLabel(name)) return name;
  const parts = [
    place.name,
    place.street,
    place.district,
    place.city,
    place.subregion,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return [...new Set(parts)].slice(0, 3).join(' ');
}

function isKeyDeniedStatus(status?: string) {
  return status === 'REQUEST_DENIED';
}

async function fetchGoogleJson<T extends { status?: string }>(
  url: string,
  kind: 'places' | 'geocode',
): Promise<T | null> {
  const disabled = kind === 'places' ? googlePlacesDisabled : googleGeocodeDisabled;
  if (disabled) return null;

  try {
    const res = await fetch(url);
    if (res.status === 401 || res.status === 403) {
      if (kind === 'places') googlePlacesDisabled = true;
      else googleGeocodeDisabled = true;
      return null;
    }
    if (!res.ok) return null;

    const data = (await res.json()) as T;
    if (isKeyDeniedStatus(data.status)) {
      if (kind === 'places') googlePlacesDisabled = true;
      else googleGeocodeDisabled = true;
      return null;
    }
    return data;
  } catch {
    // Web の CORS 失敗などは毎回起きるので、以降は端末側に切り替える
    if (Platform.OS === 'web') {
      if (kind === 'places') googlePlacesDisabled = true;
      else googleGeocodeDisabled = true;
    }
    return null;
  }
}

async function hasGeocodePermission() {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Location.getForegroundPermissionsAsync();
    return current.granted === true;
  } catch {
    return false;
  }
}

async function deviceReverseGeocode(latitude: number, longitude: number) {
  if (Platform.OS === 'web') return '';
  try {
    if (Platform.OS === 'android') {
      const allowed = await hasGeocodePermission();
      if (!allowed) return '';
    }
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    return results[0] ? formatExpoPlace(results[0]) : '';
  } catch {
    return '';
  }
}

async function deviceGeocode(query: string): Promise<PlacePrediction[]> {
  if (Platform.OS === 'web') return [];
  try {
    if (Platform.OS === 'android') {
      const allowed = await hasGeocodePermission();
      if (!allowed) return [];
    }
    const results = await Location.geocodeAsync(query);
    return results.slice(0, 5).map((item, index) => ({
      placeId: `geo:${index}:${item.latitude},${item.longitude}`,
      description: query,
      mainText: query,
      latitude: item.latitude,
      longitude: item.longitude,
    }));
  } catch {
    return [];
  }
}

export async function reverseGeocodeLabel(
  latitude: number,
  longitude: number,
): Promise<string> {
  try {
    const key = getGoogleMapsApiKey();
    if (key && !googleGeocodeDisabled) {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('latlng', `${latitude},${longitude}`);
      url.searchParams.set('key', key);
      url.searchParams.set('language', 'ja');
      const data = await fetchGoogleJson<{
        status?: string;
        results?: {
          formatted_address?: string;
          types?: string[];
          address_components?: {
            long_name?: string;
            short_name?: string;
            types?: string[];
          }[];
        }[];
      }>(url.toString(), 'geocode');

      if (data?.status === 'OK' && (data.results?.length ?? 0) > 0) {
        const preferTypes = [
          'establishment',
          'point_of_interest',
          'premise',
          'stadium',
          'park',
          'gym',
          'university',
          'school',
        ];
        type GeoResult = {
          formatted_address?: string;
          types?: string[];
          address_components?: {
            long_name?: string;
            short_name?: string;
            types?: string[];
          }[];
        };
        const ranked = [...(data.results as GeoResult[])].sort((a, b) => {
          const score = (item: GeoResult) => {
            const types = item.types ?? [];
            const hit = preferTypes.findIndex((t) => types.includes(t));
            return hit === -1 ? 99 : hit;
          };
          return score(a) - score(b);
        });
        const best = ranked[0];
        const premise = best?.address_components?.find((c) =>
          (c.types ?? []).some((t) =>
            ['establishment', 'point_of_interest', 'premise', 'route'].includes(
              t,
            ),
          ),
        )?.long_name;
        const address = compactLocationAddress(
          best?.formatted_address?.trim() || '',
        );
        if (premise && !looksLikeCoordinateLabel(premise)) {
          return address && !address.startsWith(premise)
            ? `${premise} · ${address}`
            : premise;
        }
        if (address) return address;
      }
    }

    const formatted = await deviceReverseGeocode(latitude, longitude);
    return compactLocationAddress(formatted) || '';
  } catch {
    return '';
  }
}

/**
 * 地図ピン／集合場所表示用の短い施設名。
 * 座標のみの location の場合は逆ジオコーディングで補完する。
 * 座標文字列は返さない。
 */
export async function resolveMeetingPlaceLabel(input: {
  location: string;
  locationNote?: string;
  latitude: number;
  longitude: number;
}): Promise<string> {
  const preferred = preferredPlaceName(input.location, input.locationNote);
  if (preferred && !looksLikeCoordinateLabel(preferred)) {
    return preferred;
  }

  const resolved = await reverseGeocodeLabel(input.latitude, input.longitude);
  const name = preferredPlaceName(resolved, input.locationNote);
  if (name && !looksLikeCoordinateLabel(name)) return name;
  if (preferred && !looksLikeCoordinateLabel(preferred)) return preferred;
  return '';
}

export async function searchPlaces(
  query: string,
  near?: { latitude: number; longitude: number },
): Promise<PlacePrediction[]> {
  try {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const key = getGoogleMapsApiKey();
    if (key && !googlePlacesDisabled) {
      const url = new URL(
        'https://maps.googleapis.com/maps/api/place/autocomplete/json',
      );
      url.searchParams.set('input', trimmed);
      url.searchParams.set('key', key);
      url.searchParams.set('language', 'ja');
      url.searchParams.set('components', 'country:jp');
      if (near) {
        url.searchParams.set('location', `${near.latitude},${near.longitude}`);
        url.searchParams.set('radius', '30000');
      }
      const data = await fetchGoogleJson<{
        status?: string;
        predictions?: {
          place_id: string;
          description: string;
          structured_formatting?: { main_text?: string };
        }[];
      }>(url.toString(), 'places');

      if (data?.status === 'OK' && (data.predictions?.length ?? 0) > 0) {
        return (data.predictions ?? []).slice(0, 6).map((item) => ({
          placeId: item.place_id,
          description: item.description,
          mainText: item.structured_formatting?.main_text || item.description,
        }));
      }
    }

    return await deviceGeocode(trimmed);
  } catch {
    return [];
  }
}

export async function resolvePlace(
  prediction: PlacePrediction,
): Promise<PlaceLocation | null> {
  try {
    if (
      typeof prediction.latitude === 'number' &&
      typeof prediction.longitude === 'number'
    ) {
      const label = await reverseGeocodeLabel(
        prediction.latitude,
        prediction.longitude,
      );
      return {
        latitude: prediction.latitude,
        longitude: prediction.longitude,
        label: compactLocationAddress(
          prediction.mainText || label,
        ),
      };
    }

    const key = getGoogleMapsApiKey();
    if (key && !googlePlacesDisabled) {
      const url = new URL(
        'https://maps.googleapis.com/maps/api/place/details/json',
      );
      url.searchParams.set('place_id', prediction.placeId);
      url.searchParams.set('fields', 'geometry,name,formatted_address');
      url.searchParams.set('key', key);
      url.searchParams.set('language', 'ja');
      const data = await fetchGoogleJson<{
        status?: string;
        result?: {
          name?: string;
          formatted_address?: string;
          geometry?: { location?: { lat: number; lng: number } };
        };
      }>(url.toString(), 'places');
      const loc = data?.result?.geometry?.location;
      if (data?.status === 'OK' && loc) {
        const label = compactLocationAddress(
          [data.result?.name, data.result?.formatted_address]
            .filter((part): part is string => Boolean(part && part.trim()))
            .slice(0, 2)
            .join(' · ') || prediction.description,
        );
        return {
          latitude: loc.lat,
          longitude: loc.lng,
          label,
        };
      }
    }

    const fallbackQuery = prediction.description || prediction.mainText;
    const fallback = (await deviceGeocode(fallbackQuery))[0];
    if (
      typeof fallback?.latitude !== 'number' ||
      typeof fallback?.longitude !== 'number'
    ) {
      return null;
    }
    const label = await reverseGeocodeLabel(
      fallback.latitude,
      fallback.longitude,
    );
    return {
      latitude: fallback.latitude,
      longitude: fallback.longitude,
      label: compactLocationAddress(prediction.mainText || label),
    };
  } catch {
    return null;
  }
}
