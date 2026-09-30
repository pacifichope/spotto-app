import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardFormScrollView } from '@/components/KeyboardForm';
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
  coordsOrFallback,
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

/** Web: 地図ピンの代替として座標＋名称を手入力 */
export default function LocationPickerModal({
  visible,
  initial,
  onClose,
  onConfirm,
}: LocationPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [latitude, setLatitude] = useState(
    String(initial?.latitude ?? FALLBACK_COORDS.latitude),
  );
  const [longitude, setLongitude] = useState(
    String(initial?.longitude ?? FALLBACK_COORDS.longitude),
  );
  const [label, setLabel] = useState(initial?.label ?? '');
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const fallback = coordsOrFallback({
      latitude: initial?.latitude ?? FALLBACK_COORDS.latitude,
      longitude: initial?.longitude ?? FALLBACK_COORDS.longitude,
    });
    const hasPicked = Boolean(initial?.label?.trim());
    setLatitude(String(fallback.latitude));
    setLongitude(String(fallback.longitude));
    setLabel(initial?.label ?? '');
    setQuery('');
    setPredictions([]);

    let cancelled = false;
    void (async () => {
      if (hasPicked) return;
      const coords = await requestPermissionAndGetCoordinates();
      if (cancelled || !coords) return;
      setLatitude(String(coords.latitude));
      setLongitude(String(coords.longitude));
      const resolved = await reverseGeocodeLabel(coords.latitude, coords.longitude);
      if (cancelled) return;
      setLabel((prev) => prev.trim() || resolved);
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
          const results = await searchPlaces(trimmed, {
            latitude: Number(latitude) || FALLBACK_COORDS.latitude,
            longitude: Number(longitude) || FALLBACK_COORDS.longitude,
          });
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
  }, [query, visible, latitude, longitude]);

  const handleConfirm = () => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const trimmed = label.trim();
    if (!trimmed || looksLikeCoordinateLabel(trimmed)) {
      Alert.alert(
        '場所の名称を入力',
        '施設名・会場名など、場所の名前を入力してください。',
      );
      return;
    }
    onConfirm({
      latitude: lat,
      longitude: lng,
      label: trimmed,
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top || 12 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.cancel}>キャンセル</Text>
          </Pressable>
          <Text style={styles.title}>活動地点</Text>
          <Pressable onPress={handleConfirm} hitSlop={12}>
            <Text style={styles.confirm}>決定</Text>
          </Pressable>
        </View>

        <KeyboardFormScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.body}
          bottomGap={Math.max(insets.bottom, 24)}
        >
          <Text style={styles.note}>
            Web では地図ピンの代わりに座標を指定できます。iOS / Android
            ではマップ上でピン留めできます。
          </Text>

          <Text style={styles.label}>場所を検索</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="施設名・住所で検索"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searching ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : null}
          </View>
          {predictions.length > 0 ? (
            <ScrollView
              style={styles.suggestionList}
              keyboardShouldPersistTaps="handled"
            >
              {predictions.map((item) => (
                <Pressable
                  key={item.placeId}
                  style={styles.suggestionItem}
                  onPress={() => {
                    void (async () => {
                      try {
                        const place = await resolvePlace(item);
                        if (!place) return;
                        setLatitude(String(place.latitude));
                        setLongitude(String(place.longitude));
                        setLabel(place.label);
                        setQuery('');
                        setPredictions([]);
                      } catch {
                        setPredictions([]);
                      }
                    })();
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
          ) : query.trim().length >= 2 && !searching ? (
            <Text style={styles.note}>
              候補が見つかりませんでした。名称と座標を手入力できます。
            </Text>
          ) : null}

          <Text style={styles.label}>場所の名称</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="例: 代々木公園グラウンド"
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>緯度</Text>
          <TextInput
            style={styles.input}
            value={latitude}
            onChangeText={setLatitude}
            keyboardType="decimal-pad"
            autoCapitalize="none"
          />

          <Text style={styles.label}>経度</Text>
          <TextInput
            style={styles.input}
            value={longitude}
            onChangeText={setLongitude}
            keyboardType="decimal-pad"
            autoCapitalize="none"
          />

          <Pressable
            style={styles.myLocationBtn}
            onPress={() => {
              void (async () => {
                const coords = await requestPermissionAndGetCoordinates();
                if (!coords) return;
                setLatitude(String(coords.latitude));
                setLongitude(String(coords.longitude));
                const resolved = await reverseGeocodeLabel(
                  coords.latitude,
                  coords.longitude,
                );
                setLabel(resolved);
              })();
            }}
          >
            <Text style={styles.myLocationText}>現在地を取得</Text>
          </Pressable>

          <Pressable style={styles.doneBtn} onPress={handleConfirm}>
            <Text style={styles.doneText}>この位置に決定</Text>
          </Pressable>
        </KeyboardFormScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  bodyScroll: {
    flex: 1,
  },
  body: {
    padding: 20,
    gap: 8,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  label: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
  },
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  suggestionList: {
    maxHeight: 180,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
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
  myLocationBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  myLocationText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  doneBtn: {
    marginTop: 20,
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
