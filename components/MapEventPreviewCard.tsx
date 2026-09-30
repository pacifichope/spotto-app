import { useEffect } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import BrandGradient from '@/components/BrandGradient';
import { ClockIcon, MapPinIcon } from '@/components/icons';
import { theme } from '@/constants/theme';
import {
  eventPreviewUris,
  formatEventSchedule,
  formatLocationLabel,
  sportFallbackUri,
  type SportEvent,
} from '@/lib/events';
import { eventPriceYen, formatYenAmount, isPaidEvent } from '@/lib/payments';

type MapEventPreviewCardProps = {
  event: SportEvent;
  bottomInset?: number;
  onClose: () => void;
  onOpenDetail: (event: SportEvent) => void;
};

export default function MapEventPreviewCard({
  event,
  bottomInset = 12,
  onClose,
  onOpenDetail,
}: MapEventPreviewCardProps) {
  const translateY = useSharedValue(120);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = 120;
    opacity.value = 0;
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    opacity.value = withTiming(1, { duration: 180 });
  }, [event.id, opacity, translateY]);

  const finishClose = () => {
    onClose();
  };

  const dismiss = () => {
    translateY.value = withTiming(140, { duration: 180 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
    opacity.value = withTiming(0, { duration: 160 });
  };

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-28, 28])
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 72 || e.velocityY > 800) {
        runOnJS(dismiss)();
        return;
      }
      translateY.value = withSpring(0, { damping: 18, stiffness: 240 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const thumb =
    eventPreviewUris(event, 1)[0] ?? sportFallbackUri(event.sport) ?? null;
  let when = '日程未定';
  let where = '場所未設定';
  try {
    when = formatEventSchedule(event).full || when;
    where =
      formatLocationLabel(event.location, event.locationNote) || where;
  } catch {
    when = String(event.time || '').trim() || when;
    where = '場所未設定';
  }
  const priceLabel = isPaidEvent(event)
    ? formatYenAmount(eventPriceYen(event))
    : '無料';
  const title = String(event.title || '').trim() || '無題のイベント';
  const sport = String(event.sport || '').trim() || 'その他';
  const level = String(event.level || '').trim() || '誰でも歓迎';

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 12) }]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, cardStyle]} pointerEvents="auto">
          <View style={styles.handle} />

          <Pressable
            style={styles.closeBtn}
            onPress={dismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="閉じる"
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>

          <Pressable
            style={styles.body}
            onPress={() => onOpenDetail(event)}
            accessibilityRole="button"
            accessibilityLabel={`${title}の詳細を見る`}
          >
            <View style={styles.thumb}>
              {thumb ? (
                Platform.OS === 'web' ? (
                  <img src={thumb} alt="" style={webThumb} />
                ) : (
                  <Image
                    source={{ uri: thumb }}
                    style={styles.thumbImage}
                    resizeMode="cover"
                  />
                )
              ) : (
                <View style={styles.thumbFallback} />
              )}
            </View>

            <View style={styles.info}>
              <Text style={styles.sport} numberOfLines={1}>
                {sport} · {level}
              </Text>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
              <View style={styles.metaRow}>
                <ClockIcon size={13} color={theme.colors.textMuted} />
                <Text style={styles.meta} numberOfLines={1}>
                  {when}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <MapPinIcon size={13} color={theme.colors.textMuted} />
                <Text style={styles.meta} numberOfLines={1}>
                  {where}
                </Text>
              </View>
            </View>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.price}>{priceLabel}</Text>
            <Pressable
              onPress={() => onOpenDetail(event)}
              accessibilityRole="button"
              accessibilityLabel="詳細を見る"
            >
              <BrandGradient style={styles.detailBtn}>
                <Text style={styles.detailBtnText}>詳細を見る</Text>
              </BrandGradient>
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const webThumb = {
  width: '100%',
  height: '100%',
  objectFit: 'cover' as const,
  display: 'block' as const,
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    zIndex: 40,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xxl,
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    zIndex: 2,
  },
  closeText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  body: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingRight: 22,
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceAlt,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    flex: 1,
    backgroundColor: theme.colors.primarySoft,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  sport: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primaryDark,
    letterSpacing: -0.1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  meta: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  footer: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  price: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  detailBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
  },
  detailBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.onPrimary,
  },
});
