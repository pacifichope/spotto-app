import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import MapView, {
  PROVIDER_GOOGLE,
  type MapPressEvent,
  type Region,
} from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLocationPin } from '@/components/EventMapPin';
import { useKeyboardBottomInset } from '@/components/KeyboardForm';
import SafeMapView from '@/components/SafeMapView';
import { theme } from '@/constants/theme';
import {
  looksLikeCoordinateLabel,
  resolvePlace,
  reverseGeocodeLabel,
  searchPlaces,
  type PlacePrediction,
} from '@/lib/googlePlaces';
import {
  FALLBACK_COORDS,
  FALLBACK_REGION,
  coordsOrFallback,
  regionFromCoords,
  requestPermissionAndGetCoordinates,
} from '@/lib/userLocation';

export type PickedLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

type LocationPickerModalProps = {
  visible: boolean;
  initial?: Partial<PickedLocation> | null;
  onClose: () => void;
  onConfirm: (picked: PickedLocation) => void;
};

const isExpoGo = Constants.appOwnership === 'expo';
const DEFAULT_DELTA = { latitudeDelta: 0.014, longitudeDelta: 0.014 };
const SEARCH_DELTA = { latitudeDelta: 0.008, longitudeDelta: 0.008 };

export default function LocationPickerModal({
  visible,
  initial,
  onClose,
  onConfirm,
}: LocationPickerModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const searchSeq = useRef(0);
  const skipRegionSync = useRef(false);
  const coordinateRef = useRef({
    latitude: initial?.latitude ?? FALLBACK_COORDS.latitude,
    longitude: initial?.longitude ?? FALLBACK_COORDS.longitude,
  });
  const [coordinate, setCoordinate] = useState({
    latitude: initial?.latitude ?? FALLBACK_COORDS.latitude,
    longitude: initial?.longitude ?? FALLBACK_COORDS.longitude,
  });
  const [label, setLabel] = useState(initial?.label ?? '');
  const [resolving, setResolving] = useState(false);
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapReadyToMount, setMapReadyToMount] = useState(false);
  const [initialRegion, setInitialRegion] = useState<Region>({
    ...FALLBACK_REGION,
    ...DEFAULT_DELTA,
  });
  // 画面全体の絶対配置オーバーレイは adjustResize の対象外になりやすい。
  // Android も含めキーボード高さ分だけ bottom を押し上げる。
  const keyboardHeight = useKeyboardBottomInset(visible, {
    forceKeyboardHeight: true,
  });

  const moveMapTo = (
    latitude: number,
    longitude: number,
    deltas = DEFAULT_DELTA,
  ) => {
    skipRegionSync.current = true;
    mapRef.current?.animateToRegion({ latitude, longitude, ...deltas }, 400);
  };

  const applyCoordinate = async (
    latitude: number,
    longitude: number,
    nextLabel?: string,
  ) => {
    setCoordinate({ latitude, longitude });
    coordinateRef.current = { latitude, longitude };
    if (nextLabel?.trim()) {
      setLabel(nextLabel.trim());
      return;
    }
    setResolving(true);
    try {
      const resolved = await reverseGeocodeLabel(latitude, longitude);
      setLabel(resolved);
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    if (!visible) {
      setMapReadyToMount(false);
      return;
    }
    setQuery('');
    setPredictions([]);

    const fallback = coordsOrFallback({
      latitude: initial?.latitude ?? FALLBACK_COORDS.latitude,
      longitude: initial?.longitude ?? FALLBACK_COORDS.longitude,
    });
    const hasPicked = Boolean(initial?.label?.trim());
    setCoordinate(fallback);
    coordinateRef.current = fallback;
    setInitialRegion(
      regionFromCoords(
        fallback,
        DEFAULT_DELTA.latitudeDelta,
        DEFAULT_DELTA.longitudeDelta,
      ),
    );
    setLabel(initial?.label ?? '');
    setMapReadyToMount(true);

    let cancelled = false;
    void (async () => {
      let next = fallback;
      if (!hasPicked) {
        const coords = await requestPermissionAndGetCoordinates();
        if (coords) next = coords;
      }
      if (cancelled) return;

      setCoordinate(next);
      coordinateRef.current = next;
      moveMapTo(next.latitude, next.longitude);
      setResolving(true);
      try {
        const resolved = await reverseGeocodeLabel(next.latitude, next.longitude);
        if (cancelled) return;
        setLabel((prev) => prev.trim() || resolved);
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, initial?.latitude, initial?.longitude, initial?.label]);

  useEffect(() => {
    if (!visible) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setPredictions([]);
      setSearching(false);
      return;
    }

    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const results = await searchPlaces(trimmed, coordinate);
          if (searchSeq.current !== seq) return;
          setPredictions(results);
        } catch {
          if (searchSeq.current !== seq) return;
          setPredictions([]);
        } finally {
          if (searchSeq.current === seq) setSearching(false);
        }
      })();
    }, 280);

    return () => clearTimeout(timer);
    // ピン移動で検索をやり直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, visible]);

  const handleMapPress = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    Keyboard.dismiss();
    setPredictions([]);
    skipRegionSync.current = true;
    moveMapTo(latitude, longitude);
    void applyCoordinate(latitude, longitude);
  };

  const handleSelectPrediction = async (prediction: PlacePrediction) => {
    Keyboard.dismiss();
    setPredictions([]);
    setQuery('');
    try {
      const place = await resolvePlace(prediction);
      if (!place) return;
      moveMapTo(place.latitude, place.longitude, SEARCH_DELTA);
      await applyCoordinate(place.latitude, place.longitude, place.label);
    } catch {
      // 検索結果の解決に失敗しても地図操作は継続できる
    }
  };

  const goToMyLocation = async () => {
    const coords = await requestPermissionAndGetCoordinates();
    if (!coords) return;
    moveMapTo(coords.latitude, coords.longitude);
    await applyCoordinate(coords.latitude, coords.longitude);
  };

  const handleConfirm = () => {
    const trimmed = label.trim();
    if (!trimmed || looksLikeCoordinateLabel(trimmed)) {
      Alert.alert(
        t('create.location.nameRequiredTitle'),
        t('create.location.nameRequiredBody'),
      );
      return;
    }
    onConfirm({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      label: trimmed,
    });
  };

  if (!visible) return null;

  return (
    <View style={styles.screen} pointerEvents="auto">
      <View collapsable={false} style={styles.mapHost} pointerEvents="auto">
        {mapReadyToMount ? (
          <SafeMapView
            ref={mapRef}
            style={styles.map}
            pointerEvents="auto"
            provider={isExpoGo ? undefined : PROVIDER_GOOGLE}
            initialRegion={initialRegion}
            onRegionChangeComplete={(next: Region) => {
              if (skipRegionSync.current) {
                skipRegionSync.current = false;
                return;
              }
              void applyCoordinate(next.latitude, next.longitude);
            }}
            onMapReady={() => {
              const current = coordinateRef.current;
              moveMapTo(current.latitude, current.longitude);
            }}
            onPress={handleMapPress}
            scrollEnabled={true}
            zoomEnabled={true}
            zoomTapEnabled={true}
            zoomControlEnabled={Platform.OS === 'android'}
            pitchEnabled={true}
            rotateEnabled={true}
            showsCompass={false}
            toolbarEnabled={false}
            moveOnMarkerPress={false}
          />
        ) : null}
        <View style={styles.centerPin} pointerEvents="none">
          <BrandLocationPin selected gradientId="location-picker-pin" />
        </View>
      </View>

      <View style={styles.topOverlay} pointerEvents="box-none">
        <View
          style={[styles.topChrome, { paddingTop: insets.top || 8 }]}
          pointerEvents="auto"
        >
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.cancel}>{t('common.cancel')}</Text>
            </Pressable>
            <Text style={styles.title}>{t('create.location.titleMap')}</Text>
            <Pressable onPress={handleConfirm} hitSlop={12}>
              <Text style={styles.confirm}>{t('common.confirm')}</Text>
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={t('create.location.searchPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searching ? (
              <ActivityIndicator
                style={styles.searchSpinner}
                color={theme.colors.primary}
              />
            ) : null}
          </View>

          {predictions.length > 0 ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.suggestionList}
              contentContainerStyle={styles.suggestionContent}
            >
              {predictions.map((item) => (
                <Pressable
                  key={item.placeId}
                  style={styles.suggestionItem}
                  onPress={() => {
                    void handleSelectPrediction(item);
                  }}
                >
                  <Text style={styles.suggestionMain} numberOfLines={1}>
                    {item.mainText}
                  </Text>
                  <Text style={styles.suggestionSub} numberOfLines={1}>
                    {item.description}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.hint} pointerEvents="none">
              {query.trim().length >= 2 && !searching
                ? t('create.location.noResultsMap')
                : t('create.location.mapHint')}
            </Text>
          )}
        </View>
      </View>

      <View
        style={[styles.bottomOverlay, { bottom: keyboardHeight }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={styles.myLocationBtn}
          pointerEvents="auto"
          onPress={() => void goToMyLocation()}
        >
          <Text style={styles.myLocationText}>{t('create.location.myLocation')}</Text>
        </Pressable>
        <View
          style={[
            styles.footer,
            {
              paddingBottom:
                keyboardHeight > 0 ? 12 : Math.max(insets.bottom, 16),
            },
          ]}
          pointerEvents="auto"
        >
          <Text style={styles.footerLabel}>{t('create.location.nameLabel')}</Text>
          <View style={styles.labelRow}>
            <TextInput
              style={styles.labelInput}
              value={label}
              onChangeText={setLabel}
              placeholder={t('create.location.namePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
            />
            {resolving ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : null}
          </View>
          <Pressable style={styles.doneBtn} onPress={handleConfirm}>
            <Text style={styles.doneText}>{t('create.location.confirm')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    elevation: 100,
    backgroundColor: theme.colors.surface,
  },
  mapHost: {
    flex: 1,
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  topChrome: {
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  cancel: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  confirm: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  searchWrap: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    position: 'relative',
  },
  searchInput: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 40,
    fontSize: 15,
    color: theme.colors.text,
  },
  searchSpinner: {
    position: 'absolute',
    right: 12,
    top: 14,
  },
  suggestionList: {
    maxHeight: 200,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  suggestionContent: {
    paddingVertical: 4,
  },
  suggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  suggestionMain: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  suggestionSub: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  hint: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  centerPin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -24,
    marginTop: -58,
  },
  myLocationBtn: {
    alignSelf: 'flex-end',
    marginRight: 12,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  myLocationText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 10,
  },
  footerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  labelInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
  },
  coords: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  doneBtn: {
    marginTop: 6,
    backgroundColor: theme.colors.text,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: {
    color: theme.colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
