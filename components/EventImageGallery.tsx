import AppModal from '@/components/AppModal';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CoverPhoto from '@/components/CoverPhoto';
import { theme } from '@/constants/theme';
import { sportFallbackUri } from '@/lib/events';
import { resolveDisplayImageUrl } from '@/lib/storage';

const AUTO_INTERVAL_MS = 3500;
/** スクロール前のヘッダー高さ */
export const EVENT_HEADER_EXPANDED = 300;
/** スクロール時の最小高さ */
export const EVENT_HEADER_COLLAPSED = 120;
/** このスクロール量で最小高さに到達 */
export const EVENT_HEADER_COLLAPSE_RANGE = 180;
const KEN_BURNS_SCALE = 1.08;
const KEN_BURNS_MS = 9000;

const TOP_SHADE = 'rgba(0,0,0,0.38)';
const BOTTOM_SHADE = 'rgba(0,0,0,0.22)';

type EventImageGalleryProps = {
  uris: string[];
  fallbackUri?: string;
  sport?: string;
  /** オーバーレイ（戻る・主催・メニュー等）。pointerEvents は呼び出し側で制御 */
  children?: ReactNode;
  onIndexChange?: (index: number) => void;
  /** 親 ScrollView の scrollY（ヘッダー縮小用） */
  scrollY?: SharedValue<number>;
  expandedHeight?: number;
  collapsedHeight?: number;
  collapseRange?: number;
  onFullscreenChange?: (fullscreen: boolean) => void;
};

function Dots({
  count,
  index,
  accent = '#FFFFFF',
}: {
  count: number;
  index: number;
  accent?: string;
}) {
  if (count <= 1) return null;
  return (
    <View
      style={styles.dots}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === index && [styles.dotActive, { backgroundColor: accent }],
          ]}
        />
      ))}
    </View>
  );
}

function KenBurnsPhoto({
  uri,
  fallbackUri,
  sport,
  active,
  scrollY,
  collapseRange,
}: {
  uri: string;
  fallbackUri?: string;
  sport?: string;
  active: boolean;
  scrollY?: SharedValue<number>;
  collapseRange: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, {
        duration: KEN_BURNS_MS,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(progress);
    };
  }, [active, progress]);

  const zoomStyle = useAnimatedStyle(() => {
    const ken = 1 + progress.value * (KEN_BURNS_SCALE - 1);
    const y = scrollY?.value ?? 0;
    // 縮小中は少し寄り気味にして切れ目を出さない
    const collapseBoost = interpolate(
      y,
      [0, collapseRange],
      [1, 1.1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ scale: ken * collapseBoost }],
    };
  });

  return (
    <Animated.View style={[styles.kenBurnsWrap, zoomStyle]}>
      <CoverPhoto
        uri={uri}
        fallbackUri={fallbackUri}
        sport={sport}
        style={styles.bannerImage}
      />
    </Animated.View>
  );
}

type FullscreenProps = {
  visible: boolean;
  uris: string[];
  initialIndex: number;
  sport?: string;
  fallbackUri?: string;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
};

function EventImageFullscreen({
  visible,
  uris,
  initialIndex,
  sport,
  fallbackUri,
  onClose,
  onIndexChange,
}: FullscreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    setIndex(initialIndex);
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: initialIndex * width,
        animated: false,
      });
    }, 16);
    return () => clearTimeout(timer);
  }, [visible, initialIndex, width]);

  const syncIndex = (offsetX: number) => {
    if (width <= 0 || uris.length <= 1) return;
    const next = Math.round(offsetX / width);
    const clamped = Math.max(0, Math.min(uris.length - 1, next));
    setIndex((current) => {
      if (current === clamped) return current;
      onIndexChange?.(clamped);
      return clamped;
    });
  };

  if (!visible) return null;

  return (
    <AppModal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.fullscreenRoot}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('gallery.backToDetail')}
        />
        <View
          style={[styles.fullscreenChrome, { paddingTop: Math.max(insets.top, 8) }]}
          pointerEvents="none"
        >
          <Text style={styles.fullscreenCounter}>
            {index + 1} / {uris.length}
          </Text>
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            syncIndex(e.nativeEvent.contentOffset.x)
          }
          scrollEventThrottle={16}
          style={styles.fullscreenPager}
        >
          {uris.map((uri, i) => (
            <Pressable
              key={`${uri}-${i}`}
              onPress={onClose}
              style={{ width, height: '100%' }}
              accessibilityRole="imagebutton"
              accessibilityLabel={t('gallery.tapToBack')}
            >
              <CoverPhoto
                uri={uri}
                fallbackUri={fallbackUri}
                sport={sport}
                style={styles.fullscreenImage}
              />
            </Pressable>
          ))}
        </ScrollView>
        <View
          style={[
            styles.fullscreenDotsWrap,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
          pointerEvents="none"
        >
          <Dots count={uris.length} index={index} accent={theme.colors.primary} />
        </View>
      </View>
    </AppModal>
  );
}

export default function EventImageGallery({
  uris,
  fallbackUri,
  sport,
  children,
  onIndexChange,
  scrollY,
  expandedHeight = EVENT_HEADER_EXPANDED,
  collapsedHeight = EVENT_HEADER_COLLAPSED,
  collapseRange = EVENT_HEADER_COLLAPSE_RANGE,
  onFullscreenChange,
}: EventImageGalleryProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [autoPlayKey, setAutoPlayKey] = useState(0);
  const [paused, setPaused] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const widthRef = useRef(0);
  const userTouchingRef = useRef(false);

  const safeUris = useMemo(() => {
    const collected: string[] = [];
    for (const raw of [...uris, fallbackUri]) {
      const display = resolveDisplayImageUrl(raw);
      if (!display || collected.includes(display)) continue;
      collected.push(display);
    }
    if (collected.length === 0) {
      collected.push(sportFallbackUri(sport));
    }
    return collected;
  }, [uris, fallbackUri, sport]);

  const urisKey = useMemo(() => safeUris.join('\0'), [safeUris]);

  useEffect(() => {
    indexRef.current = 0;
    setIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [urisKey]);

  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  useEffect(() => {
    onFullscreenChange?.(fullscreen);
  }, [fullscreen, onFullscreenChange]);

  const resetAutoPlay = useCallback(() => {
    setAutoPlayKey((k) => k + 1);
  }, []);

  const goToIndex = useCallback(
    (next: number, animated: boolean) => {
      const w = widthRef.current;
      if (w <= 0 || safeUris.length <= 1) return;
      const clamped =
        ((next % safeUris.length) + safeUris.length) % safeUris.length;
      indexRef.current = clamped;
      setIndex(clamped);
      scrollRef.current?.scrollTo({ x: clamped * w, animated });
    },
    [safeUris.length],
  );

  useEffect(() => {
    if (
      safeUris.length <= 1 ||
      width <= 0 ||
      paused ||
      fullscreen ||
      userTouchingRef.current
    ) {
      return;
    }
    const timer = setInterval(() => {
      if (userTouchingRef.current) return;
      goToIndex(indexRef.current + 1, true);
    }, AUTO_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [
    safeUris.length,
    width,
    paused,
    fullscreen,
    autoPlayKey,
    goToIndex,
  ]);

  const syncFromScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const w = widthRef.current;
    if (w <= 0 || safeUris.length <= 1) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / w);
    const clamped = Math.max(0, Math.min(safeUris.length - 1, next));
    if (clamped !== indexRef.current) {
      indexRef.current = clamped;
      setIndex(clamped);
    }
  };

  const openFullscreen = () => {
    setPaused(true);
    setFullscreen(true);
  };

  const closeFullscreen = () => {
    setFullscreen(false);
    setPaused(false);
    resetAutoPlay();
  };

  const wrapStyle = useAnimatedStyle(() => {
    if (!scrollY) {
      return { height: expandedHeight };
    }
    const h = interpolate(
      scrollY.value,
      [0, collapseRange],
      [expandedHeight, collapsedHeight],
      Extrapolation.CLAMP,
    );
    return { height: h };
  });

  if (safeUris.length === 0) {
    return <View style={[styles.bannerWrap, { height: expandedHeight }]} />;
  }

  const pageH = expandedHeight;

  return (
    <>
      <Animated.View
        style={[styles.bannerWrap, wrapStyle]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width || windowWidth;
          if (w > 0 && w !== widthRef.current) {
            widthRef.current = w;
            setWidth(w);
          }
        }}
      >
        {width > 0 ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={() => {
              userTouchingRef.current = true;
              setPaused(true);
            }}
            onScrollEndDrag={syncFromScroll}
            onMomentumScrollEnd={(e) => {
              syncFromScroll(e);
              userTouchingRef.current = false;
              setPaused(false);
              resetAutoPlay();
            }}
            scrollEventThrottle={16}
            decelerationRate="fast"
            style={StyleSheet.absoluteFill}
          >
            {safeUris.map((uri, i) => (
              <Pressable
                key={`${uri}-${i}`}
                onPress={openFullscreen}
                accessibilityRole="imagebutton"
                accessibilityLabel={t('gallery.photoFullscreen', { n: i + 1 })}
                style={{ width, height: pageH }}
              >
                <KenBurnsPhoto
                  uri={uri}
                  fallbackUri={fallbackUri}
                  sport={sport}
                  active={i === index && !fullscreen && !paused}
                  scrollY={scrollY}
                  collapseRange={collapseRange}
                />
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Pressable
            onPress={openFullscreen}
            style={StyleSheet.absoluteFill}
            accessibilityRole="imagebutton"
            accessibilityLabel={t('gallery.photoFullscreenSimple')}
          >
            <CoverPhoto
              uri={safeUris[0]}
              fallbackUri={fallbackUri}
              sport={sport}
              style={styles.bannerImage}
            />
          </Pressable>
        )}

        <View style={styles.bannerTopShade} pointerEvents="none" />
        <View style={styles.bannerBottomShade} pointerEvents="none" />
        <Dots
          count={safeUris.length}
          index={index}
          accent={theme.colors.primary}
        />

        <View style={styles.overlaySlot} pointerEvents="box-none">
          {children}
        </View>
      </Animated.View>

      <EventImageFullscreen
        visible={fullscreen}
        uris={safeUris}
        initialIndex={index}
        sport={sport}
        fallbackUri={fallbackUri}
        onClose={closeFullscreen}
        onIndexChange={(next) => {
          indexRef.current = next;
          setIndex(next);
          const w = widthRef.current;
          if (w > 0) {
            scrollRef.current?.scrollTo({ x: next * w, animated: false });
          }
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    position: 'relative',
    width: '100%',
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  kenBurnsWrap: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerTopShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: TOP_SHADE,
    zIndex: 1,
  },
  bannerBottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    backgroundColor: BOTTOM_SHADE,
    zIndex: 1,
  },
  overlaySlot: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    zIndex: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  fullscreenRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  fullscreenCounter: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '700',
  },
  fullscreenPager: {
    flex: 1,
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  fullscreenDotsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
