import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AreaPickerModal from '@/components/AreaPickerModal';
import BrandGradient from '@/components/BrandGradient';
import CategoryTabs from '@/components/CategoryTabs';
import CreateEventButton from '@/components/CreateEventButton';
import CreateEventModal from '@/components/CreateEventModal';
import type { CreateEventPayload } from '@/components/createEventSheetTypes';
import FilterPickerModal from '@/components/FilterPickerModal';
import EventList from '@/components/EventList';
import EventsMap, { type EventsMapRef } from '@/components/EventsMap';
import HeaderRoundButton from '@/components/HeaderRoundButton';
import HomeHeader from '@/components/HomeHeader';
import HomeWeekDateStrip from '@/components/HomeWeekDateStrip';
import MapEventPreviewCard from '@/components/MapEventPreviewCard';
import SaveToast, { useTimedToast } from '@/components/SaveToast';
import SortFilterBar from '@/components/SortFilterBar';
import SortPickerModal from '@/components/SortPickerModal';
import { ListIcon } from '@/components/icons';
import { theme } from '@/constants/theme';
import {
  AREA_LABEL_LOCATING,
  AREA_LABEL_UNSET,
  DEFAULT_AREA,
  filterEventsByArea,
  formatDetectedLabel,
  getAreaLabel,
  getPrefectureById,
  mapRegionForSelection,
  matchPrefectureFromGeocode,
  resolveSelectionCenter,
  type AreaSelection,
} from '@/lib/areas';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  buildBrowseInterestProfile,
  filterActiveBrowseEvents,
  filterEventsByBrowse,
  filterEventsWithinUpcomingDays,
  sortEventsByBrowse,
  type EventFilters,
  type SortKey,
} from '@/lib/eventBrowse';
import {
  eventMatchesCategory,
  type CategoryId,
  type SportEvent,
} from '@/lib/events';
import { useEvents } from '@/lib/eventsContext';
import { useBlocks } from '@/lib/blocksContext';
import { useCreateEventAccess } from '@/lib/createEventAccessContext';
import {
  FALLBACK_REGION,
  requestPermissionAndGetCoordinates,
  resolveUserLocation,
  reverseGeocodePlace,
} from '@/lib/userLocation';
import { eventMatchesSearchQuery } from '@/lib/searchText';

type ViewMode = 'map' | 'list';

function eventsForSelectedArea(
  events: SportEvent[],
  area: AreaSelection | null,
): SportEvent[] {
  if (!area) return events;
  if (typeof filterEventsByArea !== 'function') return events;
  try {
    return filterEventsByArea(events, area) ?? [];
  } catch {
    // 失敗時に全件（東京など）を出さない
    return [];
  }
}

/**
 * spotto ホーム
 * デフォルトはリスト（タイムライン）。マップはサブ機能として切替可能。
 */
export default function SportsAppScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mapRef = useRef<EventsMapRef>(null);
  const { events, now, joinedIds, createEvent, saveEventDraft, eventsLoading, eventsError, clearEventsError, refreshEvents, eventsSaving, pastJoinedEvents, upcomingJoinedEvents, favoriteEvents, favoriteIds } =
    useEvents();
  const requestCreateAccess = useCreateEventAccess();
  const { filterEvents } = useBlocks();
  const safeJoinedIds =
    joinedIds instanceof Set ? joinedIds : new Set<string>();
  const safeNow =
    now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();

  const [view, setView] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useTimedToast();
  const [area, setArea] = useState<AreaSelection | null>(null);
  const [areaPickerVisible, setAreaPickerVisible] = useState(false);
  const [locating, setLocating] = useState(true);
  const [mapRegion, setMapRegion] = useState(() => FALLBACK_REGION);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recommended');
  const [eventFilters, setEventFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [sortPickerVisible, setSortPickerVisible] = useState(false);
  const [filterPickerVisible, setFilterPickerVisible] = useState(false);
  const shownEventsErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!eventsError) {
      shownEventsErrorRef.current = null;
      return;
    }
    if (shownEventsErrorRef.current === eventsError) return;
    shownEventsErrorRef.current = eventsError;
    Alert.alert('読み込みに失敗しました', eventsError, [
      { text: '閉じる', style: 'cancel', onPress: () => clearEventsError() },
      {
        text: '再試行',
        onPress: () => {
          clearEventsError();
          void refreshEvents();
        },
      },
    ]);
  }, [eventsError, clearEventsError, refreshEvents]);

  const topPad = insets.top + 8;
  const bottomPad = Math.max(insets.bottom, 10) + 8;
  const areaLabel = locating
    ? AREA_LABEL_LOCATING
    : area
      ? getAreaLabel(area)
      : AREA_LABEL_UNSET;

  const applyArea = useCallback((next: AreaSelection) => {
    setArea(next);
    const region = mapRegionForSelection(next);
    if (region) {
      setMapRegion(region);
      mapRef.current?.animateToRegion(region, 500);
    }
  }, []);

  // 起動時に GPS を取得し、成功時は現在地エリアへ反映
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLocating(true);
      setArea(null);
      try {
        const resolved = await resolveUserLocation();
        if (cancelled) return;
        if (!resolved) {
          // 拒否・失敗時は未設定（San Francisco / 偽の現在地は出さない）
          setArea(null);
          setMapRegion(FALLBACK_REGION);
          return;
        }
        const prefecture = matchPrefectureFromGeocode(resolved.place);
        applyArea({
          mode: 'nearby',
          prefectureId: prefecture?.id ?? DEFAULT_AREA.prefectureId,
          detectedLabel: formatDetectedLabel(resolved.place, prefecture),
          latitude: resolved.coords.latitude,
          longitude: resolved.coords.longitude,
        });
      } finally {
        if (!cancelled) {
          setLocating(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyArea]);

  const handleSelectNearby = useCallback(async () => {
    setLocating(true);
    try {
      const coords = await requestPermissionAndGetCoordinates();
      if (!coords) {
        Alert.alert(
          '現在地を取得できません',
          '位置情報の許可をオンにすると、いまいる場所の周辺イベントを探せます。',
        );
        return;
      }
      const place = await reverseGeocodePlace(coords);
      const prefecture = matchPrefectureFromGeocode(place);
      applyArea({
        mode: 'nearby',
        prefectureId: prefecture?.id ?? area?.prefectureId ?? DEFAULT_AREA.prefectureId,
        detectedLabel: formatDetectedLabel(place, prefecture),
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      setAreaPickerVisible(false);
    } finally {
      setLocating(false);
    }
  }, [applyArea, area?.prefectureId]);

  const handleSelectPrefecture = useCallback(
    (prefectureId: string) => {
      applyArea({
        mode: 'prefecture',
        prefectureId,
      });
      setAreaPickerVisible(false);
    },
    [applyArea],
  );

  const areaEvents = useMemo(() => {
    const source = Array.isArray(events)
      ? events.filter((event) => event && typeof event.id === 'string' && event.id)
      : [];
    try {
      const inArea = eventsForSelectedArea(source, area);
      // 終了・中止はホームから除外（履歴はマイページの past* で表示）
      const scoped = filterActiveBrowseEvents(inArea, safeNow);
      return typeof filterEvents === 'function' ? filterEvents(scoped) : scoped;
    } catch {
      // エリア未適用の全件フォールバックはしない（別地域イベント混入防止）
      return [];
    }
  }, [events, area, safeNow, filterEvents]);

  const interestProfile = useMemo(
    () =>
      buildBrowseInterestProfile({
        joinedEvents: [...upcomingJoinedEvents, ...pastJoinedEvents],
        favoriteEvents,
        favoriteIds,
      }),
    [upcomingJoinedEvents, pastJoinedEvents, favoriteEvents, favoriteIds],
  );

  const filteredEvents = useMemo(() => {
    try {
      let list = areaEvents.filter((e) => {
        try {
          return eventMatchesCategory(e, category);
        } catch {
          return category === 'all';
        }
      });

      const q = query.trim();
      if (q) {
        list = list.filter((e) => {
          try {
            return eventMatchesSearchQuery(e, q);
          } catch {
            return false;
          }
        });
      }

      list = filterEventsByBrowse(list, eventFilters);
      return sortEventsByBrowse(list, sortKey, {
        origin: resolveSelectionCenter(area),
        now: safeNow,
        interest: interestProfile,
        areaMode: area?.mode ?? null,
      });
    } catch {
      return areaEvents;
    }
  }, [
    areaEvents,
    area,
    category,
    query,
    sortKey,
    eventFilters,
    interestProfile,
    safeNow,
  ]);

  /** マップ: 今日から1週間（7日間）以内の開催のみピン・プレビュー対象 */
  const mapEvents = useMemo(
    () => filterEventsWithinUpcomingDays(filteredEvents, 7, safeNow),
    [filteredEvents, safeNow],
  );

  useEffect(() => {
    if (view !== 'map') return;
    if (selectedId && !mapEvents.some((event) => event.id === selectedId)) {
      setSelectedId(null);
    }
  }, [view, mapEvents, selectedId]);

  useEffect(() => {
    if (selectedId && !filteredEvents.some((event) => event.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredEvents, selectedId]);

  useEffect(() => {
    if (view !== 'map') return;
    const next = mapRegionForSelection(area) ?? FALLBACK_REGION;
    setMapRegion(next);
    mapRef.current?.animateToRegion(next, 400);
  }, [view, area]);

  const handleSelectEvent = useCallback((event: SportEvent | null) => {
    setSelectedId(event ? event.id : null);
  }, []);

  const selectedMapEvent = useMemo(() => {
    if (view !== 'map' || !selectedId) return null;
    return mapEvents.find((event) => event.id === selectedId) ?? null;
  }, [view, selectedId, mapEvents]);

  const openMapEventDetail = useCallback(
    (event: SportEvent) => {
      router.push(`/event/${event.id}`);
    },
    [router],
  );

  const openCreate = () => {
    requestCreateAccess(() => {
      setCreating(true);
    });
  };

  const handleCreate = async (payload: CreateEventPayload) => {
    const result = await createEvent(payload);
    if (!result.ok) {
      Alert.alert('保存に失敗しました', result.error);
      return;
    }
    setCreating(false);
    router.push(`/event/${result.event.id}`);
    const count = result.events.length;
    Alert.alert(
      '主催しました',
      count > 1
        ? `「${result.event.title}」を ${count} 件の独立したイベントとして公開しました。`
        : result.event.title,
    );
  };

  const listHeader = (
    <View style={styles.listHeader}>
      <HomeHeader
        areaLabel={areaLabel}
        query={query}
        onChangeQuery={setQuery}
        onPressArea={() => setAreaPickerVisible(true)}
        onPressMap={() => setView('map')}
      />
      <View style={styles.browseControls}>
        <View style={styles.categoryWrap}>
          <CategoryTabs activeId={category} onChange={setCategory} />
        </View>
        <HomeWeekDateStrip
          selectedStamp={eventFilters.day}
          now={safeNow}
          onSelect={(stamp) => {
            setEventFilters((prev) => ({
              ...prev,
              day: stamp,
              // 特定日とプリセット日時は排他
              date: stamp ? null : prev.date,
            }));
          }}
        />
        <SortFilterBar
          sortKey={sortKey}
          filterCount={activeFilterCount(eventFilters)}
          count={filteredEvents.length}
          areaMode={area?.mode ?? null}
          prefectureLabel={
            area?.mode === 'prefecture'
              ? getPrefectureById(area.prefectureId).label
              : null
          }
          onPressSort={() => setSortPickerVisible(true)}
          onPressFilter={() => setFilterPickerVisible(true)}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <BrandGradient
        variant="soft"
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* Map（表示中のみマウント → Apple Maps の SF デフォルトを回避） */}
      {view === 'map' ? (
        <View collapsable={false} style={styles.mapLayer}>
          <EventsMap
            ref={mapRef}
            events={mapEvents}
            selectedId={selectedId}
            joinedIds={safeJoinedIds}
            onSelectEvent={handleSelectEvent}
            region={mapRegion}
            initialRegion={mapRegion}
            showsUserLocation
            userCoordinate={
              area?.latitude != null && area?.longitude != null
                ? { latitude: area.latitude, longitude: area.longitude }
                : null
            }
          />
          <View
            style={[styles.mapTop, { paddingTop: topPad }]}
            pointerEvents="box-none"
          >
            <HeaderRoundButton
              onPress={() => {
                setSelectedId(null);
                setView('list');
              }}
              accessibilityLabel="リスト表示に戻る"
            >
              <ListIcon size={20} color={theme.colors.onPrimary} />
            </HeaderRoundButton>
          </View>

          {selectedMapEvent ? (
            <MapEventPreviewCard
              event={selectedMapEvent}
              bottomInset={bottomPad}
              onClose={() => setSelectedId(null)}
              onOpenDetail={openMapEventDetail}
            />
          ) : null}
        </View>
      ) : null}

      {/* List（デフォルト） */}
      {view === 'list' && (
        <View style={[styles.listRoot, { paddingTop: topPad }]}>
          <EventList
            events={filteredEvents}
            selectedId={selectedId}
            joinedIds={safeJoinedIds}
            onSelect={(event) => setSelectedId(event.id)}
            ListHeaderComponent={listHeader}
            contentPaddingBottom={bottomPad + 88}
            ListEmptyComponent={
              eventsLoading ? (
                <View style={styles.emptyLoading}>
                  <ActivityIndicator
                    size="large"
                    color={theme.colors.primary}
                  />
                </View>
              ) : undefined
            }
          />
        </View>
      )}

      {/* FAB（リスト表示時） */}
      {view === 'list' ? (
        <View
          style={[styles.fabOverlay, { paddingBottom: bottomPad + 4 }]}
          pointerEvents="box-none"
        >
          <CreateEventButton onPress={openCreate} />
        </View>
      ) : null}

      <CreateEventModal
        visible={creating}
        onClose={() => setCreating(false)}
        onSubmit={handleCreate}
        onSaveDraft={(snapshot) => {
          saveEventDraft(snapshot);
          setToast('下書きを保存しました');
        }}
      />

      <SaveToast message={toast} bottomOffset={bottomPad + 72} />

      {(eventsLoading || eventsSaving) && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}

      <AreaPickerModal
        visible={areaPickerVisible}
        selection={area}
        locating={locating}
        onClose={() => setAreaPickerVisible(false)}
        onSelectNearby={() => {
          void handleSelectNearby();
        }}
        onSelectPrefecture={handleSelectPrefecture}
      />

      <SortPickerModal
        visible={sortPickerVisible}
        sortKey={sortKey}
        onClose={() => setSortPickerVisible(false)}
        onSelect={setSortKey}
      />

      <FilterPickerModal
        visible={filterPickerVisible}
        filters={eventFilters}
        onChange={setEventFilters}
        onClose={() => setFilterPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.homeGradientBottom,
  },
  gradient: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
  },
  listRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    position: 'relative',
    zIndex: 2,
  },
  listHeader: {
    gap: 10,
    marginBottom: 8,
    paddingTop: 4,
  },
  browseControls: {
    gap: 8,
  },
  categoryWrap: {
    marginHorizontal: -16,
  },
  mapLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  mapTop: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  emptyLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
    paddingBottom: 32,
  },
  fabOverlay: {
    position: 'absolute',
    right: 18,
    bottom: 0,
    zIndex: 30,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
    zIndex: 40,
  },
});
