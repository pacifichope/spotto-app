import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BrandGradient from '@/components/BrandGradient';
import { MapPinIcon } from '@/components/icons';
import { theme } from '@/constants/theme';
import { useAuth } from '@/lib/authContext';
import {
  fetchMyParticipantTicket,
  type MyParticipantTicket,
} from '@/lib/eventParticipantsRemote';
import {
  formatEventSchedule,
  formatLocationLabel,
  getEventLifecycleStatus,
  isEventCancelled,
  isEventPast,
  levelLabel,
  sportLabel,
  type SportEvent,
} from '@/lib/events';
import { localizedEventTitle } from '@/lib/eventLocalizedText';
import { useEvents } from '@/lib/eventsContext';
import { eventPriceYen, formatYenAmount, isPaidEvent } from '@/lib/payments';
import { userDisplayName } from '@/lib/userProfile';
import { useUserProfile } from '@/lib/userProfileContext';

function formatBookedAt(iso: string | null | undefined) {
  const raw = String(iso || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${d} ${hh}:${mm}`;
}

export default function TicketScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId: eventIdParam } = useLocalSearchParams<{
    eventId: string;
  }>();
  const eventId = Array.isArray(eventIdParam) ? eventIdParam[0] : eventIdParam;

  const {
    events,
    joinedIds,
    isParticipating,
    ensureRemoteEvent,
    eventPayment,
    eventsLoading,
  } = useEvents();
  const { user } = useAuth();
  const { userProfile } = useUserProfile();

  const fromList = useMemo(
    () => events.find((item) => item.id === eventId) ?? null,
    [events, eventId],
  );
  const [event, setEvent] = useState<SportEvent | null>(fromList);
  const [ticket, setTicket] = useState<MyParticipantTicket | null>(null);
  const [loading, setLoading] = useState(!fromList);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setEvent(fromList);
  }, [fromList]);

  useEffect(() => {
    let cancelled = false;
    if (!eventId) return;

    void (async () => {
      setLoading(true);
      setLoadFailed(false);

      let nextEvent = fromList;
      if (!nextEvent) {
        nextEvent = await ensureRemoteEvent(eventId);
      }
      if (cancelled) return;
      setEvent(nextEvent);

      const remote = await fetchMyParticipantTicket(eventId);
      if (cancelled) return;
      if (remote.ok) {
        setTicket(remote.data);
      } else if (__DEV__) {
        console.warn('[ticket] participant fetch', remote.error);
      }

      setLoading(false);
      if (!nextEvent) {
        setLoadFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, fromList, ensureRemoteEvent]);

  const joined =
    Boolean(eventId) &&
    (joinedIds.has(eventId!) || isParticipating(eventId!) || Boolean(ticket));

  const payment = eventId ? eventPayment(eventId) : undefined;
  const reserverName =
    userDisplayName(userProfile) ||
    user?.name?.trim() ||
    t('ticket.participantFallback');
  const ticketQty = Math.max(
    1,
    ticket?.ticketQuantity || payment?.ticketQuantity || 1,
  );
  const schedule = event ? formatEventSchedule(event) : null;
  const location = event ? formatLocationLabel(event.location) : '';
  const lifecycle = event ? getEventLifecycleStatus(event) : 'upcoming';
  const statusLabel =
    lifecycle === 'cancelled'
      ? t('events.lifecycle.cancelled')
      : lifecycle === 'ended'
        ? t('events.lifecycle.ended')
        : joined
          ? t('ticket.statusJoined')
          : t('ticket.statusNotJoined');
  const bookedAt = formatBookedAt(ticket?.createdAt);

  const close = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/mypage');
  };

  if (loading || (eventsLoading && !event)) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.hint}>{t('ticket.loading')}</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.missingTitle}>{t('ticket.notFoundTitle')}</Text>
        <Text style={styles.hint}>
          {loadFailed
            ? t('ticket.loadFailed')
            : t('ticket.notFoundBody')}
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={close}>
          <Text style={styles.secondaryBtnText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  if (!joined) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.missingTitle}>{t('ticket.noReservationTitle')}</Text>
        <Text style={styles.hint}>
          {t('ticket.noReservationBody')}
        </Text>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.replace(`/event/${event.id}`)}
        >
          <Text style={styles.secondaryBtnText}>{t('ticket.toEventDetail')}</Text>
        </Pressable>
        <Pressable style={styles.textLink} onPress={close}>
          <Text style={styles.textLinkLabel}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top || 8 }]}>
      <View style={styles.header}>
        <Pressable
          onPress={close}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Text style={styles.headerClose}>{t('common.close')}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('ticket.title')}</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>
          {t('ticket.lead')}
        </Text>

        <View style={styles.ticket}>
          <BrandGradient style={styles.ticketBanner}>
            <Text style={styles.bannerEyebrow}>SPOTTO TICKET</Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{statusLabel}</Text>
            </View>
          </BrandGradient>

          <View style={styles.ticketBody}>
            <Text style={styles.eventTitle}>{localizedEventTitle(event)}</Text>
            <Text style={styles.sportLine}>
              {event.emoji} {sportLabel(event.sport)}
              {event.level ? ` · ${levelLabel(event.level)}` : ''}
            </Text>

            <View style={styles.divider} />

            <Text style={styles.fieldLabel}>{t('ticket.fieldDateTime')}</Text>
            <Text style={styles.fieldValue}>
              {schedule?.full || `${event.date} ${event.time}`}
            </Text>

            {location ? (
              <>
                <Text style={styles.fieldLabel}>{t('ticket.fieldLocation')}</Text>
                <View style={styles.locationRow}>
                  <MapPinIcon size={16} color={theme.colors.primaryDark} />
                  <Text style={styles.fieldValueFlex}>{location}</Text>
                </View>
              </>
            ) : null}

            <Text style={styles.fieldLabel}>{t('ticket.fieldReserver')}</Text>
            <Text style={styles.fieldValue}>{reserverName}</Text>

            <Text style={styles.fieldLabel}>{t('ticket.fieldQuantity')}</Text>
            <Text style={styles.fieldValue}>
              {t('ticket.quantityValue', { count: ticketQty })}
            </Text>

            {isPaidEvent(event) ? (
              <>
                <Text style={styles.fieldLabel}>{t('ticket.fieldFee')}</Text>
                <Text style={styles.fieldValue}>
                  {formatYenAmount(eventPriceYen(event) * ticketQty)}
                  {payment?.status === 'refunded' ? t('ticket.refundedSuffix') : ''}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>{t('ticket.fieldFee')}</Text>
                <Text style={styles.fieldValue}>{t('events.free')}</Text>
              </>
            )}

            {bookedAt ? (
              <>
                <Text style={styles.fieldLabel}>{t('ticket.fieldBookedAt')}</Text>
                <Text style={styles.fieldValue}>{bookedAt}</Text>
              </>
            ) : null}

            {(isEventPast(event) || isEventCancelled(event)) && (
              <Text style={styles.pastNote}>
                {isEventCancelled(event)
                  ? t('ticket.noteCancelled')
                  : t('ticket.noteEnded')}
              </Text>
            )}
          </View>
        </View>

        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.push(`/event/${event.id}`)}
          accessibilityRole="button"
          accessibilityLabel={t('ticket.openEventA11y')}
        >
          <Text style={styles.secondaryBtnText}>{t('ticket.viewEventDetail')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerClose: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    minWidth: 56,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  headerSide: {
    minWidth: 56,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 4,
    gap: 16,
  },
  lead: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  ticket: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  ticketBanner: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerEyebrow: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statusPill: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusPillText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  ticketBody: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 4,
  },
  eventTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  sportLine: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginVertical: 12,
  },
  fieldLabel: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  fieldValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    lineHeight: 22,
  },
  fieldValueFlex: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    lineHeight: 22,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 2,
  },
  pastNote: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  secondaryBtn: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  textLink: {
    paddingVertical: 8,
  },
  textLinkLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  missingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
