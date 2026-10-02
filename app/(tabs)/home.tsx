import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

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
  filterEventsByMapRegion,
  getAreaLabel,
  getPrefectureById,
  labelForMapRegion,
} from '@/lib/areas';
import {
  activeFilterCount,
  buildBrowseInterestProfile,
  filterActiveBrowseEvents,
  filterEventsByBrowse,
  sortEventsByBrowse,
} from '@/lib/eventBrowse';
import {
  eventMatchesCategory,
  type SportEvent,
} from '@/lib/events';
import { useEvents } from '@/lib/eventsContext';
import { useBlocks } from '@/lib/blocksContext';
import { useCreateEventAccess } from '@/lib/createEventAccessContext';
import { useHomeBrowse } from '@/lib/homeBrowseContext';
import { eventMatchesSearchQuery } from '@/lib/searchText';

/**
 * spotto ホーム
 * デフォルトはリスト（タイムライン）。マップはサブ機能として切替可能。
 * 閲覧状態（カメラ・フィルター・エリア）は HomeBrowseProvider でタブ間も維持。
 * リストの地理範囲はマップの mapRegion と連動する。
 */
export default function SportsAppScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mapRef = useRef<EventsMapRef>(null);
  const { events, now, joinedIds, createEvent, saveEventDraft, eventsLoading, eventsError, clearEventsError, refreshEvents, eventsSaving, pastJoinedEvents, upcomingJoinedEvents, favoriteEvents, favoriteIds } =
    useEvents();
  const requestCreateAccess = useCreateEventAccess();
  const { filterEvents } = useBlocks();
  const {
    view,
    setView,
    mapRegion,
    setMapRegion,
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
    resetToCurrentLocation,
    consumePendingCameraFit,
  } = useHomeBrowse();

  const safeJoinedIds =
    joinedIds instanceof Set ? joinedIds : new Set<string>();
  const safeNow =
    now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();

  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useTimedToast();
  const [sortPickerVisible, setSortPickerVisible] = useState(false);
  const [filterPickerVisible, setFilterPickerVisible] = useState(false);
  /** 一度でもマップを開いたらアンマウントしない（カメラ状態をネイティブ側でも維持） */
  const [mapMounted, setMapMounted] = useState(false);
  const shownEventsErrorRef = useRef<string | null>(null);
  const homeMountedRef = useRef(true);

  useEffect(() => {
    homeMountedRef.current = true;
    return () => {
      homeMountedRef.current = false;
    };
  }, []);

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
  const mapAreaLabel = labelForMapRegion(mapRegion);
  const areaLabel = locating
    ? AREA_LABEL_LOCATING
    : mapMovedByUser && mapAreaLabel
      ? mapAreaLabel
      : area
        ? getAreaLabel(area)
        : mapAreaLabel ?? AREA_LABEL_UNSET;

  useEffect(() => {
    if (view === 'map') setMapMounted(true);
  }, [view]);

  // エリア明示変更時のみカメラを追従（パン位置は維持）
  useEffect(() => {
    const pending = consumePendingCameraFit();
    if (!pending || !homeMountedRef.current) return;
    mapRef.current?.animateToRegion(pending, 500);
  }, [area, consumePendingCameraFit]);

  const handleSelectNearby = useCallback(async () => {
    try {
      const ok = await resetToCurrentLocation();
      if (!homeMountedRef.current) return;
      if (!ok) {
        Alert.alert(
          '現在地を取得できません',
          '位置情報の許可をオンにすると、いまいる場所の周辺イベントを探せます。',
        );
        return;
      }
      setAreaPickerVisible(false);
    } catch {
      if (!homeMountedRef.current) return;
      Alert.alert('現在地を取得できません', '時間をおいて再度お試しください。');
    }
  }, [resetToCurrentLocation, setAreaPickerVisible]);

  const handleSelectPrefecture = useCallback(
    (prefectureId: string) => {
      applyArea({
        mode: 'prefecture',
        prefectureId,
      });
      setAreaPickerVisible(false);
    },
    [applyArea, setAreaPickerVisible],
  );

  const handleResetToLocation = useCallback(() => {
    void (async () => {
      try {
        const ok = await resetToCurrentLocation();
        if (!homeMountedRef.current) return;
        if (!ok) {
          Alert.alert(
            '現在地を取得できません',
            '位置情報の許可をオンにすると、いまいる場所の周辺へ戻れます。',
          );
        }
      } catch {
        if (!homeMountedRef.current) return;
        Alert.alert('現在地を取得できません', '時間をおいて再度お試しください。');
      }
    })();
  }, [resetToCurrentLocation]);

  const mapBrowseCenter = useMemo(
    () => ({
      latitude: mapRegion.latitude,
      longitude: mapRegion.longitude,
    }),
    [mapRegion.latitude, mapRegion.longitude],
  );

  /**
   * リストの地理範囲 = マップの表示リージョン（最後に見ていた範囲）。
   * GPS／エリア選択も applyArea 経由で mapRegion に反映されるため一致する。
   */
  const areaEvents = useMemo(() => {
    const source = Array.isArray(events)
      ? events.filter((event) => event && typeof event.id === 'string' && event.id)
      : [];
    try {
      const inRegion = filterEventsByMapRegion(source, mapRegion);
      const scoped = filterActiveBrowseEvents(inRegion, safeNow);
      return typeof filterEvents === 'function' ? filterEvents(scoped) : scoped;
    } catch {
      try {
        return filterActiveBrowseEvents(source, safeNow);
      } catch {
        return [];
      }
    }
  }, [events, mapRegion, safeNow, filterEvents]);

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
        origin: mapBrowseCenter,
        now: safeNow,
        interest: interestProfile,
        // マップパン中は距離寄りの「現在地付近」扱いではなく中立
        areaMode: mapMovedByUser ? null : area?.mode ?? null,
      });
    } catch {
      return areaEvents;
    }
  }, [
    areaEvents,
    area,
    mapMovedByUser,
    mapBrowseCenter,
    category,
    query,
    sortKey,
    eventFilters,
    interestProfile,
    safeNow,
  ]);

  /**
   * マップ用イベント:
   * - ジャンル / 検索 / 絞り込み条件はリストと同一 state で連動
   * - エリア（nearby / 都道府県）はリスト専用。マップは全国の該当イベントを表示
   */
  const mapEvents = useMemo(() => {
    const source = Array.isArray(events)
      ? events.filter((event) => event && typeof event.id === 'string' && event.id)
      : [];
    try {
      let list = filterActiveBrowseEvents(source, safeNow);
      if (typeof filterEvents === 'function') {
        list = filterEvents(list);
      }
      list = list.filter((e) => {
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
      return filterEventsByBrowse(list, eventFilters);
    } catch {
      return source;
    }
  }, [events, safeNow, filterEvents, category, query, eventFilters]);

  useEffect(() => {
    if (view !== 'map') return;
    if (selectedId && !mapEvents.some((event) => event.id === selectedId)) {
      setSelectedId(null);
    }
  }, [view, mapEvents, selectedId, setSelectedId]);

  // リスト選択の整合のみ。マップは全国ピンなので nearby／カテゴリ対象外でもプレビューを消さない
  useEffect(() => {
    if (view !== 'list') return;
    if (selectedId && !filteredEvents.some((event) => event.id === selectedId)) {
      setSelectedId(null);
    }
  }, [view, filteredEvents, selectedId, setSelectedId]);

  const handleMapRegionChange = useCallback(
    (next: typeof mapRegion) => {
      if (!homeMountedRef.current) return;
      setMapRegion(next);
    },
    [setMapRegion],
  );

  const handleSelectEvent = useCallback(
    (event: SportEvent | null) => {
      setSelectedId(event ? event.id : null);
    },
    [setSelectedId],
  );

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
          areaMode={mapMovedByUser ? null : area?.mode ?? null}
          prefectureLabel={
            mapMovedByUser
              ? mapAreaLabel
              : area?.mode === 'prefecture'
                ? getPrefectureById(area.prefectureId).label
                : null
          }
          onPressSort={() => setSortPickerVisible(true)}
          onPressFilter={() => setFilterPickerVisible(true)}
        />
      </View>
    </View>
  );

  const mapVisible = view === 'map';

  return (
    <View style={styles.root}>
      <BrandGradient
        variant="soft"
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* 一度開いたマップは維持（リストへ戻ってもカメラ・ネイティブ状態を保持） */}
      {mapMounted ? (
        <View
          collapsable={false}
          style={[styles.mapLayer, !mapVisible && styles.mapLayerHidden]}
          pointerEvents={mapVisible ? 'auto' : 'none'}
        >
          <EventsMap
            ref={mapRef}
            events={mapEvents}
            selectedId={selectedId}
            joinedIds={safeJoinedIds}
            onSelectEvent={handleSelectEvent}
            onRegionChangeComplete={handleMapRegionChange}
            region={mapRegion}
            initialRegion={mapRegion}
            showsUserLocation
            userCoordinate={userCoords}
          />
          <View
            style={[styles.mapTop, { paddingTop: topPad }]}
            pointerEvents="box-none"
          >
            <HeaderRoundButton
              onPress={handleResetToLocation}
              accessibilityLabel="現在地へ戻る"
            >
              <SymbolView
                name={{
                  ios: 'location.fill',
                  android: 'my_location',
                  web: 'my_location',
                }}
                tintColor={theme.colors.onPrimary}
                size={20}
              />
            </HeaderRoundButton>
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
  mapLayerHidden: {
    opacity: 0,
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
    gap: 10,
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
