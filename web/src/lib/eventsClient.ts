import { createPublicSupabase } from '@/lib/supabase';
import {
  activeEventsOrFilter,
  eventColumns,
  filterActiveEvents,
  mapEventRow,
  type EventRow,
  type PublicEvent,
} from '@/lib/types';
import {
  isValidMapBounds,
  type MapBoundsLiteral,
} from '@/lib/userLocation';

/** 中心座標＋半径(km)から矩形 Bounds を作る（都道府県マップ切替用） */
export function boundsAroundCenter(
  lat: number,
  lng: number,
  radiusKm: number,
): MapBoundsLiteral {
  const radius = Math.max(5, radiusKm);
  const dLat = radius / 111;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = radius / (111 * Math.max(0.2, Math.abs(cos)));
  return {
    north: lat + dLat,
    south: lat - dLat,
    east: lng + dLng,
    west: lng - dLng,
  };
}

/**
 * マップ表示範囲内の公開イベントを取得（クライアント用）。
 * latitude / longitude が揃っている行のみ対象。終了済みは除外。
 */
export async function listPublicEventsInBounds(
  bounds: MapBoundsLiteral,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<PublicEvent[]> {
  if (!isValidMapBounds(bounds)) return [];

  const padLat = Math.max(0.002, (bounds.north - bounds.south) * 0.02);
  const padLng = Math.max(0.002, (bounds.east - bounds.west) * 0.02);
  const south = bounds.south - padLat;
  const north = bounds.north + padLat;
  const west = bounds.west - padLng;
  const east = bounds.east + padLng;
  const limit = Math.min(300, Math.max(1, options?.limit ?? 200));

  const supabase = createPublicSupabase();
  let query = supabase
    .from('events')
    .select(eventColumns())
    .is('cancelled_at', null)
    .or(activeEventsOrFilter())
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('latitude', south)
    .lte('latitude', north)
    .gte('longitude', west)
    .lte('longitude', east)
    .order('event_date', { ascending: true })
    .limit(limit);

  // supabase-js v2: abort via fetch option if supported
  if (options?.signal) {
    query = query.abortSignal(options.signal);
  }

  const { data, error } = await query;
  if (error) {
    if (options?.signal?.aborted) return [];
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as EventRow[];
  return filterActiveEvents(
    rows.flatMap((row) => {
      const event = mapEventRow(row);
      if (!event) return [];
      if (event.latitude == null || event.longitude == null) return [];
      return [event];
    }),
  );
}
