import AppModal from '@/components/AppModal';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AttendeeAvatarWithBadges from '@/components/AttendeeAvatarWithBadges';
import HostAvatar from '@/components/HostAvatar';
import SafetyActionsSheet from '@/components/SafetyActionsSheet';
import { theme } from '@/constants/theme';
import type { EventAttendee } from '@/lib/attendees';
import {
    attendeeTicketQuantity,
    isEventHostAttendee,
} from '@/lib/attendees';
import type { Club } from '@/lib/clubs';

type OverlayMode = 'list' | 'profile';

type EventHostRef = {
  host: string;
  hostId?: string;
};

type AttendeeProfileOverlayProps = {
  visible: boolean;
  mode: OverlayMode;
  attendees: EventAttendee[];
  selected: EventAttendee | null;
  clubs: Club[];
  /** 参加クラブ取得中 */
  clubsLoading?: boolean;
  joinedCount?: number;
  capacity?: number;
  onClose: () => void;
  onSelect: (attendee: EventAttendee) => void;
  onBackToList?: () => void;
  onOpenClub?: (clubId: string) => void;
  onBlock?: (attendee: EventAttendee) => void;
  onUnblock?: (attendee: EventAttendee) => void;
  isBlocked?: boolean;
  hostMode?: boolean;
  /** 主催者判定用 */
  eventHost?: EventHostRef | null;
  checkedInIds?: Set<string>;
  onToggleCheckIn?: (attendee: EventAttendee) => void;
};

function accentFromAttendee(person: {
  id: string;
  gender?: '男性' | '女性';
}): 'male' | 'female' | 'default' {
  if (person.gender === '女性') return 'female';
  if (person.gender === '男性') return 'male';
  return 'default';
}

export default function AttendeeProfileOverlay({
  visible,
  mode,
  attendees,
  selected,
  clubs,
  clubsLoading = false,
  joinedCount,
  capacity,
  onClose,
  onSelect,
  onBackToList,
  onOpenClub,
  onBlock,
  onUnblock,
  isBlocked = false,
  hostMode = false,
  eventHost = null,
  checkedInIds,
  onToggleCheckIn,
}: AttendeeProfileOverlayProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const translateY = useSharedValue(0);
  const sheetHeight = Math.round(windowHeight * 0.82);
  const showList = mode === 'list' || !selected;
  const profile = !showList ? selected : null;
  const safeClubs = (Array.isArray(clubs) ? clubs : []).filter(
    (club): club is Club => Boolean(club && String(club.id || '').trim()),
  );
  const count = joinedCount ?? attendees.length;
  const checkedCount = hostMode
    ? attendees.filter((person) => checkedInIds?.has(person.id)).length
    : 0;
  const subtitle = hostMode
    ? t('events.overlay.subtitleHost', { checked: checkedCount, count })
    : capacity && capacity > 0
      ? t('events.overlay.subtitleCapacity', { count, capacity })
      : t('events.overlay.subtitleCount', { count });

  useEffect(() => {
    if (visible) translateY.value = 0;
    if (!visible || showList) setMenuOpen(false);
  }, [visible, showList, translateY]);

  const finishClose = useCallback(() => {
    translateY.value = 0;
    setMenuOpen(false);
    onClose();
  }, [onClose, translateY]);

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-24, 24])
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 96 || event.velocityY > 850) {
        runOnJS(finishClose)();
        return;
      }
      translateY.value = withTiming(0, { duration: 180 });
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <AppModal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={finishClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={finishClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              paddingBottom: Math.max(insets.bottom, 16),
            },
            sheetStyle,
          ]}
        >
          <View style={styles.headerHit}>
            <GestureDetector gesture={pan}>
              <View style={styles.headerDrag}>
                <View style={styles.handle} />
                <View style={styles.headerText}>
                  <Text style={styles.title}>
                    {hostMode
                      ? t('events.overlay.titleHost')
                      : t('events.overlay.title')}
                  </Text>
                  <Text style={styles.subtitle}>{subtitle}</Text>
                </View>
              </View>
            </GestureDetector>
            <View style={styles.headerActions} pointerEvents="box-none">
              {profile && !profile.self ? (
                <Pressable
                  style={styles.menuBtn}
                  onPress={() => setMenuOpen(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('events.overlay.blockReport')}
                >
                  <Text style={styles.menuMark}>⋯</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.closeBtn}
                onPress={finishClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Text style={styles.closeMark}>×</Text>
              </Pressable>
            </View>
          </View>

          {showList ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              bounces
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {attendees.length === 0 ? (
                <Text style={styles.empty}>{t('events.noAttendeesShort')}</Text>
              ) : (
                <>
                  {hostMode ? (
                    <Text style={styles.hostHint}>
                      {t('events.overlay.hostHint')}
                    </Text>
                  ) : null}
                  {attendees.map((person) => {
                  const accent = accentFromAttendee(person);
                  const female = accent === 'female';
                  const male = accent === 'male';
                  const checkedIn = Boolean(checkedInIds?.has(person.id));
                  const isHost =
                    eventHost != null && isEventHostAttendee(person, eventHost);
                  const qty = attendeeTicketQuantity(person);
                  return (
                    <View
                      key={person.id}
                      style={[
                        styles.card,
                        checkedIn && styles.cardChecked,
                      ]}
                    >
                      <Pressable
                        style={styles.cardMain}
                        onPress={() => onSelect(person)}
                        accessibilityRole="button"
                        accessibilityLabel={[
                          t('events.attendeeProfileA11y', {
                            name: person.self ? t('events.attendeeSelf') : person.name,
                          }),
                          isHost ? t('events.attendeeHostSuffix') : '',
                          qty > 1 ? t('events.attendeeTicketsSuffix', { count: qty }) : '',
                        ].join('')}
                      >
                        <AttendeeAvatarWithBadges
                          attendee={person}
                          size={48}
                          showHostBadge={isHost}
                        />
                        <View style={styles.cardBody}>
                          <View style={styles.nameRow}>
                            <Text style={styles.rowName} numberOfLines={1}>
                              {person.name}
                            </Text>
                            {person.self ? (
                              <View style={styles.selfChip}>
                                <Text style={styles.selfChipText}>{t('events.attendeeSelf')}</Text>
                              </View>
                            ) : null}
                            {qty > 1 ? (
                              <View style={styles.qtyChip}>
                                <Text style={styles.qtyChipText}>
                                  {t('events.overlay.qtyChip', { count: qty })}
                                </Text>
                              </View>
                            ) : null}
                            {hostMode && checkedIn ? (
                              <View style={styles.checkedChip}>
                                <Text style={styles.checkedChipText}>
                                  {t('events.overlay.checkedIn')}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          {female || male ? (
                            <Text
                              style={[
                                styles.genderLine,
                                female
                                  ? styles.genderFemale
                                  : styles.genderMale,
                              ]}
                              numberOfLines={1}
                            >
                              {female
                                ? `♀ ${t('events.gender.female')}`
                                : `♂ ${t('events.gender.male')}`}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                      {hostMode ? (
                        <Pressable
                          style={[
                            styles.checkbox,
                            checkedIn && styles.checkboxOn,
                          ]}
                          onPress={() => onToggleCheckIn?.(person)}
                          hitSlop={8}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: checkedIn }}
                          accessibilityLabel={
                            checkedIn
                              ? t('events.overlay.undoCheckInA11y', { name: person.name })
                              : t('events.overlay.checkInA11y', { name: person.name })
                          }
                        >
                          <Text
                            style={[
                              styles.checkboxMark,
                              checkedIn && styles.checkboxMarkOn,
                            ]}
                          >
                            {checkedIn ? '✓' : ''}
                          </Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          style={styles.viewBtn}
                          onPress={() => onSelect(person)}
                          accessibilityRole="button"
                          accessibilityLabel={t('events.overlay.viewPersonA11y', { name: person.name })}
                        >
                          <Text style={styles.viewBtnText}>View</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
                </>
              )}
            </ScrollView>
          ) : profile ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.profile}
              showsVerticalScrollIndicator={false}
              bounces
              nestedScrollEnabled
            >
              {onBackToList ? (
                <Pressable
                  onPress={onBackToList}
                  style={styles.back}
                  accessibilityRole="button"
                  accessibilityLabel={t('events.overlay.backToListA11y')}
                >
                  <Text style={styles.backText}>‹ {t('events.overlay.titleHost')}</Text>
                </Pressable>
              ) : null}
              <View style={styles.identity}>
                <View style={styles.profileAvatarWrap}>
                  <HostAvatar
                    name={profile.name}
                    imageUri={profile.imageUri}
                    gender={profile.gender}
                    size={80}
                  />
                  {eventHost != null &&
                  isEventHostAttendee(profile, eventHost) ? (
                    <View style={styles.hostBadgeLarge} pointerEvents="none">
                      <Text style={styles.hostBadgeText}>{t('events.hostBadge')}</Text>
                    </View>
                  ) : null}
                </View>
                {profile.self ? (
                  <View style={[styles.selfChip, styles.selfChipProfile]}>
                    <Text style={styles.selfChipText}>{t('events.attendeeSelf')}</Text>
                  </View>
                ) : null}
                <Text style={styles.profileName}>{profile.name}</Text>
                {profile.gender ? (
                  <Text
                    style={[
                      styles.profileGender,
                      profile.gender === '女性'
                        ? styles.genderFemale
                        : styles.genderMale,
                    ]}
                  >
                    {profile.gender === '女性'
                      ? `♀ ${t('events.gender.female')}`
                      : `♂ ${t('events.gender.male')}`}
                  </Text>
                ) : null}
              </View>
              {!profile.self ? (
                <Pressable
                  style={styles.safetyBtn}
                  onPress={() => setMenuOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('events.overlay.blockReport')}
                >
                  <Text style={styles.safetyBtnText}>{t('events.overlay.blockReport')}</Text>
                </Pressable>
              ) : null}
              {hostMode ? (
                <Pressable
                  style={[
                    styles.profileCheckIn,
                    checkedInIds?.has(profile.id) && styles.profileCheckInOn,
                  ]}
                  onPress={() => onToggleCheckIn?.(profile)}
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked: Boolean(checkedInIds?.has(profile.id)),
                  }}
                  accessibilityLabel={
                    checkedInIds?.has(profile.id)
                      ? t('events.overlay.undoCheckInA11y', { name: profile.name })
                      : t('events.overlay.checkInA11y', { name: profile.name })
                  }
                >
                  <View
                    style={[
                      styles.checkbox,
                      checkedInIds?.has(profile.id) && styles.checkboxOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.checkboxMark,
                        checkedInIds?.has(profile.id) && styles.checkboxMarkOn,
                      ]}
                    >
                      {checkedInIds?.has(profile.id) ? '✓' : ''}
                    </Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.profileCheckInTitle}>
                      {checkedInIds?.has(profile.id)
                        ? t('events.overlay.checkedIn')
                        : t('events.overlay.checkIn')}
                    </Text>
                    <Text style={styles.profileCheckInSub}>
                      {checkedInIds?.has(profile.id)
                        ? t('events.overlay.checkedInSub')
                        : t('events.overlay.checkInSub')}
                    </Text>
                  </View>
                </Pressable>
              ) : null}
              <View style={styles.clubSection}>
                <View style={styles.clubSectionHeader}>
                  <Text style={styles.clubLabel}>{t('events.overlay.clubs')}</Text>
                  <View style={styles.clubCountBadge}>
                    <Text style={styles.clubCountText}>
                      {clubsLoading ? '…' : safeClubs.length}
                    </Text>
                  </View>
                </View>
                {clubsLoading && safeClubs.length === 0 ? (
                  <View style={styles.clubLoading}>
                    <ActivityIndicator color={theme.colors.primary} />
                    <Text style={styles.clubEmpty}>{t('events.overlay.clubsLoading')}</Text>
                  </View>
                ) : safeClubs.length === 0 ? (
                  <View style={styles.clubEmptyCard}>
                    <Text style={styles.clubEmpty}>
                      {t('events.overlay.clubsEmpty')}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.clubList}>
                    {safeClubs.map((club) => {
                      const clubId = String(club?.id || '').trim();
                      const clubName = String(club?.name || '').trim() || t('events.overlay.clubFallback');
                      const cover =
                        club?.imageUri?.trim() ||
                        club?.coverUri?.trim() ||
                        undefined;
                      return (
                        <Pressable
                          key={clubId || clubName}
                          style={styles.clubRow}
                          onPress={() => clubId && onOpenClub?.(clubId)}
                          accessibilityRole="button"
                          accessibilityLabel={t('events.overlay.clubProfileA11y', { name: clubName })}
                        >
                          <HostAvatar
                            name={clubName}
                            imageUri={cover}
                            size={44}
                          />
                          <View style={styles.cardBody}>
                            <Text style={styles.clubName} numberOfLines={1}>
                              {clubName}
                            </Text>
                            {club?.tag ? (
                              <Text style={styles.clubTag} numberOfLines={1}>
                                {club.tag}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={styles.chevron}>›</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>
          ) : null}
        </Animated.View>
        {profile && !profile.self ? (
          <SafetyActionsSheet
            visible={menuOpen}
            name={profile.name}
            targetId={profile.id}
            targetType="user"
            isBlocked={isBlocked}
            onClose={() => setMenuOpen(false)}
            onBlock={() => onBlock?.(profile)}
            onUnblock={() => onUnblock?.(profile)}
          />
        ) : null}
      </GestureHandlerRootView>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  sheet: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  headerHit: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    minHeight: 64,
    position: 'relative',
  },
  headerDrag: {
    alignItems: 'center',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginBottom: 10,
  },
  headerText: {
    alignItems: 'center',
    paddingHorizontal: 88,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  headerActions: {
    position: 'absolute',
    right: 16,
    top: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuMark: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: -6,
  },
  closeMark: {
    fontSize: 22,
    fontWeight: '500',
    color: theme.colors.textMuted,
    marginTop: -1,
  },
  scroll: {
    flex: 1,
    ...(Platform.OS === 'web' ? { overflow: 'auto' as const } : null),
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  hostHint: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardChecked: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: '#B7F0CC',
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    position: 'relative',
  },
  profileAvatarWrap: {
    width: 80,
    height: 80,
    position: 'relative',
    marginBottom: 4,
  },
  hostBadge: {
    position: 'absolute',
    right: -6,
    bottom: -3,
    backgroundColor: theme.colors.accent,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.surface,
    minWidth: 28,
    alignItems: 'center',
  },
  hostBadgeLarge: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    minWidth: 34,
    alignItems: 'center',
  },
  hostBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: theme.colors.onAccent,
    letterSpacing: -0.2,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  genderLine: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  genderMale: {
    color: theme.colors.genderMale,
  },
  genderFemale: {
    color: theme.colors.genderFemale,
  },
  selfChip: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  selfChipProfile: {
    marginTop: 8,
  },
  selfChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  qtyChip: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  qtyChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.accentDark,
  },
  checkedChip: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: theme.colors.primaryDark,
  },
  checkedChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.onPrimary,
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    borderColor: theme.colors.primaryDark,
    backgroundColor: theme.colors.primaryDark,
  },
  checkboxMark: {
    fontSize: 16,
    fontWeight: '800',
    color: 'transparent',
    lineHeight: 18,
  },
  checkboxMarkOn: {
    color: theme.colors.onPrimary,
  },
  viewBtn: {
    backgroundColor: '#111827',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  viewBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  profile: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 0,
  },
  back: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginBottom: 8,
  },
  backText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  identity: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  profileName: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
  },
  profileGender: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
  },
  safetyBtn: {
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  safetyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  profileCheckIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  profileCheckInOn: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: '#B7F0CC',
  },
  profileCheckInTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  profileCheckInSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  clubSection: {
    marginTop: 4,
    marginBottom: 4,
  },
  clubSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  clubLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
  },
  clubCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 7,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  clubEmpty: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  clubEmptyCard: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  clubLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  clubList: {
    gap: 8,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  clubName: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  clubTag: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginTop: -2,
  },
});
