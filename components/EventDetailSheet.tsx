import AppModal from '@/components/AppModal';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AttendeeProfileOverlay from '@/components/AttendeeProfileOverlay';
import ChatRoomScreen from '@/components/ChatRoomScreen';
import ConnectionBanner from '@/components/ConnectionBanner';
import { KeyboardAvoidingScreen } from '@/components/KeyboardForm';
import EventAttendeesRow from '@/components/EventAttendeesRow';
import EventContentSection from '@/components/EventContentSection';
import EventImageGallery, {
  EVENT_HEADER_COLLAPSED,
  EVENT_HEADER_COLLAPSE_RANGE,
  EVENT_HEADER_EXPANDED,
} from '@/components/EventImageGallery';
import EventScheduleSection from '@/components/EventScheduleSection';
import HostAvatar from '@/components/HostAvatar';
import JoinSuccessScreen from '@/components/JoinSuccessScreen';
import MiniMap from '@/components/MiniMap';
import PaymentCheckoutSheet from '@/components/PaymentCheckoutSheet';
import SaveToast, { useTimedToast } from '@/components/SaveToast';
import {
    CancelPolicyIcon,
    ChatIcon,
    HourglassIcon,
    MapPinIcon,
    SportIcon,
    TargetIcon,
} from '@/components/icons';
import { categoryColor, theme } from '@/constants/theme';
import {
    attendeeFromViewer,
    attendeesForDisplay,
    type EventAttendee,
} from '@/lib/attendees';
import { useAuth } from '@/lib/authContext';
import {
    confirmBlockUser,
    confirmUnblockUser,
} from '@/lib/blocks';
import { useBlocks } from '@/lib/blocksContext';
import {
    formatUnreadBadge,
    parseChatMode,
    unreadCountForEventMode,
    type EventChatMode,
} from '@/lib/chats';
import { useChats } from '@/lib/chatsContext';
import { isRemoteEventId } from '@/lib/chatsRemote';
import { clubHref } from '@/lib/clubNavigation';
import { clubIdFromEvent, resolveClub } from '@/lib/clubs';
import { useClubs } from '@/lib/clubsContext';
import { ageGroupLabel, cancelConfirmTitle, cancelPolicyCardText, cancelPolicyTagLabel, eventContentBody, eventDisplayPhotoUris, eventEarliestStartAt, eventEndAt, eventForSelectedOccurrence, eventSpotsLeft, formatDeadlineLabel, formatEventSchedule, formatLocationLabel, isEventCancelled, isEventFull, isEventPast, isRefundWindowClosed, levelLabel, parseCancelPolicyRule, refundEligibleNotice, refundForfeitNotice, relatedScheduleEvents, sanitizeEventItems, sanitizeTargetAgeGroups, sessionFromEvent, shouldAutoRefundOnCancel, sportFallbackUri, sportLabel, type EventSession, type JoinActionResult, type SportEvent } from '@/lib/events';
import {
  localizedEventDescription,
  localizedEventTitle,
} from '@/lib/eventLocalizedText';
import { useEvents } from '@/lib/eventsContext';
import {
    preferredPlaceName,
    resolveMeetingPlaceLabel,
} from '@/lib/googlePlaces';
import { confirmHostCancelEvent, getHostCancelChatMessage } from '@/lib/hostCancel';
import { notifyBookingEvent } from '@/lib/notify';
import { ALLOW_JOIN_PAST_EVENTS } from '@/lib/devTestFlags';
import { openEventInMaps } from '@/lib/openMaps';
import { isHostedByMe } from '@/lib/organizerProfile';
import { ticketHref } from '@/lib/ticketNavigation';
import {
    applyTicketSaleRefund,
    markEventTicketSalesRefunded,
    recordTicketSale,
} from '@/lib/organizerSales';
import {
    eventPriceYen,
    formatYenAmount,
    freeJoinButtonLabel,
    isPaidEvent,
    paidJoinButtonLabel,
    refundAmountYen,
} from '@/lib/payments';
import { usePhoneVerification } from '@/lib/phoneVerificationContext';
import { shareEvent } from '@/lib/shareEvent';
import { resolveDisplayImageUrl } from '@/lib/storage';
import { requestStripeRefund } from '@/lib/stripePayments';
import { useAttendeeJoinedClubs } from '@/lib/useAttendeeJoinedClubs';
import { useUserProfile } from '@/lib/userProfileContext';

type EventDetailSheetProps = {
  event: SportEvent | null;
  joined: boolean;
  onClose: () => void;
  onToggleJoin: (options?: {
    ticketQuantity?: number;
  }) => JoinActionResult | void | Promise<JoinActionResult | void>;
  onOpenClub?: (clubId: string) => void;
};

export default function EventDetailSheet({
  event: routeEvent,
  joined: _routeJoined,
  onClose,
  onToggleJoin: _onToggleJoin,
  onOpenClub,
}: EventDetailSheetProps) {
  const { t, i18n } = useTranslation();
  const CANCEL_CONFIRM_TITLE = cancelConfirmTitle();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { events, organizerProfile, now, recordEventPayment, eventPayment, markEventRefunded, cancelHostedEvent, favoriteIds, toggleFavorite, watchlistIds, toggleWatchlist, toggleCheckIn, checkedInIds, hostedIds, currentUserId, loadEventParticipants, participantsForEvent, eventsSaving, toggleJoin, joinedIds, isParticipating } = useEvents();
  const { requireAuth, requireCompleteProfile, ensureNotBanned, user } = useAuth();
  const { requirePhoneVerified } = usePhoneVerification();
  const {
    blockUser,
    unblockUser,
    isBlocked,
    filterAttendees,
  } = useBlocks();
  const { ensureThread, sendMessage, threads, lastReadAt, markThreadRead } =
    useChats();
  const { userProfile, displayName } = useUserProfile();
  const { joinedClubIds } = useClubs();
  const [galleryFullscreen, setGalleryFullscreen] = useState(false);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (scrollEvent) => {
      scrollY.value = Math.max(0, scrollEvent.contentOffset.y);
    },
  });
  const [meetingPlaceLabel, setMeetingPlaceLabel] = useState('');
  const [roomMode, setRoomMode] = useState<EventChatMode | null>(null);
  const [roomDmUserId, setRoomDmUserId] = useState<string | null>(null);
  const [attendeeOverlay, setAttendeeOverlay] = useState<
    'list' | 'profile' | null
  >(null);
  const [selectedAttendee, setSelectedAttendee] =
    useState<EventAttendee | null>(null);
  const [profileFromList, setProfileFromList] = useState(false);
  const [paying, setPaying] = useState(false);
  const [joinSuccessVisible, setJoinSuccessVisible] = useState(false);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [toast, setToast] = useTimedToast(3200);
  /**
   * 日付チップで選んだ開催回 id（参加・定員・参加者の正）。
   * 画面遷移はせず、同一詳細内で内容だけ差し替える。
   */
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(
    routeEvent?.id ?? null,
  );
  /** 同一 event id 内のレガシー同一日複数枠用（別日の独立開催には使わない） */
  const [selectedSession, setSelectedSession] = useState<EventSession | null>(
    null,
  );
  const pendingGroupChatRef = useRef(false);
  const focusedEventIdRef = useRef<string | null>(routeEvent?.id ?? null);

  // ホームなどから別イベントを開いたときだけ開催回をリセット（日付チップ切替では触らない）
  useEffect(() => {
    setSelectedOccurrenceId(routeEvent?.id ?? null);
  }, [routeEvent?.id]);

  /** ルート／フォーカス開催回のどちらからでも兄弟開催を拾う */
  const scheduleOccurrences = useMemo(() => {
    if (!routeEvent) return [];
    const fromRoute = relatedScheduleEvents(routeEvent, events);
    if (!selectedOccurrenceId || selectedOccurrenceId === routeEvent.id) {
      return fromRoute;
    }
    const focused =
      events.find((item) => item.id === selectedOccurrenceId) ??
      fromRoute.find((item) => item.id === selectedOccurrenceId);
    if (!focused) return fromRoute;
    const fromFocused = relatedScheduleEvents(focused, events);
    if (fromFocused.length <= fromRoute.length) return fromRoute;
    return fromFocused;
  }, [routeEvent, selectedOccurrenceId, events]);

  /**
   * 画面に出す開催回。日付切替直後は selectedOccurrenceId を最優先。
   * events / peers から必ずその id を拾い、別日の参加状態を出さない。
   */
  const event = useMemo(() => {
    if (!routeEvent) return null;
    const id = selectedOccurrenceId || routeEvent.id;
    const live = events.find((item) => item.id === id);
    if (live) return live;
    const fromSeries = scheduleOccurrences.find((item) => item.id === id);
    if (fromSeries) return fromSeries;
    return routeEvent;
  }, [routeEvent, selectedOccurrenceId, scheduleOccurrences, events]);

  focusedEventIdRef.current = event?.id ?? null;

  const photos = useMemo(() => {
    if (!event) return [];
    const collected: string[] = [];
    for (const raw of eventDisplayPhotoUris(event)) {
      const display = resolveDisplayImageUrl(raw);
      if (display && !collected.includes(display)) collected.push(display);
    }
    return collected;
  }, [event?.id, event?.imageUri, event?.imageUris]);

  useEffect(() => {
    if (!event) {
      setSelectedSession(null);
      return;
    }
    // 開催回切替時は当該回の日時にリセット
    setSelectedSession(sessionFromEvent(event));
  }, [event?.id]);

  /**
   * 参加・決済・参加者は常に「今フォーカスしている開催回」の event.id。
   * 日付切替は別 id（selectedOccurrenceId）へ載せ替える。
   */
  const checkoutEvent = useMemo(() => {
    if (!event) return null;
    return eventForSelectedOccurrence(
      event,
      selectedSession ?? sessionFromEvent(event),
    );
  }, [event, selectedSession]);

  const activeJoined = event
    ? joinedIds.has(event.id) || isParticipating(event.id)
    : false;
  const isHost = event
    ? isHostedByMe(event, hostedIds, currentUserId)
    : false;
  const favorited = event ? favoriteIds?.has?.(event.id) === true : false;
  const watchingVacancies = event
    ? watchlistIds?.has?.(event.id) === true
    : false;
  const canUseGroupChat = activeJoined || isHost;
  const groupUnread = event
    ? unreadCountForEventMode(threads, lastReadAt, event.id, 'group')
    : 0;
  const hostUnread = event
    ? unreadCountForEventMode(threads, lastReadAt, event.id, 'host')
    : 0;
  const groupUnreadLabel = formatUnreadBadge(groupUnread);
  const hostUnreadLabel = formatUnreadBadge(hostUnread);
  const isFull = event ? isEventFull(event) : false;
  const spotsLeft = event ? eventSpotsLeft(event) : 0;
  const itemsToBring = event ? sanitizeEventItems(event.itemsToBring) : [];
  const includedItems = event ? sanitizeEventItems(event.includedItems) : [];
  const targetAgeGroups = event
    ? sanitizeTargetAgeGroups(event.targetAgeGroups)
    : [];
  const club = event
    ? resolveClub(
        clubIdFromEvent(event),
        events,
        organizerProfile,
        currentUserId,
      )
    : null;
  const ended = event ? isEventPast(event) : false;
  /** 開発時は過去イベントにも参加・決済でき、売上反映を確認できる */
  const joinBlockedByPast = ended && !ALLOW_JOIN_PAST_EVENTS;
  const cancelled = event ? isEventCancelled(event) : false;
  const viewer = useMemo(
    () =>
      attendeeFromViewer(
        user,
        userProfile,
        Array.from(joinedClubIds ?? []),
      ),
    [user, userProfile, joinedClubIds],
  );
  const remoteAttendees = event ? participantsForEvent(event.id) : [];
  const attendees = useMemo(() => {
    if (!event) return [];
    // クラウドイベントは実参加者のみ（シードの「参加者N」は使わない）
    if (isRemoteEventId(event.id)) {
      const filtered = filterAttendees(remoteAttendees);
      const withoutSelf = viewer
        ? filtered.filter((person) => person.id !== viewer.id)
        : filtered;
      if (activeJoined && viewer) {
        const remoteSelf = filtered.find(
          (person) => person.self || person.id === viewer.id,
        );
        const selfEntry: EventAttendee = remoteSelf
          ? {
              ...remoteSelf,
              self: true,
              name:
                remoteSelf.name &&
                remoteSelf.name !== '名前未設定' &&
                remoteSelf.name !== '参加者'
                  ? remoteSelf.name
                  : viewer.name,
              imageUri: remoteSelf.imageUri || viewer.imageUri,
              gender: remoteSelf.gender ?? viewer.gender,
              ticketQuantity: remoteSelf.ticketQuantity ?? viewer.ticketQuantity,
            }
          : viewer;
        return [
          selfEntry,
          ...withoutSelf.filter((person) => person.id !== selfEntry.id),
        ];
      }
      return withoutSelf;
    }
    return filterAttendees(
      attendeesForDisplay(event, viewer, activeJoined, clubIdFromEvent(event)),
    );
  }, [event, remoteAttendees, viewer, activeJoined, filterAttendees]);

  useEffect(() => {
    const id = selectedOccurrenceId || event?.id;
    if (!id) return;
    void loadEventParticipants(id);
  }, [selectedOccurrenceId, event?.id, loadEventParticipants]);

  const checkedIn = event ? checkedInIds(event.id) : new Set<string>();
  const checkedInCount = attendees.filter((person) =>
    checkedIn.has(person.id),
  ).length;
  const profileClubsEnabled =
    attendeeOverlay === 'profile' && Boolean(selectedAttendee?.id);
  const currentEventClubId = event ? clubIdFromEvent(event) : null;
  const { clubs: selectedAttendeeClubs, loading: clubsLoading } =
    useAttendeeJoinedClubs({
      userId: selectedAttendee?.id,
      seedClubIds: selectedAttendee?.clubIds,
      hintClubIds: currentEventClubId ? [currentEventClubId] : [],
      hintEvents: event ? [event] : [],
      events,
      organizerProfile,
      currentUserId,
      enabled: profileClubsEnabled,
    });
  /** 終了済みは参加取消（キャンセル）不可。DEV の過去参加テストは未参加時のみ許可 */
  const joinClosed = Boolean(
    event &&
      (cancelled ||
        (ended && (activeJoined || !ALLOW_JOIN_PAST_EVENTS)) ||
        (!activeJoined && isFull)),
  );
  /** 満員かつ未参加・未終了・未中止 → 空き通知ウォッチ可能 */
  const canWatchVacancies = Boolean(
    event && !isHost && !ended && !cancelled && !activeJoined && isFull,
  );
  /** 参加者向け: 終了済みはキャンセルではなく「開催終了」表示 */
  const showEndedCta = Boolean(ended && !cancelled && !isHost);
  const priceYen = eventPriceYen(event);
  const paid = isPaidEvent(event);
  const contentBody = useMemo(
    () =>
      event
        ? eventContentBody({
            description: localizedEventDescription(event),
          })
        : '',
    [event, i18n.language],
  );
  const displayTitle = useMemo(
    () => (event ? localizedEventTitle(event) : ''),
    [event, i18n.language],
  );
  const cancelTag = event ? cancelPolicyTagLabel(event) : '';
  const cancelTagNoRefund = Boolean(
    event && paid && parseCancelPolicyRule(event.cancelPolicy).kind === 'none',
  );
  const notifyBooking = (
    kind:
      | 'booking_confirmed'
      | 'booking_cancelled'
      | 'event_cancelled_by_host',
    extra?: { refundYen?: number; hostCancelled?: boolean },
  ) => {
    const target = checkoutEvent ?? event;
    if (!target) return;
    const schedule = formatEventSchedule(
      target,
      selectedSession ?? sessionFromEvent(target),
    );
    const payment = eventPayment(target.id);
    void notifyBookingEvent({
      kind,
      toEmail: user?.email,
      toName: displayName,
      eventId: target.id,
      eventTitle: target.title,
      location: formatLocationLabel(target.location, target.locationNote),
      scheduleLabel: schedule.full,
      startsAt: eventEarliestStartAt(target).toISOString(),
      amountYen: paid ? priceYen : 0,
      refundYen: extra?.refundYen,
      paymentIntentId: payment?.paymentIntentId,
      hostCancelled: extra?.hostCancelled,
    });
  };
  const applyJoinRef = useRef<() => JoinActionResult>(() => 'unchanged');
  const performJoin = async (options?: {
    ticketQuantity?: number;
  }): Promise<JoinActionResult> => {
    if (cancelled) return 'unchanged';
    // 終了済み: 参加取消は不可。DEV のみ未参加の過去イベントへの参加を許可
    if (ended && (activeJoined || !ALLOW_JOIN_PAST_EVENTS)) return 'unchanged';
    if (eventsSaving) return 'unchanged';
    // 親の onToggleJoin はルート id に閉じるため使わない。常にフォーカス開催回 id で参加する。
    const targetId =
      focusedEventIdRef.current || checkoutEvent?.id || event?.id;
    if (!targetId) return 'unchanged';
    const result = ((await Promise.resolve(toggleJoin(targetId, options))) ??
      'unchanged') as JoinActionResult;
    if (result === 'full') {
      Alert.alert(
        t('events.fullClosed'),
        t('join.fullBody'),
      );
    } else if (result === 'unchanged' && event) {
      // remote 失敗時など — 参加操作の失敗は呼び出し側で補足
    } else if (result === 'joined' && (checkoutEvent || event)) {
      const target = checkoutEvent ?? event!;
      // 参加完了時のグループチャット自動投稿は行わない
      ensureThread(target, 'group');
      notifyBooking('booking_confirmed');
      void loadEventParticipants(target.id);
    } else if (result === 'left' && (checkoutEvent || event)) {
      void loadEventParticipants((checkoutEvent ?? event)!.id);
    }
    return result;
  };
  const dismissLeaveConfirm = () => {
    if (leaveBusy) return;
    setTimeout(() => setLeaveConfirmVisible(false), 80);
  };
  const confirmLeaveAndLeave = () => {
    if (leaveBusy) return;
    void (async () => {
      const refundNow =
        Boolean(checkoutEvent || event) &&
        activeJoined &&
                shouldAutoRefundOnCancel((checkoutEvent ?? event)!, now);
      if (refundNow && (checkoutEvent || event)) {
        setLeaveBusy(true);
        try {
          const target = checkoutEvent ?? event!;
          const payment = eventPayment(target.id);
          if (payment?.status === 'refunded') {
            setLeaveBusy(false);
            setTimeout(() => {
              setLeaveConfirmVisible(false);
              void performJoin();
            }, 80);
            return;
          }
          const paidYen = payment?.amountYen || priceYen;
          const refundYen = refundAmountYen(target, paidYen, now);
          const result = await requestStripeRefund({
            eventId: target.id,
            paymentIntentId:
              payment?.paymentIntentId || `demo_pi_${target.id}`,
            amountYen: paidYen,
            refundAmountYen: refundYen,
            cancelPolicy: target.cancelPolicy,
            eventStartsAt: eventEarliestStartAt(target).toISOString(),
          });
          markEventRefunded(target.id);
          void applyTicketSaleRefund({
            eventId: target.id,
            paymentIntentId: payment?.paymentIntentId,
            refundYen,
          });
          setTimeout(() => {
            setLeaveConfirmVisible(false);
            setLeaveBusy(false);
            void (async () => {
              const left = await performJoin();
              if (left === 'left') {
                notifyBooking('booking_cancelled', { refundYen });
                Alert.alert(
                  t('join.cancelledTitle'),
                  result.demo
                    ? t('join.refundStarted')
                    : t('join.refundedStripe'),
                );
              } else if (left === 'unchanged') {
                Alert.alert(
                  t('join.cancelFailedTitle'),
                  t('join.cancelFailedBody'),
                );
              }
            })();
          }, 80);
        } catch (err) {
          setLeaveBusy(false);
          Alert.alert(
            t('join.refundFailedTitle'),
            err instanceof Error
              ? err.message
              : t('join.refundFailedBody'),
          );
        }
        return;
      }
      setTimeout(() => {
        setLeaveConfirmVisible(false);
        void (async () => {
          const left = await performJoin();
          if (left === 'left' && event) {
            notifyBooking('booking_cancelled', {
              refundYen: 0,
            });
          } else if (left === 'unchanged') {
            Alert.alert(
              t('join.cancelFailedTitle'),
              t('join.cancelFailedBody'),
            );
          }
        })();
      }, 80);
    })();
  };
  const leaveConfirmDetail =
    checkoutEvent && activeJoined && paid
      ? isRefundWindowClosed(checkoutEvent, now)
        ? { kind: 'forfeit' as const, text: refundForfeitNotice() }
        : { kind: 'refund' as const, text: refundEligibleNotice() }
      : null;
  const startJoin = async (): Promise<JoinActionResult> => {
    if (cancelled) return 'unchanged';
    if (ended && (activeJoined || !ALLOW_JOIN_PAST_EVENTS)) return 'unchanged';
    if (isHost) {
      confirmHostCancel();
      return 'unchanged';
    }
    if (activeJoined) {
      setLeaveConfirmVisible(true);
      return 'unchanged';
    }
    if (isFull) {
      Alert.alert(
        t('events.fullClosed'),
        t('join.fullBody'),
      );
      return 'full';
    }
    // 有料・無料どちらも参加確認（チェックアウト）画面へ
    if (!checkoutEvent) {
      Alert.alert(
        t('join.cannotStartTitle'),
        t('join.cannotStartBody'),
      );
      return 'unchanged';
    }
    if (__DEV__) {
      console.log('[payments] opening checkout sheet', {
        eventId: checkoutEvent.id,
        priceYen,
        platform: Platform.OS,
      });
    }
    setPaying(true);
    return 'unchanged';
  };
  const applyJoin = () => {
    if (cancelled) return 'unchanged';
    if (ended && (activeJoined || !ALLOW_JOIN_PAST_EVENTS)) return 'unchanged';
    // ログイン → BAN → プロフィール → 電話番号認証 → 参加/決済
    const runGate = async (): Promise<JoinActionResult> => {
      if (!(await ensureNotBanned())) {
        if (__DEV__) console.warn('[payments] join blocked: banned');
        return 'unchanged';
      }
      if (
        !requireCompleteProfile(() => {
          void runGate();
        })
      ) {
        if (__DEV__) console.warn('[payments] join blocked: profile incomplete');
        return 'unchanged';
      }
      if (
        !requirePhoneVerified(() => {
          void runGate();
        })
      ) {
        // context 側でも navigate するが、Stack 内から二重で確実に遷移
        if (__DEV__) {
          console.log('[payments] phone gate → /auth/phone');
        }
        try {
          router.push('/auth/phone');
        } catch {
          // context の navigate に任せる
        }
        return 'unchanged';
      }
      return startJoin();
    };

    if (
      !requireAuth(() => {
        void runGate().then((result) => {
          if (result !== 'joined') {
            pendingGroupChatRef.current = false;
          }
        });
      }, 'join-event')
    ) {
      return 'unchanged';
    }

    // 同期呼び出し側（チャット誘導など）向け: 非同期ゲートを起動し、完了前は unchanged
    void runGate().then((result) => {
      if (result !== 'joined') {
        pendingGroupChatRef.current = false;
      }
    });
    return 'unchanged';
  };
  applyJoinRef.current = () => {
    void (async () => {
      if (!(await ensureNotBanned())) return;
      if (!requireCompleteProfile(() => applyJoinRef.current())) return;
      if (!requirePhoneVerified(() => applyJoinRef.current())) {
        try {
          router.push('/auth/phone');
        } catch {
          // ignore
        }
        return;
      }
      await startJoin();
    })();
    return 'unchanged';
  };

  const confirmHostCancel = () => {
    if (!event || !isHost || cancelled || ended || cancelBusy) return;
    confirmHostCancelEvent(() => {
      void (async () => {
        setCancelBusy(true);
        try {
          const payment = eventPayment(event.id);
          const paidYen = payment?.amountYen || priceYen;
          if (paid && payment?.status === 'paid') {
            await requestStripeRefund({
              eventId: event.id,
              paymentIntentId: payment.paymentIntentId || `demo_pi_${event.id}`,
              amountYen: paidYen,
              refundAmountYen: paidYen,
              cancelPolicy: event.cancelPolicy,
              eventStartsAt: eventEarliestStartAt(event).toISOString(),
              hostCancelled: true,
            });
            markEventRefunded(event.id);
          }
          // 参加者全員分の売上台帳を相殺（主催者都合の全額返金）
          if (paid) {
            void markEventTicketSalesRefunded(event.id);
          }
          const next = await cancelHostedEvent(event.id);
          if (!next) {
            throw new Error(t('join.hostCancelFailedBody'));
          }
          ensureThread(event, 'group');
          sendMessage(event.id, 'group', getHostCancelChatMessage());
          notifyBooking('event_cancelled_by_host', {
            refundYen: paid ? paidYen : 0,
            hostCancelled: true,
          });
          Alert.alert(
            t('join.hostCancelledTitle'),
            paid
              ? t('join.hostCancelledPaidBody')
              : t('join.hostCancelledFreeBody'),
          );
        } catch (err) {
          Alert.alert(
            t('join.hostCancelFailedTitle'),
            err instanceof Error
              ? err.message
              : t('common.tryAgainLater'),
          );
        } finally {
          setCancelBusy(false);
        }
      })();
    });
  };

  useEffect(() => {
    setRoomMode(null);
    setRoomDmUserId(null);
    setGalleryFullscreen(false);
    setAttendeeOverlay(null);
    setSelectedAttendee(null);
    setProfileFromList(false);
    setPaying(false);
    setJoinSuccessVisible(false);
    setLeaveConfirmVisible(false);
    setLeaveBusy(false);
    setCancelBusy(false);
    scrollY.value = 0;
    if (event) {
      setMeetingPlaceLabel(
        preferredPlaceName(event.location, event.locationNote) ||
          formatLocationLabel(event.location, event.locationNote),
      );
    } else {
      setMeetingPlaceLabel('');
    }
  }, [event?.id]);

  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    void (async () => {
      try {
        const label = await resolveMeetingPlaceLabel({
          location: event.location,
          locationNote: event.locationNote,
          latitude: event.latitude,
          longitude: event.longitude,
        });
        if (!cancelled && label) setMeetingPlaceLabel(label);
      } catch {
        // keep preferred fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    event?.id,
    event?.location,
    event?.locationNote,
    event?.latitude,
    event?.longitude,
  ]);

  useEffect(() => {
    if (!canUseGroupChat || !pendingGroupChatRef.current || !event) return;
    pendingGroupChatRef.current = false;
    openChatRoom('group');
  }, [canUseGroupChat, event?.id]);

  const openClubProfile = () => {
    if (!club) return;
    if (onOpenClub) {
      onOpenClub(club.id);
      return;
    }
    router.push(clubHref(club.id));
  };

  const closeDetail = () => {
    pendingGroupChatRef.current = false;
    setRoomMode(null);
    setRoomDmUserId(null);
    setAttendeeOverlay(null);
    setSelectedAttendee(null);
    setProfileFromList(false);
    onClose();
  };

  const openAttendeeProfile = (person: EventAttendee, fromList = false) => {
    setSelectedAttendee(person);
    setProfileFromList(fromList);
    setAttendeeOverlay('profile');
  };

  const openAttendeeList = () => {
    setSelectedAttendee(null);
    setProfileFromList(false);
    setAttendeeOverlay('list');
  };

  const closeAttendeeOverlay = () => {
    setAttendeeOverlay(null);
    setSelectedAttendee(null);
    setProfileFromList(false);
  };

  const openClubFromAttendee = (clubId: string) => {
    closeAttendeeOverlay();
    if (onOpenClub) {
      onOpenClub(clubId);
      return;
    }
    router.push(clubHref(clubId));
  };

  const blockPerson = (person: EventAttendee) => {
    confirmBlockUser(person.name, () => {
      void blockUser({
        id: person.id,
        name: person.name,
        imageUri: person.imageUri,
      });
      closeAttendeeOverlay();
    });
  };

  const unblockPerson = (person: EventAttendee) => {
    confirmUnblockUser(person.name, () => {
      void unblockUser(person.id);
    });
  };

  const openChatRoom = (mode: EventChatMode = 'group') => {
    if (!event) return;
    const room = parseChatMode(mode);
    // host DM のスレッドキーは常に参加者 UID（主催者自身の UID ではない）
    const dmUserId =
      room === 'host'
        ? isHost
          ? null
          : currentUserId?.trim() || null
        : null;
    if (room === 'host' && !dmUserId) {
      // 主催者がイベント詳細から「誰宛か不明な host DM」を開かない
      return;
    }
    ensureThread(event, room, dmUserId);
    markThreadRead(event.id, room, dmUserId);
    setRoomDmUserId(dmUserId);
    setRoomMode(room);
  };

  const openGroupChat = () => {
    if (canUseGroupChat) {
      openChatRoom('group');
      return;
    }
    if (joinBlockedByPast || cancelled) {
      Alert.alert(
        cancelled ? t('join.closedCancelledTitle') : t('events.lifecycle.ended'),
        cancelled
          ? t('join.closedCancelledBody')
          : t('join.closedEndedBody'),
      );
      return;
    }
    Alert.alert(
      t('join.groupOnlyTitle'),
      t('join.groupOnlyBody'),
      [
        { text: t('common.close'), style: 'cancel' },
        {
          text: paid ? paidJoinButtonLabel(priceYen) : t('events.joinAction'),
          onPress: () => {
            pendingGroupChatRef.current = true;
            applyJoin();
          },
        },
      ],
    );
  };

  if (!event) return null;

  return (
    <View style={styles.sheetHost}>
      <KeyboardAvoidingScreen
        style={[styles.page, { paddingBottom: Math.max(insets.bottom, 0) }]}
      >
        <ConnectionBanner />
        <Animated.ScrollView
                showsVerticalScrollIndicator={false}
                bounces
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
                scrollEnabled={attendeeOverlay == null && !galleryFullscreen}
                onScroll={onScroll}
                scrollEventThrottle={16}
                contentContainerStyle={styles.scrollContent}
              >
                <EventImageGallery
                  uris={photos}
                  fallbackUri={
                    resolveDisplayImageUrl(event.imageUri) ||
                    sportFallbackUri(event.sport)
                  }
                  sport={event.sport}
                  scrollY={scrollY}
                  expandedHeight={EVENT_HEADER_EXPANDED}
                  collapsedHeight={EVENT_HEADER_COLLAPSED}
                  collapseRange={EVENT_HEADER_COLLAPSE_RANGE}
                  onFullscreenChange={setGalleryFullscreen}
                >
                  <View
                    style={[
                      styles.headerChrome,
                      { paddingTop: Math.max(insets.top, 8) + 4 },
                    ]}
                    pointerEvents="box-none"
                  >
                    <Pressable
                      style={styles.headerIconBtn}
                      onPress={closeDetail}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.back')}
                    >
                      <SymbolView
                        name={{
                          ios: 'chevron.left',
                          android: 'chevron_left',
                          web: 'chevron_left',
                        }}
                        tintColor="#FFFFFF"
                        size={20}
                        fallback={<Text style={styles.headerIconText}>‹</Text>}
                      />
                    </Pressable>

                    <Pressable
                      style={styles.headerHost}
                      onPress={club ? openClubProfile : undefined}
                      disabled={!club}
                      accessibilityRole={club ? 'button' : undefined}
                      accessibilityLabel={
                        club
                          ? t('events.overlay.clubProfileA11y', { name: club.name })
                          : event.host || t('events.hostFallback')
                      }
                    >
                      <HostAvatar
                        name={club?.name || event.host || t('events.hostBadge')}
                        imageUri={
                          club?.imageUri ??
                          club?.coverUri ??
                          event.hostImageUri
                        }
                        size={28}
                      />
                      <Text style={styles.headerHostName} numberOfLines={1}>
                        {club?.name || event.host || t('events.hostFallback')}
                      </Text>
                      {club ? (
                        <Pressable
                          style={styles.headerClubBtn}
                          onPress={openClubProfile}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel={t('join.openClub')}
                        >
                          <Text style={styles.headerClubBtnText}>Club ›</Text>
                        </Pressable>
                      ) : null}
                    </Pressable>

                    <View style={styles.headerRight}>
                      <Pressable
                        style={styles.headerIconBtn}
                        onPress={() => void shareEvent(event)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t('join.share')}
                      >
                        <SymbolView
                          name={{
                            ios: 'square.and.arrow.up',
                            android: 'ios_share',
                            web: 'ios_share',
                          }}
                          tintColor="#FFFFFF"
                          size={16}
                          fallback={<Text style={styles.headerIconText}>↗</Text>}
                        />
                      </Pressable>
                      <Pressable
                        style={styles.headerIconBtn}
                        onPress={() => {
                          if (!event) return;
                          const run = () => {
                            void (async () => {
                              try {
                                await toggleFavorite(event.id);
                              } catch (error) {
                                Alert.alert(
                                  t('join.favoriteFailedTitle'),
                                  error instanceof Error
                                    ? error.message
                                    : t('common.tryAgainLater'),
                                );
                              }
                            })();
                          };
                          if (!requireAuth(run, 'favorite-event')) return;
                          run();
                        }}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={
                          favorited ? t('join.favoriteRemove') : t('join.favoriteAdd')
                        }
                      >
                        <SymbolView
                          name={{
                            ios: favorited ? 'heart.fill' : 'heart',
                            android: favorited ? 'favorite' : 'favorite_border',
                            web: favorited ? 'favorite' : 'favorite_border',
                          }}
                          tintColor={favorited ? '#FF5A7A' : '#FFFFFF'}
                          size={16}
                          fallback={
                            <Text style={styles.headerIconText}>
                              {favorited ? '♥' : '♡'}
                            </Text>
                          }
                        />
                      </Pressable>
                    </View>
                  </View>
                </EventImageGallery>

                <View style={styles.body}>
                  <View style={styles.heroMeta}>
                                        <Text style={styles.title}>{displayTitle}</Text>

                    <View style={styles.tagsRow}>
                      {cancelled ? (
                        <View style={[styles.tag, styles.tagCancelled]}>
                          <Text style={styles.tagCancelledText}>{t('events.lifecycle.cancelled')}</Text>
                        </View>
                      ) : ended ? (
                        <View style={[styles.tag, styles.tagEnded]}>
                          <Text style={styles.tagEndedText}>{t('events.lifecycle.ended')}</Text>
                        </View>
                      ) : null}
                      <View style={[styles.tag, styles.tagBlue]}>
                        <Text style={styles.tagBlueText}>{t('join.safeJoinTag')}</Text>
                      </View>
                      <View
                        style={[
                          styles.tag,
                          cancelTagNoRefund ? styles.tagGray : styles.tagGreen,
                        ]}
                      >
                        <Text
                          style={
                            cancelTagNoRefund
                              ? styles.tagGrayText
                              : styles.tagGreenText
                          }
                        >
                          {cancelTag}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.tag,
                          paid ? styles.tagPaid : styles.tagFree,
                        ]}
                      >
                        <Text
                          style={paid ? styles.tagPaidText : styles.tagFreeText}
                        >
                          {paid
                            ? t('join.feeTag', { amount: formatYenAmount(priceYen) })
                            : t('join.feeFreeTag')}
                        </Text>
                      </View>
                      <View style={[styles.tag, styles.tagGray]}>
                        <SportIcon
                          sport={event.sport}
                          size={11}
                          color={categoryColor(event.sport)}
                        />
                        <Text
                          style={[
                            styles.tagGrayText,
                            { color: categoryColor(event.sport) },
                          ]}
                        >
                          {sportLabel(event.sport)} · {levelLabel(event.level)}
                        </Text>
                      </View>
                      {targetAgeGroups.map((group) => (
                        <View key={group} style={[styles.tag, styles.tagAge]}>
                          <TargetIcon
                            size={11}
                            color={theme.colors.iconActive}
                          />
                          <Text style={styles.tagAgeText}>{ageGroupLabel(group)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* 日時カード */}
                  <View style={styles.infoCard}>
                    <EventScheduleSection
                      event={event}
                      occurrenceEvents={
                        scheduleOccurrences.length > 1
                          ? scheduleOccurrences
                          : undefined
                      }
                      selectedEventId={
                        selectedOccurrenceId || event.id
                      }
                      onSelect={(selection) => {
                        const nextId = selection.eventId;
                        if (nextId && nextId !== selectedOccurrenceId) {
                          // ページ遷移なし。同一詳細内で開催回だけ差し替え
                          setSelectedOccurrenceId(nextId);
                          setSelectedSession(selection.session);
                          return;
                        }
                        setSelectedSession(selection.session);
                      }}
                    />

                    {event.registrationDeadlineOffset !== undefined ? (
                      <>
                        <View style={styles.infoDivider} />
                        <View style={styles.infoRow}>
                          <View style={styles.infoIconWrap}>
                            <HourglassIcon
                              size={16}
                              color={theme.colors.primaryDark}
                            />
                          </View>
                          <View style={styles.infoRowBody}>
                            <Text style={styles.infoLabel}>{t('join.registrationDeadline')}</Text>
                            <Text style={styles.infoValue}>
                              {formatDeadlineLabel(
                                event.registrationDeadlineOffset,
                              )}
                            </Text>
                          </View>
                        </View>
                      </>
                    ) : null}
                    <View style={styles.infoDivider} />
                    <View style={styles.infoRow}>
                      <View style={styles.infoIconWrap}>
                        <CancelPolicyIcon
                          size={16}
                          color={theme.colors.primaryDark}
                        />
                      </View>
                      <View style={styles.infoRowBody}>
                        <Text style={styles.infoLabel}>{t('join.cancelLabel')}</Text>
                        <Text style={styles.infoValue}>
                          {cancelPolicyCardText(event)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* 場所カード */}
                  <View style={styles.infoCard}>
                    <Pressable
                      style={styles.infoRow}
                      onPress={() => void openEventInMaps(event)}
                      accessibilityRole="link"
                      accessibilityLabel={t('join.openMeetingPlaceA11y')}
                    >
                      <View style={styles.infoIconWrap}>
                        <MapPinIcon
                          size={16}
                          color={theme.colors.primaryDark}
                        />
                      </View>
                      <View style={styles.infoRowBody}>
                        <Text style={styles.infoLabel}>{t('join.meetingPlace')}</Text>
                        <Text style={styles.infoValue}>
                          {meetingPlaceLabel ||
                            formatLocationLabel(
                              event.location,
                              event.locationNote,
                            ) ||
                            t('events.locationUnset')}
                        </Text>
                        <Text style={styles.mapHint}>
                          {t('join.tapToOpenMap')}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={styles.mapWrap}
                      onPress={() => void openEventInMaps(event)}
                      accessibilityRole="link"
                      accessibilityLabel={t('join.openMapA11y')}
                    >
                      <MiniMap
                        event={event}
                        placeLabel={
                          meetingPlaceLabel ||
                          preferredPlaceName(
                            event.location,
                            event.locationNote,
                          )
                        }
                      />
                    </Pressable>
                  </View>

                  {(itemsToBring.length > 0 || includedItems.length > 0) && (
                    <View style={styles.kitBlock}>
                      {itemsToBring.length > 0 ? (
                        <View style={styles.kitCard}>
                          <Text style={styles.kitKicker}>BRING</Text>
                          <Text style={styles.kitTitle}>{t('join.itemsToBring')}</Text>
                          {itemsToBring.map((item) => (
                            <View key={item} style={styles.kitRow}>
                              <View style={styles.kitDot} />
                              <Text style={styles.kitText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {includedItems.length > 0 ? (
                        <View style={[styles.kitCard, styles.kitCardIncluded]}>
                          <Text style={styles.kitKickerIncluded}>INCLUDED</Text>
                          <Text style={styles.kitTitle}>{t('join.itemsIncluded')}</Text>
                          {includedItems.map((item) => (
                            <View key={item} style={styles.kitRow}>
                              <Text style={styles.kitCheck}>✓</Text>
                              <Text style={styles.kitText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  )}

                  {/* 雰囲気 + 詳しい説明 */}
                  {targetAgeGroups.length > 0 ? (
                    <View style={styles.ageBanner}>
                      <View style={styles.ageBannerIconWrap}>
                        <TargetIcon
                          size={18}
                          color={theme.colors.accentDark}
                        />
                      </View>
                      <View style={styles.ageBannerBody}>
                        <Text style={styles.ageBannerLabel}>
                          {t('join.ageGroupLabel')}
                        </Text>
                        <View style={styles.ageBannerTags}>
                          {targetAgeGroups.map((group) => (
                            <View key={group} style={styles.ageBannerTag}>
                              <Text style={styles.ageBannerTagText}>
                                {ageGroupLabel(group)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  ) : null}
                  <EventContentSection text={contentBody} />

                  <View style={styles.statsCard}>
                    <Text style={styles.statsSectionTitle}>{t('join.attendees')}</Text>
                    <View style={styles.statsRow}>
                      <Pressable
                        style={styles.stat}
                        onPress={openAttendeeList}
                        accessibilityRole="button"
                        accessibilityLabel={t('join.joinedListA11y', { count: event.joinedCount })}
                      >
                        <Text style={styles.statValue}>
                          {event.joinedCount}
                        </Text>
                        <Text style={styles.statLabel}>{t('join.statJoined')}</Text>
                      </Pressable>
                      <View style={styles.statDivider} />
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{spotsLeft}</Text>
                        <Text style={styles.statLabel}>{t('join.statSpotsLeft')}</Text>
                      </View>
                      <View style={styles.statDivider} />
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{event.capacity}</Text>
                        <Text style={styles.statLabel}>{t('join.statCapacity')}</Text>
                      </View>
                    </View>
                    <EventAttendeesRow
                      attendees={attendees}
                      eventHost={event}
                      onPressAttendee={(person) =>
                        openAttendeeProfile(person)
                      }
                      onPressOverflow={openAttendeeList}
                    />
                  </View>
                  {isHost ? (
                    <>
                    <Pressable
                      onPress={openAttendeeList}
                      style={styles.checkInBanner}
                      accessibilityRole="button"
                      accessibilityLabel={t('join.checkInBannerA11y', {
                        checked: checkedInCount,
                        total: attendees.length,
                      })}
                    >
                      <View style={styles.checkInBannerCopy}>
                        <Text style={styles.checkInBannerKicker}>{t('join.hostTools')}</Text>
                        <Text style={styles.checkInBannerTitle}>
                          {t('join.attendeeListCheckIn')}
                        </Text>
                        <Text style={styles.checkInBannerSub}>
                          {t('join.checkInBannerSub', {
                            checked: checkedInCount,
                            total: attendees.length,
                          })}
                        </Text>
                      </View>
                      <Text style={styles.checkInBannerCta}>{t('join.open')}</Text>
                    </Pressable>
                    {!cancelled && !ended ? (
                      <Pressable
                        onPress={confirmHostCancel}
                        disabled={cancelBusy}
                        style={styles.cancelEventBanner}
                        accessibilityRole="button"
                        accessibilityLabel={t('join.cancelEventA11y')}
                      >
                        <View style={styles.checkInBannerCopy}>
                          <Text style={styles.cancelEventKicker}>
                            {t('join.hostTools')}
                          </Text>
                          <Text style={styles.cancelEventTitle}>
                            {t('join.cancelEvent')}
                          </Text>
                          <Text style={styles.cancelEventSub}>
                            {paid
                              ? t('join.cancelEventSubPaid')
                              : t('join.cancelEventSubFree')}
                          </Text>
                        </View>
                        <Text style={styles.cancelEventCta}>
                          {cancelBusy ? t('join.processing') : t('events.lifecycle.cancelled')}
                        </Text>
                      </Pressable>
                    ) : null}
                    </>
                  ) : null}

                  {/* 下部固定バー分の余白 */}
                  <View style={{ height: 96 }} />
                </View>
              </Animated.ScrollView>

              {/* 下部スティッキーCTA — Group / Chat / Share + Join */}
              <View
                style={[
                  styles.bottomBar,
                  { paddingBottom: Math.max(insets.bottom, 12) },
                ]}
              >
                <View style={styles.sideActions}>
                  {activeJoined && !isHost ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.sideAction,
                        pressed && styles.sideActionPressed,
                      ]}
                      onPress={() => router.push(ticketHref(event.id))}
                      accessibilityRole="button"
                      accessibilityLabel={t('join.openTicketA11y')}
                    >
                      <View style={styles.sideIconWrap}>
                        <SymbolView
                          name={{
                            ios: 'ticket.fill',
                            android: 'confirmation_number',
                            web: 'confirmation_number',
                          }}
                          tintColor={theme.colors.text}
                          size={22}
                          fallback={<Text style={styles.sideFallback}>🎫</Text>}
                        />
                      </View>
                      <Text style={styles.sideLabel}>Ticket</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={({ pressed }) => [
                      styles.sideAction,
                      !canUseGroupChat && styles.sideActionLocked,
                      pressed && styles.sideActionPressed,
                    ]}
                    onPress={openGroupChat}
                    accessibilityRole="button"
                    accessibilityLabel={
                      canUseGroupChat
                        ? groupUnread > 0
                          ? t('join.groupChatUnreadA11y', { count: groupUnread })
                          : t('join.groupChatA11y')
                        : t('join.groupChatLockedA11y')
                    }
                  >
                    <View style={styles.sideIconWrap}>
                      <SymbolView
                        name={{
                          ios: 'person.2.fill',
                          android: 'groups',
                          web: 'groups',
                        }}
                        tintColor={theme.colors.text}
                        size={22}
                        fallback={<Text style={styles.sideFallback}>👥</Text>}
                      />
                      {groupUnreadLabel != null ? (
                        <View style={styles.sideUnreadBadge}>
                          <Text style={styles.sideUnreadBadgeText}>
                            {groupUnreadLabel}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.sideLabel}>Group</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.sideAction,
                      pressed && styles.sideActionPressed,
                    ]}
                    onPress={() => openChatRoom('host')}
                    accessibilityRole="button"
                    accessibilityLabel={
                      hostUnread > 0
                        ? t('join.messageHostUnreadA11y', { count: hostUnread })
                        : t('join.messageHostA11y')
                    }
                  >
                    <View style={styles.sideIconWrap}>
                      <SymbolView
                        name={{
                          ios: 'bubble.left.fill',
                          android: 'chat',
                          web: 'chat',
                        }}
                        tintColor={theme.colors.text}
                        size={22}
                        fallback={
                          <ChatIcon size={22} color={theme.colors.text} />
                        }
                      />
                      {hostUnreadLabel != null ? (
                        <View style={styles.sideUnreadBadge}>
                          <Text style={styles.sideUnreadBadgeText}>
                            {hostUnreadLabel}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.sideLabel}>Chat</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.sideAction,
                      pressed && styles.sideActionPressed,
                    ]}
                    onPress={() => void shareEvent(event)}
                    accessibilityRole="button"
                    accessibilityLabel={t('join.shareEventA11y')}
                  >
                    <SymbolView
                      name={{
                        ios: 'square.and.arrow.up',
                        android: 'ios_share',
                        web: 'ios_share',
                      }}
                      tintColor={theme.colors.text}
                      size={22}
                      fallback={<Text style={styles.sideFallback}>↗</Text>}
                    />
                    <Text style={styles.sideLabel}>Share</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.joinBtn,
                    activeJoined && !isHost && !ended && styles.joinBtnJoined,
                    (showEndedCta ||
                      (joinClosed && !canWatchVacancies) ||
                      (isHost && (cancelled || ended || cancelBusy))) &&
                      styles.joinBtnClosed,
                    isHost && !cancelled && !ended && styles.joinBtnHostCancel,
                    // 空き通知は最後に適用（他スタイルで黒潰れしないようにする）
                    canWatchVacancies &&
                      (watchingVacancies
                        ? styles.joinBtnWatchOn
                        : styles.joinBtnWatch),
                    pressed && styles.joinBtnPressed,
                  ]}
                  onPress={() => {
                    if (isHost) {
                      confirmHostCancel();
                      return;
                    }
                    if (showEndedCta && !(ALLOW_JOIN_PAST_EVENTS && !activeJoined)) {
                      return;
                    }
                    if (canWatchVacancies && event) {
                      const run = () => {
                        void (async () => {
                          try {
                            const nowWatching = await toggleWatchlist(event.id);
                            if (nowWatching) {
                              setToast(
                                t('join.watchEnabledToast'),
                              );
                            } else {
                              setToast(t('join.watchDisabledToast'));
                            }
                          } catch (error) {
                            Alert.alert(
                              t('join.watchFailedTitle'),
                              error instanceof Error
                                ? error.message
                                : t('common.tryAgainLater'),
                            );
                          }
                        })();
                      };
                      if (!requireAuth(run, 'watchlist-event')) return;
                      run();
                      return;
                    }
                    applyJoin();
                  }}
                  disabled={
                    (showEndedCta &&
                      !(ALLOW_JOIN_PAST_EVENTS && !activeJoined)) ||
                    (!canWatchVacancies && joinClosed) ||
                    (isHost && (cancelled || ended || cancelBusy))
                  }
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled:
                      (showEndedCta &&
                        !(ALLOW_JOIN_PAST_EVENTS && !activeJoined)) ||
                      (!canWatchVacancies && joinClosed) ||
                      (isHost && (cancelled || ended || cancelBusy)),
                  }}
                  accessibilityLabel={
                    isHost
                      ? cancelled
                        ? t('join.eventCancelledNotice')
                        : ended
                          ? t('events.lifecycle.ended')
                          : t('join.cancelEventA11y')
                      : cancelled
                        ? t('join.eventCancelledNotice')
                        : showEndedCta &&
                            !(ALLOW_JOIN_PAST_EVENTS && !activeJoined)
                          ? t('events.lifecycle.ended')
                          : canWatchVacancies
                            ? watchingVacancies
                              ? t('join.watchOff')
                              : t('join.watchOn')
                            : joinClosed
                              ? t('events.fullClosed')
                              : activeJoined
                                ? t('join.cancelButton')
                                : isFull
                                  ? t('events.fullClosed')
                                  : paid
                                    ? paidJoinButtonLabel(priceYen)
                                    : freeJoinButtonLabel()
                  }
                >
                  {activeJoined && !joinClosed && !ended && !isHost ? (
                    <HostAvatar
                      name={displayName}
                      imageUri={userProfile.imageUri}
                      gender={userProfile.gender}
                      size={22}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.joinBtnText,
                      activeJoined &&
                        !isHost &&
                        !ended &&
                        styles.joinBtnTextJoined,
                      (showEndedCta ||
                        (joinClosed && !canWatchVacancies)) &&
                        styles.joinBtnTextClosed,
                      isHost &&
                        !cancelled &&
                        !ended &&
                        styles.joinBtnTextHostCancel,
                      paid &&
                        !activeJoined &&
                        !joinClosed &&
                        !ended &&
                        !isHost &&
                        !canWatchVacancies &&
                        styles.joinBtnTextPaid,
                      !paid &&
                        !activeJoined &&
                        !joinClosed &&
                        !ended &&
                        !isHost &&
                        !canWatchVacancies &&
                        styles.joinBtnTextPaid,
                      // 空き通知テキスト色は最後に確定
                      canWatchVacancies &&
                        (watchingVacancies
                          ? styles.joinBtnTextWatchOn
                          : styles.joinBtnTextWatch),
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {cancelled
                      ? t('join.eventCancelledNotice')
                      : isHost
                        ? ended
                          ? t('events.lifecycle.ended')
                          : cancelBusy
                            ? t('join.cancelProcessing')
                            : t('join.cancelEvent')
                        : showEndedCta &&
                            !(ALLOW_JOIN_PAST_EVENTS && !activeJoined)
                          ? t('events.lifecycle.ended')
                          : canWatchVacancies
                            ? watchingVacancies
                              ? t('join.watchOff')
                              : t('join.watchOn')
                            : joinClosed
                              ? t('events.fullClosed')
                              : activeJoined
                                ? t('join.joinedCancelLabel', { name: displayName })
                                : isFull
                                  ? t('events.fullClosed')
                                  : paid
                                    ? paidJoinButtonLabel(priceYen)
                                    : freeJoinButtonLabel()}
                  </Text>
                </Pressable>
              </View>
      </KeyboardAvoidingScreen>
      <AttendeeProfileOverlay
        visible={attendeeOverlay != null}
        mode={attendeeOverlay === 'list' ? 'list' : 'profile'}
        attendees={attendees}
        selected={selectedAttendee}
        clubs={selectedAttendeeClubs}
        clubsLoading={clubsLoading}
        joinedCount={event.joinedCount}
        capacity={event.capacity}
        hostMode={isHost}
        eventHost={event}
        checkedInIds={checkedIn}
        onToggleCheckIn={(person) => {
          if (!event) return;
          toggleCheckIn(event.id, person.id);
        }}
        onClose={closeAttendeeOverlay}
        onSelect={(person) => openAttendeeProfile(person, true)}
        onBackToList={profileFromList ? openAttendeeList : undefined}
        onOpenClub={openClubFromAttendee}
        onBlock={blockPerson}
        onUnblock={unblockPerson}
        isBlocked={
          selectedAttendee ? isBlocked(selectedAttendee.id) : false
        }
      />
      <PaymentCheckoutSheet
        visible={paying}
        event={checkoutEvent}
        selectedSession={
          selectedSession ??
          (checkoutEvent ? sessionFromEvent(checkoutEvent) : null)
        }
        amountYen={priceYen}
        onClose={() => setPaying(false)}
        onConfirm={(receipt) => {
          setPaying(false);
          const target = checkoutEvent ?? event;
          if (!target) return;
          const ticketQuantity = Math.max(
            1,
            Math.floor(Number(receipt.quantity) || 1),
          );
          if (receipt.mode === 'paid' && receipt.paymentIntentId) {
            recordEventPayment({
              eventId: target.id,
              amountYen: receipt.amountYen,
              paymentIntentId: receipt.paymentIntentId,
              status: 'paid',
              ticketQuantity,
            });
            void recordTicketSale({
              eventId: target.id,
              amountYen: receipt.amountYen,
              ticketQuantity,
              paymentIntentId: receipt.paymentIntentId,
              eventTitle: target.title,
              eventDate: target.date,
              eventEndsAt: eventEndAt(target).toISOString(),
            });
          } else if (receipt.mode === 'free') {
            // 無料でも枚数を保持してキャンセル時に枠を戻す
            recordEventPayment({
              eventId: target.id,
              amountYen: 0,
              paymentIntentId: `free_${target.id}`,
              status: 'paid',
              ticketQuantity,
            });
          }
          if (__DEV__ && Object.keys(receipt.answers).length > 0) {
            console.log('[join] pre-question answers', receipt.answers);
          }
          void (async () => {
            const result = await performJoin({ ticketQuantity });
            if (result === 'joined') {
              // 決済シート閉鎖後、完了演出へスムーズに遷移
              requestAnimationFrame(() => {
                setJoinSuccessVisible(true);
              });
            } else if (result === 'full') {
              Alert.alert(
                t('events.fullClosed'),
                receipt.mode === 'paid'
                  ? t('join.fullAfterPayment')
                  : t('join.fullNoPayment'),
              );
            } else if (result === 'unchanged') {
              Alert.alert(
                t('join.registerFailedTitle'),
                receipt.mode === 'paid'
                  ? t('join.registerFailedPaidBody')
                  : t('join.registerFailedBody'),
              );
            }
          })();
        }}
      />
      <JoinSuccessScreen
        visible={joinSuccessVisible}
        event={checkoutEvent ?? event}
        onClose={() => setJoinSuccessVisible(false)}
        onViewTicket={() => {
          const id = (checkoutEvent ?? event)?.id;
          setJoinSuccessVisible(false);
          if (id) router.push(ticketHref(id));
        }}
        onViewEvent={() => {
          // 完了画面を閉じ、下にあるイベント詳細へ戻る
          setJoinSuccessVisible(false);
        }}
        onOpenGroupChat={() => {
          setJoinSuccessVisible(false);
          openChatRoom('group');
        }}
        onGoHome={() => {
          setJoinSuccessVisible(false);
          closeDetail();
          router.replace('/(tabs)/home');
        }}
      />
      {leaveConfirmVisible ? (
      <AppModal
        visible
        transparent
        animationType="fade"
        onRequestClose={dismissLeaveConfirm}
      >
        <View style={styles.confirmRoot} pointerEvents="box-none">
          <Pressable
            style={styles.confirmBackdrop}
            onPress={dismissLeaveConfirm}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View
            style={styles.confirmCard}
            accessibilityRole="alert"
            accessibilityLabel={
              leaveConfirmDetail
                ? `${CANCEL_CONFIRM_TITLE} ${leaveConfirmDetail.text}`
                : CANCEL_CONFIRM_TITLE
            }
          >
            <Text style={styles.confirmTitle}>{CANCEL_CONFIRM_TITLE}</Text>
            {leaveConfirmDetail ? (
              <Text
                style={
                  leaveConfirmDetail.kind === 'forfeit'
                    ? styles.confirmNotice
                    : styles.confirmRefund
                }
              >
                {leaveConfirmDetail.text}
              </Text>
            ) : null}
            <View style={styles.confirmActions}>
              <Pressable
                style={[
                  styles.confirmSecondary,
                  leaveBusy && styles.confirmBtnDisabled,
                ]}
                onPress={dismissLeaveConfirm}
                disabled={leaveBusy}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Text style={styles.confirmSecondaryText}>{t('common.close')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmPrimary,
                  leaveBusy && styles.confirmBtnDisabled,
                ]}
                onPress={confirmLeaveAndLeave}
                disabled={leaveBusy}
                accessibilityRole="button"
                accessibilityLabel={t('join.confirmCancel')}
              >
                {leaveBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmPrimaryText}>{t('join.confirmCancel')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </AppModal>
      ) : null}
      {roomMode ? (
        <AppModal
          visible
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => {
            setRoomMode(null);
            setRoomDmUserId(null);
          }}
        >
          <ChatRoomScreen
            event={event}
            mode={roomMode}
            dmUserId={roomDmUserId}
            onBack={() => {
              setRoomMode(null);
              setRoomDmUserId(null);
            }}
            onOpenEvent={() => {
              setRoomMode(null);
              setRoomDmUserId(null);
            }}
          />
        </AppModal>
      ) : null}
      <SaveToast
        message={toast}
        bottomOffset={Math.max(insets.bottom, 12) + 72}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheetHost: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
  },
  page: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingBottom: 8,
  },
  headerChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerHost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  headerHostName: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerClubBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  headerClubBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  body: {
    marginTop: -18,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 0,
    backgroundColor: theme.colors.surfaceAlt,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    zIndex: 2,
  },
  heroMeta: {
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    lineHeight: 30,
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  tag: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagBlue: {
    backgroundColor: '#E8F1FF',
  },
  tagBlueText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },
  tagGreen: {
    backgroundColor: theme.colors.primarySoft,
  },
  tagGreenText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  tagFree: {
    backgroundColor: '#EEF2FF',
  },
  tagFreeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4338CA',
  },
  tagPaid: {
    backgroundColor: '#FEF3C7',
  },
  tagPaidText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  tagGray: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
  },
  tagGrayText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  tagEnded: {
    backgroundColor: '#EEF0F3',
  },
  tagEndedText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  tagCancelled: {
    backgroundColor: '#FEE2E2',
  },
  tagCancelledText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.danger,
  },
  tagAge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
  },
  tagAgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C2410C',
  },
  ageBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  ageBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ageBannerBody: {
    flex: 1,
    minWidth: 0,
  },
  ageBannerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C2410C',
    letterSpacing: 0.2,
  },
  ageBannerTags: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  ageBannerTag: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  ageBannerTagText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
  },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  seriesBlock: {
    gap: 8,
  },
  seriesTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
  },
  seriesHint: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  seriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
  },
  seriesWhen: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  seriesMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  seriesChevron: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  infoRowBody: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    lineHeight: 22,
  },
  mapHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primaryDark,
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginVertical: 14,
  },
  mapWrap: {
    marginTop: 14,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    // Web: 親に高さがないと iframe 地図が 0 高さでグレーになる
    ...(Platform.OS === 'web'
      ? { height: 200, minHeight: 200, width: '100%' as const }
      : null),
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 8,
  },
  kitBlock: {
    gap: 10,
    marginBottom: 14,
  },
  kitCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  kitCardIncluded: {
    backgroundColor: theme.colors.primaryMuted,
    borderColor: theme.colors.primarySoft,
  },
  kitKicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  kitKickerIncluded: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: theme.colors.primaryDark,
    marginBottom: 4,
  },
  kitTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 10,
  },
  kitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  kitDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.textMuted,
  },
  kitCheck: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.primaryDark,
    width: 14,
  },
  kitText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    lineHeight: 20,
  },
  descriptionMuted: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.textMuted,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    marginBottom: 4,
  },
  statsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  statsSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 12,
  },
  checkInBanner: {
    marginTop: -4,
    marginBottom: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primaryDark,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkInBannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  checkInBannerKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: 0.4,
  },
  checkInBannerTitle: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  checkInBannerSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.82)',
  },
  checkInBannerCta: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.primaryDark,
    backgroundColor: theme.colors.primary,
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelEventBanner: {
    marginTop: -2,
    marginBottom: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelEventKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B91C1C',
    letterSpacing: 0.4,
  },
  cancelEventTitle: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.danger,
  },
  cancelEventSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  cancelEventCta: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    backgroundColor: theme.colors.danger,
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  sideActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideAction: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    gap: 2,
  },
  sideActionPressed: {
    opacity: 0.65,
  },
  sideActionLocked: {
    opacity: 0.4,
  },
  sideIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideUnreadBadge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.surface,
    zIndex: 2,
  },
  sideUnreadBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 12,
  },
  sideLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  sideFallback: {
    fontSize: 18,
    lineHeight: 22,
    color: theme.colors.text,
  },
  joinBtn: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginLeft: 4,
    overflow: 'hidden',
  },
  joinBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  joinBtnWatch: {
    paddingHorizontal: 12,
    gap: 4,
    backgroundColor: theme.colors.primaryDark,
    borderWidth: 1.5,
    borderColor: theme.colors.primaryDark,
  },
  joinBtnWatchOn: {
    paddingHorizontal: 12,
    gap: 4,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1.5,
    borderColor: theme.colors.primaryDark,
  },
  joinBtnJoined: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },

  joinBtnClosed: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  joinBtnHostCancel: {
    backgroundColor: theme.colors.danger,
  },
  joinBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  joinBtnTextWatch: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    color: theme.colors.onPrimary,
  },
  joinBtnTextWatchOn: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    color: theme.colors.primaryDark,
  },
  joinBtnTextJoined: {
    color: theme.colors.textSecondary,
  },

  joinBtnTextClosed: {
    color: theme.colors.textMuted,
  },
  joinBtnTextHostCancel: {
    color: '#FFFFFF',
  },
  joinBtnTextPaid: {
    fontSize: 13,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  confirmRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
    zIndex: 1,
    pointerEvents: 'auto',
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
    lineHeight: 24,
  },
  confirmNotice: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.danger,
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmRefund: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primaryDark,
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  confirmSecondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  confirmSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  confirmPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.danger,
  },
  confirmPrimaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
});
