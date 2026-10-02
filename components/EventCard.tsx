import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MapPinIcon, SportIcon } from '@/components/icons';
import { categoryColor, theme } from '@/constants/theme';
import {
  eventSpotsLeft,
  formatEventSchedule,
  formatLocationLabel,
  isEventCancelled,
  isEventPast,
  levelLabel,
  sportLabel,
  type SportEvent,
} from '@/lib/events';
import { localizedEventTitle } from '@/lib/eventLocalizedText';

type EventCardProps = {
  event: SportEvent;
  variant?: 'sheet' | 'list';
  selected?: boolean;
  onPress?: (event: SportEvent) => void;
  onClose?: () => void;
  onJoin?: (event: SportEvent) => void;
};

export default function EventCard({
  event,
  variant = 'sheet',
  selected = false,
  onPress,
  onClose,
  onJoin,
}: EventCardProps) {
  const { t } = useTranslation();
  if (!event?.id) return null;
  const ended = isEventPast(event);
  const cancelled = isEventCancelled(event);
  const closed = ended || cancelled;
  const sportTint = categoryColor(event.sport);
  const title =
    localizedEventTitle(event).trim() || t('events.untitled');
  const sport = String(event.sport || '').trim() || 'その他';
  const sportText = sportLabel(sport);
  const levelText = levelLabel(event.level);
  let scheduleFull = '';
  let locationLabel = '';
  try {
    scheduleFull = formatEventSchedule(event).full;
    locationLabel =
      formatLocationLabel(event.location, event.locationNote) || t('events.locationUnset');
  } catch {
    scheduleFull = String(event.time || '').trim() || t('events.scheduleUndecided');
    locationLabel = t('events.locationUnset');
  }
  const spotsLeft = eventSpotsLeft({
    capacity: Math.max(1, Math.floor(Number(event.capacity) || 1)),
    joinedCount: Math.max(0, Math.floor(Number(event.joinedCount) || 0)),
  });

  if (variant === 'list') {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.listCard,
          selected && styles.listCardSelected,
          pressed && styles.pressed,
        ]}
        onPress={() => onPress?.(event)}
      >
        <View style={[styles.listEmoji, { backgroundColor: `${sportTint}18` }]}>
          <SportIcon sport={sport} size={24} />
        </View>

        <View style={styles.listBody}>
          <View style={styles.listTopRow}>
            <View style={[styles.sportChip, { backgroundColor: `${sportTint}14` }]}>
              <Text style={[styles.sportChipText, { color: sportTint }]}>
                {sportText}
              </Text>
            </View>
            <View style={styles.levelChip}>
              <Text style={styles.levelChipText}>{levelText}</Text>
            </View>
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            <MapPinIcon size={12} color={theme.colors.textMuted} />
            <Text style={styles.meta} numberOfLines={1}>
              {locationLabel}
            </Text>
          </View>
          <Text style={styles.metaSchedule} numberOfLines={1}>
            {scheduleFull}
          </Text>
          <View style={styles.listFooter}>
            <Text style={[styles.spots, closed && styles.spotsMuted]}>
              {cancelled
                ? t('events.lifecycle.cancelled')
                : ended
                  ? t('events.lifecycle.ended')
                  : t('events.spotsLeft', { count: spotsLeft })}
            </Text>
            {onJoin && (
              <Pressable
                style={({ pressed }) => [
                  styles.joinBtn,
                  closed && styles.joinBtnEnded,
                  pressed && !closed && styles.joinPressed,
                ]}
                onPress={() => {
                  if (!closed) onJoin(event);
                }}
                disabled={closed}
                accessibilityState={{ disabled: closed }}
              >
                <Text style={[styles.joinText, closed && styles.joinTextEnded]}>
                  {cancelled
                    ? t('events.lifecycle.cancelled')
                    : ended
                      ? t('events.lifecycle.ended')
                      : t('events.joinAction')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.sheetCard}>
      <View style={[styles.sheetEmoji, { backgroundColor: `${sportTint}18` }]}>
        <SportIcon sport={sport} size={22} />
      </View>

      <View style={styles.sheetBody}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.metaSchedule} numberOfLines={1}>
          {sportText} · {levelText}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {scheduleFull} · {locationLabel}
        </Text>
        <Text style={styles.spots}>
          {t('events.spotsLeft', { count: spotsLeft })}
        </Text>
      </View>

      <View style={styles.sheetActions}>
        {onClose && (
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        )}
        {onJoin && (
          <Pressable
            style={({ pressed }) => [
              styles.joinBtn,
              closed && styles.joinBtnEnded,
              pressed && !closed && styles.joinPressed,
            ]}
            onPress={() => {
              if (!closed) onJoin(event);
            }}
            disabled={closed}
            accessibilityState={{ disabled: closed }}
          >
            <Text style={[styles.joinText, closed && styles.joinTextEnded]}>
              {cancelled
                    ? t('events.lifecycle.cancelled')
                    : ended
                      ? t('events.lifecycle.ended')
                      : t('events.joinAction')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.94,
  },
  listCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17, 24, 39, 0.08)',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  listCardSelected: {
    borderColor: theme.colors.primaryDark,
    backgroundColor: theme.colors.primaryMuted,
  },
  listEmoji: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBody: {
    flex: 1,
    minWidth: 0,
  },
  listTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sportChip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sportChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  levelChip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.colors.surfaceAlt,
  },
  levelChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  listFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17, 24, 39, 0.08)',
  },
  sheetEmoji: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: {
    flex: 1,
    minWidth: 0,
  },
  sheetActions: {
    alignItems: 'flex-end',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: -0.25,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  metaSchedule: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textMuted,
    marginTop: 3,
  },
  spots: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  spotsMuted: {
    color: theme.colors.textMuted,
  },
  closeBtn: {
    paddingHorizontal: 4,
  },
  closeText: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  joinBtn: {
    backgroundColor: theme.colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  joinPressed: {
    opacity: 0.88,
  },
  joinText: {
    color: theme.colors.onPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  joinBtnEnded: {
    backgroundColor: '#EEF0F3',
  },
  joinTextEnded: {
    color: theme.colors.textSecondary,
  },
});
