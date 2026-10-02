import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BrandGradient from '@/components/BrandGradient';
import { MapPinIcon } from '@/components/icons';
import { theme } from '@/constants/theme';
import {
  formatEventSchedule,
  formatLocationLabel,
  type SportEvent,
} from '@/lib/events';
import { localizedEventTitle } from '@/lib/eventLocalizedText';

type JoinSuccessScreenProps = {
  visible: boolean;
  event: SportEvent | null;
  onClose: () => void;
  /** イベント詳細へ戻る（完了画面を閉じる） */
  onViewEvent?: () => void;
  /** 参加チケット画面へ */
  onViewTicket?: () => void;
  onOpenGroupChat?: () => void;
  onGoHome?: () => void;
};

const CONFETTI_COLORS = [
  '#FF6B35',
  '#29D1E8',
  '#FBBF24',
  '#F472B6',
  '#34D399',
  '#A78BFA',
  '#FB7185',
];

type Particle = {
  id: number;
  x: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  rotate: number;
  drift: number;
};

function ConfettiPiece({
  particle,
  height,
  active,
}: {
  particle: Particle;
  height: number;
  active: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      particle.delay,
      withTiming(1, {
        duration: particle.duration,
        easing: Easing.out(Easing.quad),
      }),
    );
  }, [active, particle.delay, particle.duration, progress]);

  const style = useAnimatedStyle(() => {
    const y = interpolate(progress.value, [0, 1], [-40, height + 40]);
    const x =
      particle.x +
      Math.sin(progress.value * Math.PI * 2) * particle.drift;
    const opacity = interpolate(
      progress.value,
      [0, 0.12, 0.85, 1],
      [0, 1, 1, 0],
    );
    const rotate = `${particle.rotate + progress.value * 360}deg`;
    return {
      opacity,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confetti,
        {
          width: particle.size,
          height: particle.size * 0.45,
          backgroundColor: particle.color,
          borderRadius: 2,
        },
        style,
      ]}
    />
  );
}

function SuccessCheck({ active }: { active: boolean }) {
  const scale = useSharedValue(0.4);
  const ring = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!active) {
      scale.value = 0.4;
      ring.value = 0;
      pulse.value = 1;
      return;
    }
    scale.value = withDelay(
      80,
      withSpring(1, { damping: 12, stiffness: 160, mass: 0.7 }),
    );
    ring.value = withDelay(
      120,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
    );
    pulse.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1.06, { duration: 700 }),
          withTiming(1, { duration: 700 }),
        ),
        -1,
        true,
      ),
    );
  }, [active, pulse, ring, scale]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulse.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 1], [0.55, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.85, 1.55]) }],
  }));

  return (
    <View style={styles.checkWrap}>
      <Animated.View style={[styles.checkRing, ringStyle]} />
      <Animated.View style={[styles.checkBadge, badgeStyle]}>
        <Text style={styles.checkMark}>✓</Text>
      </Animated.View>
    </View>
  );
}

export default function JoinSuccessScreen({
  visible,
  event,
  onClose,
  onViewEvent,
  onViewTicket,
  onOpenGroupChat,
  onGoHome,
}: JoinSuccessScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const handleViewTicket = onViewTicket ?? onViewEvent ?? onClose;
  const handleViewEvent = onViewEvent ?? onClose;

  const backdrop = useSharedValue(0);
  const titlePop = useSharedValue(0);
  const cardY = useSharedValue(28);
  const cardOpacity = useSharedValue(0);
  const actionsOpacity = useSharedValue(0);

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: 28 }, (_, id) => ({
      id,
      x: (width * ((id * 37) % 100)) / 100 - 8,
      delay: 40 + (id % 8) * 55,
      duration: 2200 + (id % 5) * 280,
      size: 8 + (id % 4) * 2,
      color: CONFETTI_COLORS[id % CONFETTI_COLORS.length]!,
      rotate: (id * 47) % 180,
      drift: 18 + (id % 6) * 6,
    }));
  }, [width]);

  useEffect(() => {
    if (!visible) {
      backdrop.value = 0;
      titlePop.value = 0;
      cardY.value = 28;
      cardOpacity.value = 0;
      actionsOpacity.value = 0;
      return;
    }
    backdrop.value = withTiming(1, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
    titlePop.value = withDelay(
      180,
      withSpring(1, { damping: 14, stiffness: 170, mass: 0.75 }),
    );
    cardOpacity.value = withDelay(
      320,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }),
    );
    cardY.value = withDelay(
      320,
      withSpring(0, { damping: 18, stiffness: 160, mass: 0.85 }),
    );
    actionsOpacity.value = withDelay(
      480,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
    );
  }, [
    visible,
    backdrop,
    titlePop,
    cardY,
    cardOpacity,
    actionsOpacity,
  ]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titlePop.value,
    transform: [
      { scale: interpolate(titlePop.value, [0, 1], [0.86, 1]) },
      { translateY: interpolate(titlePop.value, [0, 1], [14, 0]) },
    ],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }],
  }));

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actionsOpacity.value,
  }));

  const schedule = event
    ? formatEventSchedule(event)
    : null;
  const location = event
    ? formatLocationLabel(event.location, event.locationNote)
    : '';

  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <BrandGradient
            variant="soft"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </Animated.View>

        {visible
          ? particles.map((particle) => (
              <ConfettiPiece
                key={particle.id}
                particle={particle}
                height={height}
                active={visible}
              />
            ))
          : null}

        <View
          style={[
            styles.shell,
            {
              paddingTop: Math.max(insets.top, 16) + 12,
              paddingBottom: Math.max(insets.bottom, 12) + 12,
            },
          ]}
        >
          <View style={styles.hero}>
            <SuccessCheck active={visible} />

            <Animated.View style={[styles.copy, titleStyle]}>
              <Text style={styles.eyebrow}>Registration Confirmed!</Text>
              <Text style={styles.title} accessibilityRole="header">
                {t('join.success.title')}
              </Text>
              <Text style={styles.subtitle}>
                {t('join.success.subtitle')}
              </Text>
            </Animated.View>

            {event ? (
              <Animated.View style={[styles.eventCard, cardStyle]}>
                <Text style={styles.eventTitle} numberOfLines={2}>
                  {localizedEventTitle(event)}
                </Text>
                {schedule ? (
                  <Text style={styles.eventMeta} numberOfLines={2}>
                    {schedule.full}
                  </Text>
                ) : null}
                {location ? (
                  <View style={styles.locationRow}>
                    <MapPinIcon size={14} color={theme.colors.primaryDark} />
                    <Text style={styles.eventLocation} numberOfLines={2}>
                      {location}
                    </Text>
                  </View>
                ) : null}
              </Animated.View>
            ) : null}
          </View>

          <Animated.View style={[styles.actions, actionsStyle]}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtnWrap,
                pressed && styles.pressed,
              ]}
              onPress={handleViewTicket}
              accessibilityRole="button"
              accessibilityLabel={t('join.success.viewTicket')}
            >
              <BrandGradient style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{t('join.success.viewTicket')}</Text>
              </BrandGradient>
            </Pressable>

            {onViewEvent ? (
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.pressed,
                ]}
                onPress={handleViewEvent}
                accessibilityRole="button"
                accessibilityLabel={t('join.success.viewEvent')}
              >
                <Text style={styles.secondaryBtnText}>{t('join.success.viewEvent')}</Text>
              </Pressable>
            ) : null}

            {onOpenGroupChat ? (
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.pressed,
                ]}
                onPress={onOpenGroupChat}
                accessibilityRole="button"
                accessibilityLabel={t('join.success.openGroupChat')}
              >
                <Text style={styles.secondaryBtnText}>
                  {t('join.success.openGroupChat')}
                </Text>
              </Pressable>
            ) : null}

            {onGoHome ? (
              <Pressable
                style={({ pressed }) => [
                  styles.ghostBtn,
                  pressed && styles.pressed,
                ]}
                onPress={onGoHome}
                accessibilityRole="button"
                accessibilityLabel={t('common.backToHome')}
              >
                <Text style={styles.ghostBtnText}>{t('common.backToHome')}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.ghostBtn,
                  pressed && styles.pressed,
                ]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Text style={styles.ghostBtnText}>{t('common.close')}</Text>
              </Pressable>
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.homeGradientMid,
    overflow: 'hidden',
  },
  confetti: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
  },
  shell: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: 'space-between',
    zIndex: 3,
  },
  hero: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 8,
  },
  checkWrap: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: 54,
    borderWidth: 3,
    borderColor: theme.colors.primary,
  },
  checkBadge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primaryDark,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  checkMark: {
    color: '#FFF',
    fontSize: 42,
    fontWeight: '800',
    marginTop: -2,
  },
  copy: {
    alignItems: 'center',
    paddingHorizontal: 8,
    maxWidth: 360,
    gap: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: theme.colors.primaryDark,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  eventCard: {
    width: '100%',
    maxWidth: 400,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 107, 53, 0.18)',
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  eventTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  eventMeta: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 2,
  },
  eventLocation: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: theme.colors.primaryDark,
  },
  actions: {
    gap: 10,
    paddingTop: 8,
  },
  primaryBtnWrap: {
    borderRadius: theme.radius.xl,
    shadowColor: theme.colors.accentDark,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryBtn: {
    minHeight: 54,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: theme.colors.onPrimary,
  },
  secondaryBtn: {
    minHeight: 52,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  ghostBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ghostBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
});
