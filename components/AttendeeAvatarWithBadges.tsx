import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import HostAvatar, { type AvatarGender } from '@/components/HostAvatar';
import { theme } from '@/constants/theme';
import { attendeeTicketQuantity, type EventAttendee } from '@/lib/attendees';

type AttendeeAvatarWithBadgesProps = {
  attendee: Pick<
    EventAttendee,
    'name' | 'imageUri' | 'gender' | 'ticketQuantity'
  >;
  size?: number;
  /** 主催者ラベルを出す */
  showHostBadge?: boolean;
  /**
   * チケット枚数バッジを出す最小枚数。
   * 既定 2（1枚はバッジ非表示でスッキリ見せる）
   */
  quantityBadgeMin?: number;
};

/**
 * 参加者アバター + 右下の枚数バッジ（2枚以上）+ 任意の主催バッジ。
 */
export default function AttendeeAvatarWithBadges({
  attendee,
  size = 48,
  showHostBadge = false,
  quantityBadgeMin = 2,
}: AttendeeAvatarWithBadgesProps) {
  const { t } = useTranslation();
  const qty = attendeeTicketQuantity(attendee);
  const showQty = qty >= quantityBadgeMin;
  const qtyLabel = qty > 99 ? '99+' : String(qty);
  const badgeSize = Math.max(16, Math.round(size * 0.38));
  const qtyFontSize = qty > 9 ? Math.max(9, badgeSize * 0.48) : Math.max(10, badgeSize * 0.55);

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <HostAvatar
        name={attendee.name}
        imageUri={attendee.imageUri}
        gender={attendee.gender as AvatarGender}
        size={size}
      />
      {showHostBadge && !showQty ? (
        <View style={styles.hostBadge} pointerEvents="none">
          <Text style={styles.hostBadgeText}>{t('events.hostBadge')}</Text>
        </View>
      ) : null}
      {showHostBadge && showQty ? (
        <View style={styles.hostBadgeTop} pointerEvents="none">
          <Text style={styles.hostBadgeText}>{t('events.hostBadge')}</Text>
        </View>
      ) : null}
      {showQty ? (
        <View
          style={[
            styles.qtyBadge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              right: -2,
              bottom: -2,
            },
          ]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text
            style={[
              styles.qtyBadgeText,
              { fontSize: qtyFontSize, lineHeight: qtyFontSize + 1 },
            ]}
          >
            {qtyLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hostBadge: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    backgroundColor: theme.colors.accent,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.surface,
    minWidth: 26,
    alignItems: 'center',
  },
  hostBadgeTop: {
    position: 'absolute',
    left: -4,
    top: -4,
    backgroundColor: theme.colors.accent,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.surface,
    minWidth: 26,
    alignItems: 'center',
  },
  hostBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: theme.colors.onAccent,
    letterSpacing: -0.2,
  },
  qtyBadge: {
    position: 'absolute',
    backgroundColor: theme.colors.accent,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  qtyBadgeText: {
    fontWeight: '800',
    color: theme.colors.onAccent,
    textAlign: 'center',
  },
});
