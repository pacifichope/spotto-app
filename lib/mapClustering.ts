import type { SportEvent } from '@/lib/events';
import type { MapCameraRegion } from '@/components/eventsMapTypes';

export type MapPointCluster = {
  type: 'point';
  id: string;
  event: SportEvent;
  latitude: number;
  longitude: number;
};

export type MapGroupCluster = {
  type: 'cluster';
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  events: SportEvent[];
};

export type MapClusterItem = MapPointCluster | MapGroupCluster;

/**
 * これ以下の latitudeDelta ではクラスタを作らず個別ピンのみ。
 */
export const CLUSTER_DISABLE_LAT_DELTA = 0.028;

/** 画面座標でのクラスタ半径（ビューポート短辺に対する割合） */
const CLUSTER_RADIUS_RATIO = 0.075;

/** クラスタタップ後、現在ズームの何割まで必ず寄せるか */
const CLUSTER_TAP_ZOOM_FACTOR = 0.48;

type ProjectedPoint = {
  event: SportEvent;
  lat: number;
  lng: number;
  x: number;
  y: number;
};

function validCoord(event: SportEvent): { lat: number; lng: number } | null {
  const lat = Number(event.latitude);
  const lng = Number(event.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function zoomLevelFromRegion(region: MapCameraRegion): number {
  const lngDelta = Math.max(Number(region.longitudeDelta) || 0.1, 0.0001);
  return Math.log2(360 / lngDelta);
}

function projectToViewport(
  lat: number,
  lng: number,
  region: MapCameraRegion,
): { x: number; y: number } {
  const latDelta = Math.max(Number(region.latitudeDelta) || 0.1, 0.0001);
  const lngDelta = Math.max(Number(region.longitudeDelta) || 0.1, 0.0001);
  const maxLat = region.latitude + latDelta / 2;
  const minLng = region.longitude - lngDelta / 2;
  const x = (lng - minLng) / lngDelta;
  const y = (maxLat - lat) / latDelta;
  return { x, y };
}

function clusterByScreenOverlap(
  points: ProjectedPoint[],
  radius: number,
): ProjectedPoint[][] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [[points[0]!]];

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let p = i;
    while (parent[p] !== p) p = parent[p]!;
    let cur = i;
    while (parent[cur] !== cur) {
      const next = parent[cur]!;
      parent[cur] = p;
      cur = next;
    }
    return p;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const r2 = radius * radius;
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    for (let j = i + 1; j < n; j += 1) {
      const b = points[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy <= r2) unite(i, j);
    }
  }

  const groups = new Map<number, ProjectedPoint[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(points[i]!);
    else groups.set(root, [points[i]!]);
  }
  return [...groups.values()];
}

function toPointItem(p: ProjectedPoint): MapPointCluster {
  return {
    type: 'point',
    id: `point:${p.event.id}`,
    event: p.event,
    latitude: p.lat,
    longitude: p.lng,
  };
}

function toClusterItem(group: ProjectedPoint[]): MapGroupCluster {
  let sumLat = 0;
  let sumLng = 0;
  const groupEvents: SportEvent[] = [];
  const ids: string[] = [];
  for (const p of group) {
    sumLat += p.lat;
    sumLng += p.lng;
    groupEvents.push(p.event);
    ids.push(p.event.id);
  }
  ids.sort();
  return {
    type: 'cluster',
    id: `cluster:${ids.join('+')}`,
    latitude: sumLat / group.length,
    longitude: sumLng / group.length,
    count: group.length,
    events: groupEvents,
  };
}

/**
 * 同じイベントが point と cluster の両方に出ないよう排他する。
 * - 先に point になった event.id を記録
 * - cluster にその id が含まれる場合はクラスタを解体して point へ展開
 */
export function enforceExclusiveClusterItems(
  items: MapClusterItem[],
): MapClusterItem[] {
  const pointIds = new Set<string>();
  for (const item of items) {
    if (item.type === 'point') pointIds.add(item.event.id);
  }

  const out: MapClusterItem[] = [];
  const emittedPointIds = new Set<string>();

  for (const item of items) {
    if (item.type === 'point') {
      if (emittedPointIds.has(item.event.id)) continue;
      emittedPointIds.add(item.event.id);
      out.push(item);
      continue;
    }

    const overlapsPoint = item.events.some((e) => pointIds.has(e.id));
    if (overlapsPoint) {
      // 親クラスタは捨て、未出力のメンバーだけ個別ピンに
      for (const event of item.events) {
        if (emittedPointIds.has(event.id)) continue;
        const coord = validCoord(event);
        if (!coord) continue;
        emittedPointIds.add(event.id);
        out.push({
          type: 'point',
          id: `point:${event.id}`,
          event,
          latitude: coord.lat,
          longitude: coord.lng,
        });
      }
      continue;
    }

    // クラスタ内の重複 id も排除
    const uniqueEvents: SportEvent[] = [];
    const seen = new Set<string>();
    for (const event of item.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      uniqueEvents.push(event);
    }
    if (uniqueEvents.length <= 1) {
      const event = uniqueEvents[0];
      if (!event || emittedPointIds.has(event.id)) continue;
      const coord = validCoord(event);
      if (!coord) continue;
      emittedPointIds.add(event.id);
      out.push({
        type: 'point',
        id: `point:${event.id}`,
        event,
        latitude: coord.lat,
        longitude: coord.lng,
      });
      continue;
    }

    for (const event of uniqueEvents) emittedPointIds.add(event.id);
    const ids = uniqueEvents.map((e) => e.id).sort();
    let sumLat = 0;
    let sumLng = 0;
    let n = 0;
    for (const event of uniqueEvents) {
      const coord = validCoord(event);
      if (!coord) continue;
      sumLat += coord.lat;
      sumLng += coord.lng;
      n += 1;
    }
    if (n === 0) continue;
    out.push({
      type: 'cluster',
      id: `cluster:${ids.join('+')}`,
      latitude: sumLat / n,
      longitude: sumLng / n,
      count: uniqueEvents.length,
      events: uniqueEvents,
    });
  }

  return out;
}

export type ClusterEventsOptions = {
  /** タップ展開などで必ず個別表示するイベント ID */
  forcePointIds?: ReadonlySet<string> | null;
};

/**
 * 表示領域に応じてクラスタ / 個別ピンを返す。
 * 同一イベントが両方に出ることはない（forcePointIds・排他処理込み）。
 */
export function clusterEventsForRegion(
  events: SportEvent[],
  region: MapCameraRegion,
  options?: ClusterEventsOptions,
): MapClusterItem[] {
  const list = Array.isArray(events) ? events : [];
  const latDelta = Math.max(Number(region.latitudeDelta) || 0.1, 0.0001);
  const forcePointIds = options?.forcePointIds ?? null;

  // 同一 id の重複イベントは先勝ちで除外
  const seenIds = new Set<string>();
  const projected: ProjectedPoint[] = [];
  const forced: ProjectedPoint[] = [];

  for (const event of list) {
    if (!event?.id || seenIds.has(event.id)) continue;
    seenIds.add(event.id);
    const coord = validCoord(event);
    if (!coord) continue;
    const { x, y } = projectToViewport(coord.lat, coord.lng, region);
    if (x < -0.2 || x > 1.2 || y < -0.2 || y > 1.2) continue;
    const point: ProjectedPoint = {
      event,
      lat: coord.lat,
      lng: coord.lng,
      x,
      y,
    };
    if (forcePointIds?.has(event.id)) forced.push(point);
    else projected.push(point);
  }

  const items: MapClusterItem[] = [];

  // 強制個別ピンは常に point
  for (const p of forced) items.push(toPointItem(p));

  if (latDelta <= CLUSTER_DISABLE_LAT_DELTA) {
    for (const p of projected) items.push(toPointItem(p));
    return enforceExclusiveClusterItems(items);
  }

  const zoom = zoomLevelFromRegion(region);
  const radius =
    CLUSTER_RADIUS_RATIO * (zoom >= 12 ? 0.85 : zoom >= 10 ? 0.95 : 1.05);

  const groups = clusterByScreenOverlap(projected, radius);
  for (const group of groups) {
    if (group.length === 1) {
      items.push(toPointItem(group[0]!));
    } else {
      items.push(toClusterItem(group));
    }
  }

  return enforceExclusiveClusterItems(items);
}

function allStillOneCluster(
  events: SportEvent[],
  region: MapCameraRegion,
): boolean {
  const items = clusterEventsForRegion(events, region);
  return (
    items.length === 1 &&
    items[0]?.type === 'cluster' &&
    items[0].count >= events.length
  );
}

/**
 * クラスタタップ時のズーム先。個別ピンが展開されるまで寄せる。
 */
export function regionForClusterEvents(
  events: SportEvent[],
  current: MapCameraRegion,
): MapCameraRegion {
  const coords = events
    .map(validCoord)
    .filter((c): c is { lat: number; lng: number } => c != null);
  if (coords.length === 0) return current;

  let minLat = coords[0]!.lat;
  let maxLat = coords[0]!.lat;
  let minLng = coords[0]!.lng;
  let maxLng = coords[0]!.lng;
  for (const c of coords) {
    minLat = Math.min(minLat, c.lat);
    maxLat = Math.max(maxLat, c.lat);
    minLng = Math.min(minLng, c.lng);
    maxLng = Math.max(maxLng, c.lng);
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const latSpan = Math.max(maxLat - minLat, 0.002);
  const lngSpan = Math.max(maxLng - minLng, 0.002);

  const currentLat = Math.max(Number(current.latitudeDelta) || 0.1, 0.0001);
  const currentLng = Math.max(Number(current.longitudeDelta) || 0.1, 0.0001);
  const aspect = currentLng / currentLat;

  let latitudeDelta = Math.max(latSpan * 2.6, 0.01);
  let longitudeDelta = Math.max(lngSpan * 2.6, 0.01);
  latitudeDelta = Math.min(latitudeDelta, currentLat * CLUSTER_TAP_ZOOM_FACTOR);
  longitudeDelta = Math.min(
    longitudeDelta,
    currentLng * CLUSTER_TAP_ZOOM_FACTOR,
  );

  if (longitudeDelta / latitudeDelta > aspect * 1.25) {
    latitudeDelta = longitudeDelta / aspect;
  } else if (longitudeDelta / latitudeDelta < aspect / 1.25) {
    longitudeDelta = latitudeDelta * aspect;
  }

  let next: MapCameraRegion = {
    latitude: centerLat,
    longitude: centerLng,
    latitudeDelta,
    longitudeDelta,
  };

  for (let i = 0; i < 6; i += 1) {
    if (!allStillOneCluster(events, next)) break;
    next = {
      ...next,
      latitudeDelta: Math.max(next.latitudeDelta * 0.55, 0.006),
      longitudeDelta: Math.max(next.longitudeDelta * 0.55, 0.006),
    };
  }

  if (allStillOneCluster(events, next)) {
    const lat = Math.min(
      next.latitudeDelta,
      CLUSTER_DISABLE_LAT_DELTA * 0.85,
    );
    next = {
      ...next,
      latitudeDelta: lat,
      longitudeDelta: lat * aspect,
    };
  }

  return next;
}
