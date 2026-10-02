import type { SportEvent } from '@/lib/events';
import type { MapCameraRegion } from '@/components/eventsMapTypes';

export type MapPointCluster = {
  type: 'point';
  id: string;
  event: SportEvent;
  latitude: number;
  longitude: number;
  /** 広域ズーム時は小さなドット */
  appearance?: 'full' | 'dot';
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
 * （おおよそ数 km 四方＝街〜街区ズームでバッジを消す）
 */
export const CLUSTER_DISABLE_LAT_DELTA = 0.06;

/** これ以上のズームでは必ず個別ピン（lngDelta ベース） */
export const CLUSTER_DISABLE_ZOOM = 13;

/**
 * これ以上の latitudeDelta（広域〜全国）では個別ピンを出さずクラスタのみ。
 * 日本列島が見えるスケールでもピンとバッジが重ならないようにする。
 */
export const CLUSTER_HIDE_SINGLETON_LAT_DELTA = 1.0;

/** これ以上で「地方スケール」：単独はドット、近傍はクラスタ優先 */
export const CLUSTER_DOT_LAT_DELTA = 0.45;

/** 画面座標でのクラスタ半径（ビューポート短辺に対する割合） */
const CLUSTER_RADIUS_RATIO = 0.075;

/** クラスタタップ後、現在ズームの何割まで必ず寄せるか */
const CLUSTER_TAP_ZOOM_FACTOR = 0.48;

/** 広域で孤立点を近傍クラスタへ吸収する画面距離 */
const SINGLETON_ABSORB_RADIUS = 0.12;

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

/** 個別ピンを出さない広域ズームか（クラスタのみ） */
export function isClusterOnlyZoom(region: MapCameraRegion): boolean {
  const latDelta = Math.max(Number(region.latitudeDelta) || 0.1, 0.0001);
  const zoom = zoomLevelFromRegion(region);
  return latDelta >= CLUSTER_HIDE_SINGLETON_LAT_DELTA || zoom < 8;
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

/** 緯度経度グリッドで近傍イベントをまとめる（広域ズーム用） */
function clusterByGeoGrid(
  points: ProjectedPoint[],
  cellDeg: number,
): ProjectedPoint[][] {
  if (points.length === 0) return [];
  const cell = Math.max(cellDeg, 0.05);
  const groups = new Map<string, ProjectedPoint[]>();
  for (const point of points) {
    const key = `${Math.floor(point.lat / cell)}:${Math.floor(point.lng / cell)}`;
    const list = groups.get(key);
    if (list) list.push(point);
    else groups.set(key, [point]);
  }
  return [...groups.values()];
}

function groupCentroid(group: ProjectedPoint[]) {
  let x = 0;
  let y = 0;
  for (const p of group) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(group.length, 1);
  return { x: x / n, y: y / n };
}

/**
 * 孤立点を画面上の近傍クラスタへ吸収。
 * 広域で「クラスタの上に単独ピン」が乗るのを防ぐ。
 */
function absorbSingletonsIntoClusters(
  groups: ProjectedPoint[][],
  absorbRadius: number,
  hideUnabsorbed: boolean,
): ProjectedPoint[][] {
  const multis = groups.filter((g) => g.length >= 2).map((g) => [...g]);
  const singles = groups.filter((g) => g.length === 1);
  if (singles.length === 0) return multis.length > 0 ? multis : groups;

  if (multis.length === 0) {
    return hideUnabsorbed ? [] : singles;
  }

  const r2 = absorbRadius * absorbRadius;
  const leftover: ProjectedPoint[][] = [];

  for (const solo of singles) {
    const p = solo[0];
    if (!p) continue;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < multis.length; i += 1) {
      const c = groupCentroid(multis[i]!);
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2 && d2 < bestDist) {
        bestDist = d2;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      multis[bestIdx]!.push(p);
    } else if (!hideUnabsorbed) {
      leftover.push(solo);
    }
  }

  return [...multis, ...leftover];
}

/**
 * 画面上で近接したクラスタ同士を再結合（グリッド境界の割れ対策）
 */
function mergeNearbyGroups(
  groups: ProjectedPoint[][],
  radius: number,
): ProjectedPoint[][] {
  const n = groups.length;
  if (n <= 1) return groups;

  const centroids = groups.map((g) => groupCentroid(g));
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
    const a = centroids[i]!;
    for (let j = i + 1; j < n; j += 1) {
      const b = centroids[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy <= r2) unite(i, j);
    }
  }

  const buckets = new Map<number, ProjectedPoint[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    const list = buckets.get(root) ?? [];
    const seen = new Set(list.map((p) => p.event.id));
    for (const p of groups[i]!) {
      if (seen.has(p.event.id)) continue;
      seen.add(p.event.id);
      list.push(p);
    }
    buckets.set(root, list);
  }
  return [...buckets.values()];
}

function toPointItem(
  p: ProjectedPoint,
  appearance: 'full' | 'dot' = 'full',
): MapPointCluster {
  return {
    type: 'point',
    id: `point:${p.event.id}`,
    event: p.event,
    latitude: p.lat,
    longitude: p.lng,
    appearance,
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
 * preferClusters: 広域時はポイントよりクラスタを優先（重なりでクラスタを解体しない）
 */
export function enforceExclusiveClusterItems(
  items: MapClusterItem[],
  options?: { preferClusters?: boolean },
): MapClusterItem[] {
  const preferClusters = Boolean(options?.preferClusters);
  const pointIds = new Set<string>();
  for (const item of items) {
    if (item.type === 'point') pointIds.add(item.event.id);
  }

  const out: MapClusterItem[] = [];
  const emittedPointIds = new Set<string>();
  const emittedInCluster = new Set<string>();

  if (preferClusters) {
    for (const item of items) {
      if (item.type !== 'cluster') continue;
      const uniqueEvents: SportEvent[] = [];
      const seen = new Set<string>();
      for (const event of item.events) {
        if (seen.has(event.id) || emittedInCluster.has(event.id)) continue;
        seen.add(event.id);
        uniqueEvents.push(event);
      }
      if (uniqueEvents.length <= 1) {
        continue;
      }
      for (const event of uniqueEvents) emittedInCluster.add(event.id);
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
    for (const item of items) {
      if (item.type !== 'point') continue;
      if (emittedInCluster.has(item.event.id)) continue;
      if (emittedPointIds.has(item.event.id)) continue;
      emittedPointIds.add(item.event.id);
      out.push(item);
    }
    return out;
  }

  for (const item of items) {
    if (item.type === 'point') {
      if (emittedPointIds.has(item.event.id)) continue;
      emittedPointIds.add(item.event.id);
      out.push(item);
      continue;
    }

    const overlapsPoint = item.events.some((e) => pointIds.has(e.id));
    if (overlapsPoint) {
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
          appearance: 'full',
        });
      }
      continue;
    }

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
        appearance: 'full',
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
 *
 * ルール:
 * - 十分ズームイン → すべて個別スポーツピン
 * - 広域（日本列島スケール等）→ クラスタのみ（個別ピンなし）
 * - 中間 → 画面／グリッドでまとめ、単独はドット
 * - 同一イベントがクラスタと個別ピンの両方に出ることはない
 */
export function clusterEventsForRegion(
  events: SportEvent[],
  region: MapCameraRegion,
  options?: ClusterEventsOptions,
): MapClusterItem[] {
  const list = Array.isArray(events) ? events : [];
  const latDelta = Math.max(Number(region.latitudeDelta) || 0.1, 0.0001);
  const forcePointIds = options?.forcePointIds ?? null;
  const zoom = zoomLevelFromRegion(region);

  const seenIds = new Set<string>();
  const projected: ProjectedPoint[] = [];
  const forced: ProjectedPoint[] = [];

  for (const event of list) {
    if (!event?.id || seenIds.has(event.id)) continue;
    seenIds.add(event.id);
    const coord = validCoord(event);
    if (!coord) continue;
    const { x, y } = projectToViewport(coord.lat, coord.lng, region);
    if (x < -0.15 || x > 1.15 || y < -0.15 || y > 1.15) continue;
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

  // 十分ズームイン: クラスタなし・個別ピンのみ
  if (latDelta <= CLUSTER_DISABLE_LAT_DELTA || zoom >= CLUSTER_DISABLE_ZOOM) {
    for (const p of forced) items.push(toPointItem(p, 'full'));
    for (const p of projected) items.push(toPointItem(p, 'full'));
    return enforceExclusiveClusterItems(items);
  }

  const clusterOnly = isClusterOnlyZoom(region);
  const regional =
    !clusterOnly && (latDelta >= CLUSTER_DOT_LAT_DELTA || zoom < 10);

  // 広域では展開ピンも出さない（クラスタの上にスポーツピンが乗るのを防ぐ）
  if (!clusterOnly) {
    for (const p of forced) items.push(toPointItem(p, 'full'));
  } else {
    for (const p of forced) projected.push(p);
  }

  const radius =
    CLUSTER_RADIUS_RATIO *
    (clusterOnly
      ? 1.85
      : regional
        ? 1.35
        : zoom >= 12
          ? 0.45
          : zoom >= 11
            ? 0.65
            : zoom >= 10
              ? 0.9
              : 1.1);

  let groups: ProjectedPoint[][];
  if (clusterOnly) {
    const cellDeg = latDelta >= 4 ? 1.8 : latDelta >= 2 ? 1.2 : 0.85;
    groups = clusterByGeoGrid(projected, cellDeg);
    groups = mergeNearbyGroups(groups, radius);
    groups = absorbSingletonsIntoClusters(
      groups,
      SINGLETON_ABSORB_RADIUS,
      true,
    );
  } else if (regional) {
    groups = clusterByGeoGrid(projected, zoom < 9 ? 0.4 : 0.22);
    groups = mergeNearbyGroups(groups, radius * 0.9);
    groups = absorbSingletonsIntoClusters(
      groups,
      SINGLETON_ABSORB_RADIUS * 0.85,
      false,
    );
  } else {
    groups = clusterByScreenOverlap(projected, radius);
  }

  for (const group of groups) {
    if (group.length <= 1) {
      const alone = group[0];
      if (!alone) continue;
      if (clusterOnly) continue;
      items.push(toPointItem(alone, regional ? 'dot' : 'full'));
      continue;
    }
    items.push(toClusterItem(group));
  }

  return enforceExclusiveClusterItems(items, {
    preferClusters: clusterOnly || regional,
  });
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
