/**
 * ホーム（リスト／マップ）の閲覧コンテキスト。
 * タブ間移動やリスト↔マップ往復でも、カメラ・フィルター・エリアが消えないようにする。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_AREA,
  formatDetectedLabel,
  mapRegionForSelection,
  matchPrefectureFromGeocode,
  type AreaSelection,
} from '@/lib/areas';
import {
  EMPTY_FILTERS,
  type EventFilters,
  type SortKey,
} from '@/lib/eventBrowse';
import type { CategoryId } from '@/lib/events';
import {
  FALLBACK_REGION,
  requestPermissionAndGetCoordinates,
  resolveUserLocation,
  reverseGeocodePlace,
  type LatLng,
  type MapRegion,
} from '@/lib/userLocation';

export type HomeViewMode = 'map' | 'list';

type HomeBrowseContextValue = {
  view: HomeViewMode;
  setView: (view: HomeViewMode) => void;
  mapRegion: MapRegion;
  setMapRegion: (region: MapRegion) => void;
  /** ユーザーがマップをパン／ズームした（エリア選択のカメラから離れた） */
  mapMovedByUser: boolean;
  area: AreaSelection | null;
  userCoords: LatLng | null;
  locating: boolean;
  category: CategoryId;
  setCategory: (id: CategoryId) => void;
  query: string;
  setQuery: (q: string) => void;
  sortKey: SortKey;
  setSortKey: (key: SortKey) => void;
  eventFilters: EventFilters;
  setEventFilters: (
    next: EventFilters | ((prev: EventFilters) => EventFilters),
  ) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  areaPickerVisible: boolean;
  setAreaPickerVisible: (v: boolean) => void;
  applyArea: (next: AreaSelection) => void;
  applyNearbyFromLocation: (
    coords: LatLng,
    place: Awaited<ReturnType<typeof reverseGeocodePlace>>,
    prefectureFallbackId?: string,
  ) => void;
  /** 起動時一度だけ。既に解決済みなら no-op */
  ensureInitialLocation: () => Promise<void>;
  /** 現在地へ戻す（エリア＋カメラ）。ホームタブ再タップ／現在地ボタン用。成功で true */
  resetToCurrentLocation: () => Promise<boolean>;
  /** エリア変更に伴うカメラ合わせが必要か（明示 apply 時のみ） */
  consumePendingCameraFit: () => MapRegion | null;
};

const HomeBrowseContext = createContext<HomeBrowseContextValue | null>(null);

export function HomeBrowseProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<HomeViewMode>('list');
  const [mapRegion, setMapRegion] = useState<MapRegion>(() => FALLBACK_REGION);
  const [area, setArea] = useState<AreaSelection | null>(null);
  const [userCoords, setUserCoords] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [category, setCategory] = useState<CategoryId>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recommended');
  const [eventFilters, setEventFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [areaPickerVisible, setAreaPickerVisible] = useState(false);

  const mountedRef = useRef(false);
  const initialLocationDoneRef = useRef(false);
  const initialLocationGenRef = useRef(0);
  const resetGenRef = useRef(0);
  const pendingCameraFitRef = useRef<MapRegion | null>(null);
  /** ユーザーがマップをパンしたか。エリア再適用で上書きしない */
  const [mapMovedByUser, setMapMovedByUser] = useState(false);
  const mapMovedByUserRef = useRef(false);
  const areaPrefectureIdRef = useRef<string | undefined>(undefined);
  areaPrefectureIdRef.current = area?.prefectureId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      initialLocationGenRef.current += 1;
      resetGenRef.current += 1;
    };
  }, []);

  const setMapRegionFromUser = useCallback((region: MapRegion) => {
    if (!mountedRef.current) return;
    mapMovedByUserRef.current = true;
    setMapMovedByUser(true);
    setMapRegion(region);
  }, []);

  const applyArea = useCallback((next: AreaSelection) => {
    if (!mountedRef.current) return;
    setArea(next);
    const region = mapRegionForSelection(next);
    if (region) {
      mapMovedByUserRef.current = false;
      setMapMovedByUser(false);
      pendingCameraFitRef.current = region;
      setMapRegion(region);
    }
  }, []);

  const applyNearbyFromLocation = useCallback(
    (
      coords: LatLng,
      place: Awaited<ReturnType<typeof reverseGeocodePlace>>,
      prefectureFallbackId?: string,
    ) => {
      if (!mountedRef.current) return;
      setUserCoords(coords);
      const prefecture = matchPrefectureFromGeocode(place);
      applyArea({
        mode: 'nearby',
        prefectureId:
          prefecture?.id ??
          prefectureFallbackId ??
          DEFAULT_AREA.prefectureId,
        detectedLabel: formatDetectedLabel(place, prefecture),
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    },
    [applyArea],
  );

  const ensureInitialLocation = useCallback(async () => {
    if (initialLocationDoneRef.current) return;
    initialLocationDoneRef.current = true;
    const gen = ++initialLocationGenRef.current;
    if (!mountedRef.current) return;
    setLocating(true);
    try {
      const resolved = await resolveUserLocation();
      if (!mountedRef.current || gen !== initialLocationGenRef.current) return;
      if (!resolved) {
        setUserCoords(null);
        return;
      }
      // ユーザーが既にマップを動かしていたら座標だけ更新しカメラは維持
      if (mapMovedByUserRef.current) {
        setUserCoords(resolved.coords);
        return;
      }
      applyNearbyFromLocation(resolved.coords, resolved.place);
    } finally {
      if (mountedRef.current && gen === initialLocationGenRef.current) {
        setLocating(false);
      }
    }
  }, [applyNearbyFromLocation]);

  // ホーム画面のマウントに依存せず、プロバイダ生存中に一度だけ GPS 初期化
  useEffect(() => {
    void ensureInitialLocation();
  }, [ensureInitialLocation]);

  const resetToCurrentLocation = useCallback(async () => {
    const gen = ++resetGenRef.current;
    if (!mountedRef.current) return false;
    setLocating(true);
    setSelectedId(null);
    try {
      const coords = await requestPermissionAndGetCoordinates();
      if (!mountedRef.current || gen !== resetGenRef.current) return false;
      if (!coords) {
        const resolved = await resolveUserLocation();
        if (!mountedRef.current || gen !== resetGenRef.current) return false;
        if (!resolved) return false;
        applyNearbyFromLocation(resolved.coords, resolved.place);
        return true;
      }
      const place = await reverseGeocodePlace(coords);
      if (!mountedRef.current || gen !== resetGenRef.current) return false;
      applyNearbyFromLocation(coords, place, areaPrefectureIdRef.current);
      return true;
    } finally {
      if (mountedRef.current && gen === resetGenRef.current) {
        setLocating(false);
      }
    }
  }, [applyNearbyFromLocation]);

  const consumePendingCameraFit = useCallback(() => {
    const next = pendingCameraFitRef.current;
    pendingCameraFitRef.current = null;
    return next;
  }, []);

  const value = useMemo<HomeBrowseContextValue>(
    () => ({
      view,
      setView,
      mapRegion,
      setMapRegion: setMapRegionFromUser,
      mapMovedByUser,
      area,
      userCoords,
      locating,
      category,
      setCategory,
      query,
      setQuery,
      sortKey,
      setSortKey,
      eventFilters,
      setEventFilters,
      selectedId,
      setSelectedId,
      areaPickerVisible,
      setAreaPickerVisible,
      applyArea,
      applyNearbyFromLocation,
      ensureInitialLocation,
      resetToCurrentLocation,
      consumePendingCameraFit,
    }),
    [
      view,
      mapRegion,
      setMapRegionFromUser,
      mapMovedByUser,
      area,
      userCoords,
      locating,
      category,
      query,
      sortKey,
      eventFilters,
      selectedId,
      areaPickerVisible,
      applyArea,
      applyNearbyFromLocation,
      ensureInitialLocation,
      resetToCurrentLocation,
      consumePendingCameraFit,
    ],
  );

  return (
    <HomeBrowseContext.Provider value={value}>
      {children}
    </HomeBrowseContext.Provider>
  );
}

export function useHomeBrowse() {
  const ctx = useContext(HomeBrowseContext);
  if (!ctx) {
    throw new Error('useHomeBrowse must be used within HomeBrowseProvider');
  }
  return ctx;
}
