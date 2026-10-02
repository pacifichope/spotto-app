import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';

import type { CreateEventPayload } from '@/components/createEventSheetTypes';
import {
    ALLOW_JOIN_PAST_EVENTS,
} from '@/lib/devTestFlags';
import {
    applyToggleJoin,
    getDevSampleEvents,
    isEventCancelled,
    isEventPast,
    isHostedEventArchived,
    mergeWithDevSampleEvents,
    sortEventsUpcomingThenPast,
    sortPastEventsNewestFirst,
    type JoinActionResult,
    type SportEvent,
} from '@/lib/events';
import {
    findNgWordInCreatePayload,
    NG_WORD_ERROR_MESSAGE,
} from '@/lib/ngWords';
import i18n, { getCurrentAppLanguage } from '@/lib/i18n';

import type { EventAttendee } from '@/lib/attendees';
import { isRemoteEventId } from '@/lib/chatsRemote';
import {
    checkInIdSet,
    loadCheckInsByEvent,
    saveCheckInsByEvent,
    toggleCheckInRecords,
    type CheckInsByEvent,
} from '@/lib/checkins';
import {
    clearEventDrafts,
    loadEventDrafts,
    removeEventDraft,
    saveEventDrafts,
    upsertEventDraft,
    type EventDraft,
    type EventDraftSnapshot,
} from '@/lib/eventDrafts';
import {
    ensureHostParticipant,
    fetchEventParticipants,
    fetchEventParticipantsBatch,
    fetchMyParticipationIds,
    joinEventRemote,
    leaveEventRemote,
} from '@/lib/eventParticipantsRemote';
import {
    cancelRemoteEvent,
    fetchRemoteEventById,
    fetchRemoteEvents,
    insertRemoteEvent,
    resolveAuthUserId,
    updateRemoteHostProfileFields,
} from '@/lib/eventsRemote';
import { requestEventTranslation } from '@/lib/eventTranslateRemote';
import {
    loadFavoriteEventIds,
    saveFavoriteEventIds,
} from '@/lib/favorites';
import {
    addFavoriteRemote,
    fetchFavoriteEventIds,
    removeFavoriteRemote,
} from '@/lib/favoritesRemote';
import {
    clearHostedEventsSnapshot,
    collectHostedEventsForPersistence,
    loadHostedEventsSnapshot,
    mergeSampleAndHostedEvents,
    saveHostedEventsSnapshot,
} from '@/lib/hostedEventsStore';
import { fetchClubRow, upsertClubRow } from '@/lib/clubsTableRemote';
import {
    EMPTY_ORGANIZER_PROFILE,
    hasOrganizerName,
    isHostedByMe,
    organizerDisplayName,
    sanitizeOrganizerProfile,
    type OrganizerProfile,
} from '@/lib/organizerProfile';
import {
    clearOrganizerProfile,
    loadOrganizerProfile,
    saveOrganizerProfile,
} from '@/lib/organizerProfileStore';
import { notifyEventUpdatePush } from '@/lib/pushNotifications';
import { showNetworkErrorAlert, userFacingNetworkError } from '@/lib/safeAsync';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
    loadWatchlistEventIds,
    saveWatchlistEventIds,
} from '@/lib/watchlist';
import {
    addWatchlistRemote,
    fetchWatchlistEventIds,
    removeWatchlistRemote,
} from '@/lib/watchlistRemote';

type EventPaymentRecord = {
  eventId: string;
  amountYen: number;
  paymentIntentId: string;
  status: 'paid' | 'refunded';
  /** 購入枚数（残数連動・キャンセル時の枠解放用） */
  ticketQuantity?: number;
};

export type { EventPaymentRecord };

export type ToggleJoinOptions = {
  ticketQuantity?: number;
};

export type CreateEventResult =
  | { ok: true; event: SportEvent; events: SportEvent[] }
  | { ok: false; error: string };

type EventsContextValue = {
  events: SportEvent[];
  joinedIds: Set<string>;
  hostedIds: Set<string>;
  drafts: EventDraft[];
  favoriteIds: Set<string>;
  /** 満員イベントの空き通知希望（ウォッチリスト） */
  watchlistIds: Set<string>;
  checkInsByEvent: CheckInsByEvent;
  organizerProfile: OrganizerProfile;
  updateOrganizerProfile: (
    profile: OrganizerProfile,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  toggleJoin: (
    id: string,
    options?: ToggleJoinOptions,
  ) => Promise<JoinActionResult>;
  loadEventParticipants: (eventId: string) => Promise<EventAttendee[]>;
  /**
   * ホーム一覧向け: 未取得のイベント参加者を一括プリロード。
   * 取得済み（空配列含む）はスキップ。
   */
  preloadEventParticipants: (eventIds: string[]) => Promise<void>;
  participantsForEvent: (eventId: string) => EventAttendee[];
  /** 参加者一覧を一度でも取得済みか（空でも true） */
  hasParticipantsLoaded: (eventId: string) => boolean;
  isParticipating: (eventId: string) => boolean;
  refreshMyParticipations: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<boolean>;
  refreshMyFavorites: () => Promise<void>;
  toggleWatchlist: (id: string) => Promise<boolean>;
  refreshMyWatchlist: () => Promise<void>;
  toggleCheckIn: (eventId: string, attendeeId: string) => boolean;
  checkedInIds: (eventId: string) => Set<string>;
  recordEventPayment: (payment: EventPaymentRecord) => void;
  eventPayment: (eventId: string) => EventPaymentRecord | undefined;
  markEventRefunded: (eventId: string) => void;
  cancelHostedEvent: (
    eventId: string,
    reason?: string,
  ) => Promise<SportEvent | null>;
  createEvent: (payload: CreateEventPayload) => Promise<CreateEventResult>;
  refreshEvents: () => Promise<void>;
  /** 一覧に無い公開イベントを ID 指定で取得して state に載せる */
  ensureRemoteEvent: (eventId: string) => Promise<SportEvent | null>;
  eventsLoading: boolean;
  eventsSaving: boolean;
  /** 直近の一覧取得エラー（なければ null） */
  eventsError: string | null;
  clearEventsError: () => void;
  currentUserId: string | null;
  saveEventDraft: (snapshot: EventDraftSnapshot, id?: string) => EventDraft;
  deleteEventDraft: (id: string) => void;
  resetAccountData: () => void;
  clearParticipantSessionData: () => void;
  hydrateParticipantSessionData: () => Promise<void>;
  now: Date;
  joinedEvents: SportEvent[];
  hostedEvents: SportEvent[];
  upcomingJoinedEvents: SportEvent[];
  upcomingHostedEvents: SportEvent[];
  pastJoinedEvents: SportEvent[];
  pastHostedEvents: SportEvent[];
  favoriteEvents: SportEvent[];
  pastHistoryEvents: SportEvent[];
};

const EventsContext = createContext<EventsContextValue | null>(null);

const LEGACY_DEMO_PARTICIPANT_IDS = new Set([
  'demo-past-run-july',
  'demo-past-yoga-sept',
  'demo-harajuku-morning',
  'demo-past-badminton-aug',
  'demo-full-closed-hoops',
  'demo-free-yoga-omotesando',
  'demo-harajuku-weekend',
  'demo-ebisu-friday',
]);

function hostedIdsFromEvents(
  events: SportEvent[],
  currentUserId: string | null,
) {
  const next = new Set<string>();
  const uid = currentUserId?.trim();
  if (!uid) return next;
  for (const event of events) {
    if (event.hostId === uid) next.add(event.id);
  }
  return next;
}

export function EventsProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date());
  // 本番は空配列スタート（リモート取得までサンプルを出さない）
  const [events, setEvents] = useState<SportEvent[]>(() =>
    __DEV__ ? getDevSampleEvents() : [],
  );
  const [joinedIds, setJoinedIds] = useState<Set<string>>(() => new Set());
  const [hostedIds, setHostedIds] = useState<Set<string>>(() => new Set());
  const [eventPayments, setEventPayments] = useState<
    Record<string, EventPaymentRecord>
  >({});
  const [ticketQuantityByEvent, setTicketQuantityByEvent] = useState<
    Record<string, number>
  >({});
  const ticketQuantityRef = useRef(ticketQuantityByEvent);
  ticketQuantityRef.current = ticketQuantityByEvent;
  const [organizerProfile, setOrganizerProfile] = useState<OrganizerProfile>(
    EMPTY_ORGANIZER_PROFILE,
  );
  const [drafts, setDrafts] = useState<EventDraft[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [checkInsByEvent, setCheckInsByEvent] = useState<CheckInsByEvent>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsSaving, setEventsSaving] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [participantsByEvent, setParticipantsByEvent] = useState<
    Record<string, EventAttendee[]>
  >({});
  const participantsByEventRef = useRef(participantsByEvent);
  participantsByEventRef.current = participantsByEvent;
  const preloadInFlightRef = useRef<Set<string>>(new Set());
  const eventsRef = useRef(events);
  const joinedRef = useRef(joinedIds);
  const organizerRef = useRef(organizerProfile);
  eventsRef.current = events;
  joinedRef.current = joinedIds;
  const hostedIdsRef = useRef(hostedIds);
  hostedIdsRef.current = hostedIds;
  organizerRef.current = organizerProfile;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const hydrateDoneRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const applyEventsList = useCallback(
    (
      nextEvents: SportEvent[],
      userId: string | null = currentUserIdRef.current,
    ) => {
      const nextHosted = hostedIdsFromEvents(nextEvents, userId);
      eventsRef.current = nextEvents;
      hostedIdsRef.current = nextHosted;
      setEvents(nextEvents);
      setHostedIds(nextHosted);
      if (hydrateDoneRef.current) {
        const uid = userId?.trim() || currentUserIdRef.current;
        if (uid) {
          void saveHostedEventsSnapshot(
            uid,
            collectHostedEventsForPersistence(nextEvents, nextHosted),
          );
        }
      }
    },
    [],
  );

  const clearEventsError = useCallback(() => setEventsError(null), []);

  const refreshEvents = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setEventsLoading(false);
      if (__DEV__) {
        applyEventsList(getDevSampleEvents(), currentUserIdRef.current);
      }
      return;
    }
    setEventsLoading(true);
    setEventsError(null);
    try {
      const remote = await fetchRemoteEvents();
      if (!remote.ok) {
        setEventsError(userFacingNetworkError(remote.error));
        if (__DEV__) {
          console.warn('[events] fetch failed', remote.error);
          // 開発中はモックを残してマップ／リストを空にしない
          applyEventsList(getDevSampleEvents(), currentUserIdRef.current);
        }
        return;
      }
      applyEventsList(
        mergeWithDevSampleEvents(remote.data),
        currentUserIdRef.current,
      );
    } catch (error) {
      setEventsError(userFacingNetworkError(error));
      if (__DEV__) {
        console.warn('[events] fetch threw', error);
        applyEventsList(getDevSampleEvents(), currentUserIdRef.current);
      }
    } finally {
      setEventsLoading(false);
    }
  }, [applyEventsList]);

  const ensureRemoteEvent = useCallback(
    async (eventId: string): Promise<SportEvent | null> => {
      const id = String(eventId || '').trim();
      if (!id) return null;
      const existing = eventsRef.current.find((item) => item.id === id);
      if (existing) return existing;
      if (!isSupabaseConfigured()) return null;

      const remote = await fetchRemoteEventById(id);
      if (!remote.ok) {
        if (__DEV__) console.warn('[events] ensureRemoteEvent', remote.error);
        return null;
      }
      if (!remote.data) return null;

      setEvents((prev) => {
        if (prev.some((item) => item.id === id)) {
          eventsRef.current = prev;
          return prev;
        }
        const next = [remote.data!, ...prev];
        eventsRef.current = next;
        const nextHosted = hostedIdsFromEvents(next, currentUserIdRef.current);
        hostedIdsRef.current = nextHosted;
        setHostedIds(nextHosted);
        return next;
      });
      return remote.data;
    },
    [],
  );

  const applyOrganizerProfile = useCallback((next: OrganizerProfile) => {
    const sanitized = sanitizeOrganizerProfile(next);
    organizerRef.current = sanitized;
    setOrganizerProfile(sanitized);
    return sanitized;
  }, []);

  /** 自分主催イベントから主催者プロフィールを復元（キャッシュ欠落時のフォールバック） */
  const organizerFromHostedEvents = useCallback(
    (list: SportEvent[], userId: string | null): OrganizerProfile | null => {
      const uid = userId?.trim();
      if (!uid) return null;
      const mine = list.find(
        (event) =>
          event.hostId === uid &&
          String(event.host || '').trim() &&
          event.host !== 'You',
      );
      if (!mine) return null;
      return sanitizeOrganizerProfile({
        name: mine.host,
        imageUri: mine.hostImageUri,
        bio: mine.hostBio || '',
        snsLinks: mine.hostSnsLinks || [],
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!currentUserId) {
        applyOrganizerProfile(EMPTY_ORGANIZER_PROFILE);
        return;
      }
      const stored = await loadOrganizerProfile(currentUserId);
      if (cancelled) return;

      let next = hasOrganizerName(stored)
        ? stored
        : organizerFromHostedEvents(eventsRef.current, currentUserId) ??
          EMPTY_ORGANIZER_PROFILE;

      // clubs テーブルからカバーを補完
      if (isSupabaseConfigured()) {
        const remoteClub = await fetchClubRow(currentUserId);
        if (!cancelled && remoteClub.ok && remoteClub.data) {
          next = sanitizeOrganizerProfile({
            ...next,
            name: remoteClub.data.name || next.name,
            imageUri: remoteClub.data.image_url || next.imageUri,
            coverUri: remoteClub.data.cover_image_url || next.coverUri,
            bio: remoteClub.data.bio || next.bio,
          });
        }
      }

      if (cancelled) return;
      applyOrganizerProfile(next);
      if (hasOrganizerName(next)) {
        void saveOrganizerProfile(currentUserId, next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, applyOrganizerProfile, organizerFromHostedEvents]);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    void (async () => {
      const { waitForInitialFirebaseAuthUser, subscribeFirebaseAuth } =
        await import('@/lib/firebaseAuthSession');
      if (cancelled) return;
      const initial = await waitForInitialFirebaseAuthUser();
      if (!cancelled) {
        setCurrentUserId(initial?.id ?? null);
      }
      unsub = subscribeFirebaseAuth((user) => {
        setCurrentUserId(user?.id ?? null);
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const nextHosted = hostedIdsFromEvents(eventsRef.current, currentUserId);
    hostedIdsRef.current = nextHosted;
    setHostedIds(nextHosted);
  }, [currentUserId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [checkInsLoaded, favoritesLoaded] = await Promise.all([
        loadCheckInsByEvent(),
        loadFavoriteEventIds(),
      ]);
      if (cancelled) return;

      const cleanedFavorites = favoritesLoaded.filter(
        (id) => !LEGACY_DEMO_PARTICIPANT_IDS.has(id),
      );
      if (cleanedFavorites.length !== favoritesLoaded.length) {
        void saveFavoriteEventIds(cleanedFavorites);
      }

      // 下書き・主催キャッシュは userId スコープ。ログイン後の effect で読み込む
      setDrafts([]);
      setCheckInsByEvent(checkInsLoaded);
      setFavoriteIds(new Set());
      joinedRef.current = new Set();
      setJoinedIds(new Set());

      eventsRef.current = __DEV__ ? getDevSampleEvents() : [];
      setEvents(__DEV__ ? getDevSampleEvents() : []);
      hydrateDoneRef.current = true;

      if (isSupabaseConfigured()) {
        try {
          const remote = await fetchRemoteEvents();
          if (cancelled) return;
          if (remote.ok) {
            applyEventsList(
              mergeWithDevSampleEvents(remote.data),
              currentUserIdRef.current,
            );
            setEventsError(null);
            const uid = currentUserIdRef.current;
            if (uid && !hasOrganizerName(organizerRef.current)) {
              const fromEvents = organizerFromHostedEvents(remote.data, uid);
              if (fromEvents && hasOrganizerName(fromEvents)) {
                applyOrganizerProfile(fromEvents);
                void saveOrganizerProfile(uid, fromEvents);
              }
            }
          } else {
            setEventsError(userFacingNetworkError(remote.error));
            if (__DEV__) {
              console.warn('[events] initial fetch failed', remote.error);
              applyEventsList(getDevSampleEvents(), currentUserIdRef.current);
            }
          }
        } catch (error) {
          if (!cancelled) {
            setEventsError(userFacingNetworkError(error));
            if (__DEV__) {
              applyEventsList(getDevSampleEvents(), currentUserIdRef.current);
            }
          }
        }
      }
      if (!cancelled) setEventsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyEventsList, applyOrganizerProfile, organizerFromHostedEvents]);

  /** アカウント切替・ログアウト時: 下書きとローカル主催キャッシュをユーザー単位で入れ替え */
  useEffect(() => {
    let cancelled = false;
    // 切替直後に前アカウントの下書きが一瞬残らないよう先に空にする
    setDrafts([]);
    void (async () => {
      if (!currentUserId) return;
      const [draftsLoaded, hostedLoaded] = await Promise.all([
        loadEventDrafts(currentUserId),
        loadHostedEventsSnapshot(currentUserId),
      ]);
      if (cancelled) return;

      setDrafts(draftsLoaded);

      if (!hydrateDoneRef.current) return;

      // 他アカウントの公開イベントを確実に取り直す（ローカル主催キャッシュだけでは足りない）
      if (isSupabaseConfigured()) {
        await refreshEvents();
        if (cancelled) return;
      }

      if (hostedLoaded.events.length === 0) return;

      const merged = mergeSampleAndHostedEvents(eventsRef.current, [
        ...hostedLoaded.events,
      ]);
      eventsRef.current = merged;
      setEvents(merged);
      const nextHosted = hostedIdsFromEvents(merged, currentUserId);
      hostedIdsRef.current = nextHosted;
      setHostedIds(nextHosted);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, refreshEvents]);

  const refreshMyParticipations = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const remote = await fetchMyParticipationIds();
    if (!remote.ok) {
      if (__DEV__) console.warn('[participants] mine fetch', remote.error);
      return;
    }
    const nextJoined = new Set(remote.data.joinedIds);
    joinedRef.current = nextJoined;
    setJoinedIds(nextJoined);
  }, []);

  const loadEventParticipants = useCallback(
    async (eventId: string): Promise<EventAttendee[]> => {
      if (!isRemoteEventId(eventId)) return [];
      try {
        const remote = await fetchEventParticipants(
          eventId,
          currentUserIdRef.current,
        );
        if (!remote.ok) {
          if (__DEV__) console.warn('[participants] list', remote.error);
          return [];
        }
        setParticipantsByEvent((prev) => {
          const next = { ...prev, [eventId]: remote.data.attendees };
          participantsByEventRef.current = next;
          return next;
        });
        setEvents((prev) => {
          const nextEvents = prev.map((item) =>
            item.id === eventId
              ? {
                  ...item,
                  joinedCount: remote.data.joinedCount,
                  waitlistCount: 0,
                  spotsLeft: Math.max(
                    0,
                    item.capacity - remote.data.joinedCount,
                  ),
                  attendees: remote.data.attendees,
                }
              : item,
          );
          eventsRef.current = nextEvents;
          return nextEvents;
        });
        return remote.data.attendees;
      } catch (error) {
        if (__DEV__) {
          console.warn('[participants] list unexpected', error);
        }
        return [];
      }
    },
    [],
  );

  const preloadEventParticipants = useCallback(
    async (eventIds: string[]) => {
      const pending = [
        ...new Set(
          eventIds
            .map((id) => String(id || '').trim())
            .filter(
              (id) =>
                isRemoteEventId(id) &&
                !(id in participantsByEventRef.current) &&
                !preloadInFlightRef.current.has(id),
            ),
        ),
      ];
      if (pending.length === 0) return;

      for (const id of pending) preloadInFlightRef.current.add(id);
      try {
        const remote = await fetchEventParticipantsBatch(
          pending,
          currentUserIdRef.current,
        );
        if (!remote.ok) {
          if (__DEV__) console.warn('[participants] batch', remote.error);
          return;
        }
        setParticipantsByEvent((prev) => {
          const next = { ...prev };
          for (const id of pending) {
            next[id] = remote.data[id]?.attendees ?? [];
          }
          participantsByEventRef.current = next;
          return next;
        });
        setEvents((prev) => {
          let changed = false;
          const nextEvents = prev.map((item) => {
            const bundle = remote.data[item.id];
            if (!bundle) return item;
            changed = true;
            return {
              ...item,
              joinedCount: bundle.joinedCount,
              waitlistCount: 0,
              spotsLeft: Math.max(0, item.capacity - bundle.joinedCount),
              attendees: bundle.attendees,
            };
          });
          if (!changed) return prev;
          eventsRef.current = nextEvents;
          return nextEvents;
        });
      } catch (error) {
        if (__DEV__) {
          console.warn('[participants] batch unexpected', error);
        }
      } finally {
        for (const id of pending) preloadInFlightRef.current.delete(id);
      }
    },
    [],
  );

  const participantsForEvent = useCallback(
    (eventId: string) => participantsByEvent[eventId] ?? [],
    [participantsByEvent],
  );

  const hasParticipantsLoaded = useCallback(
    (eventId: string) =>
      Object.prototype.hasOwnProperty.call(participantsByEvent, eventId),
    [participantsByEvent],
  );

  const isParticipating = useCallback(
    (eventId: string) => joinedIds.has(eventId),
    [joinedIds],
  );

  useEffect(() => {
    if (!currentUserId) {
      joinedRef.current = new Set();
      setJoinedIds(new Set());
      return;
    }
    void refreshMyParticipations();
  }, [currentUserId, refreshMyParticipations]);

  const persistHostedEvents = useCallback(
    (nextEvents: SportEvent[], nextHostedIds: Set<string>) => {
      if (!hydrateDoneRef.current) return;
      const uid = currentUserIdRef.current;
      if (!uid) return;
      void saveHostedEventsSnapshot(
        uid,
        collectHostedEventsForPersistence(nextEvents, nextHostedIds),
      );
    },
    [],
  );

  const persistDrafts = useCallback((next: EventDraft[]) => {
    setDrafts(next);
    const uid = currentUserIdRef.current;
    if (!uid) return;
    void saveEventDrafts(uid, next);
  }, []);

  const saveEventDraft = useCallback(
    (snapshot: EventDraftSnapshot, id?: string) => {
      const next = upsertEventDraft(drafts, snapshot, id);
      persistDrafts(next);
      return next[0];
    },
    [drafts, persistDrafts],
  );

  const deleteEventDraft = useCallback(
    (id: string) => {
      persistDrafts(removeEventDraft(drafts, id));
    },
    [drafts, persistDrafts],
  );

  const persistCheckIns = useCallback((next: CheckInsByEvent) => {
    setCheckInsByEvent(next);
    void saveCheckInsByEvent(next);
  }, []);

  const toggleCheckIn = useCallback(
    (eventId: string, attendeeId: string) => {
      const { next, checkedIn } = toggleCheckInRecords(
        checkInsByEvent,
        eventId,
        attendeeId,
      );
      persistCheckIns(next);
      return checkedIn;
    },
    [checkInsByEvent, persistCheckIns],
  );

  const checkedInIds = useCallback(
    (eventId: string) => checkInIdSet(checkInsByEvent[eventId]),
    [checkInsByEvent],
  );

  const persistFavorites = useCallback((next: Set<string>) => {
    const safe = next instanceof Set ? next : new Set<string>();
    setFavoriteIds(safe);
    void saveFavoriteEventIds([...safe]);
  }, []);

  const persistWatchlist = useCallback((next: Set<string>) => {
    const safe = next instanceof Set ? next : new Set<string>();
    setWatchlistIds(safe);
    void saveWatchlistEventIds([...safe]);
  }, []);

  const refreshMyFavorites = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const remote = await fetchFavoriteEventIds();
    if (!remote.ok) {
      if (__DEV__) console.warn('[favorites] fetch', remote.error);
      return;
    }
    const ids = Array.isArray(remote.data) ? remote.data : [];
    persistFavorites(new Set(ids));
  }, [persistFavorites]);

  const refreshMyWatchlist = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const remote = await fetchWatchlistEventIds();
    if (!remote.ok) {
      if (__DEV__) console.warn('[watchlist] fetch', remote.error);
      return;
    }
    const ids = Array.isArray(remote.data) ? remote.data : [];
    persistWatchlist(new Set(ids));
  }, [persistWatchlist]);

  useEffect(() => {
    if (!currentUserId) {
      persistFavorites(new Set());
      persistWatchlist(new Set());
      return;
    }
    void refreshMyFavorites();
    void refreshMyWatchlist();
  }, [
    currentUserId,
    refreshMyFavorites,
    refreshMyWatchlist,
    persistFavorites,
    persistWatchlist,
  ]);

  const toggleFavorite = useCallback(
    async (id: string): Promise<boolean> => {
      if (!id) return false;
      const current = favoriteIds instanceof Set ? favoriteIds : new Set<string>();
      const currently = current.has(id);
      const previous = new Set(current);
      const next = new Set(current);
      if (currently) next.delete(id);
      else next.add(id);

      persistFavorites(next);

      if (isSupabaseConfigured() && isRemoteEventId(id)) {
        try {
          const remote = currently
            ? await removeFavoriteRemote(id)
            : await addFavoriteRemote(id);
          if (!remote.ok) {
            persistFavorites(previous);
            if (__DEV__) {
              console.error('[favorites] toggle failed', {
                eventId: id,
                action: currently ? 'remove' : 'add',
                error: remote.error,
              });
            }
            showNetworkErrorAlert(
              remote.error,
              i18n.t('events.favoriteFailedTitle'),
            );
            return currently;
          }
        } catch (error) {
          persistFavorites(previous);
          if (__DEV__) {
            console.error('[favorites] toggle threw', {
              eventId: id,
              error,
            });
          }
          showNetworkErrorAlert(error, i18n.t('events.favoriteFailedTitle'));
          return currently;
        }
      }

      return next.has(id);
    },
    [favoriteIds, persistFavorites],
  );

  const toggleWatchlist = useCallback(
    async (id: string): Promise<boolean> => {
      if (!id) return false;
      const current =
        watchlistIds instanceof Set ? watchlistIds : new Set<string>();
      const currently = current.has(id);
      const previous = new Set(current);
      const next = new Set(current);
      if (currently) next.delete(id);
      else next.add(id);

      persistWatchlist(next);

      if (isSupabaseConfigured() && isRemoteEventId(id)) {
        try {
          const remote = currently
            ? await removeWatchlistRemote(id)
            : await addWatchlistRemote(id);
          if (!remote.ok) {
            persistWatchlist(previous);
            showNetworkErrorAlert(
              remote.error,
              i18n.t('events.watchFailedTitle'),
            );
            return currently;
          }
        } catch (error) {
          persistWatchlist(previous);
          showNetworkErrorAlert(error, i18n.t('events.watchFailedTitle'));
          return currently;
        }
      }

      return next.has(id);
    },
    [watchlistIds, persistWatchlist],
  );

  const toggleJoin = useCallback(
    async (
      id: string,
      options?: ToggleJoinOptions,
    ): Promise<JoinActionResult> => {
      const event = eventsRef.current.find((item) => item.id === id);
      if (!event || isEventCancelled(event)) {
        return 'unchanged';
      }
      const isJoined = joinedRef.current.has(id);
      // 終了済み: 参加取消は不可。DEV のみ未参加への参加を許可
      if (
        isEventPast(event) &&
        (isJoined || !ALLOW_JOIN_PAST_EVENTS)
      ) {
        return 'unchanged';
      }

      const leaveQty = Math.max(
        1,
        Math.floor(
          Number(
            eventPayments[id]?.ticketQuantity ??
              ticketQuantityRef.current[id] ??
              1,
          ) || 1,
        ),
      );
      const joinQty = Math.max(
        1,
        Math.floor(Number(options?.ticketQuantity) || 1),
      );
      const next = applyToggleJoin(event, isJoined, {
        ticketQuantity: isJoined ? leaveQty : joinQty,
      });

    if (next.result === 'full' || next.result === 'unchanged') {
      return next.result;
    }

      const useRemote = isSupabaseConfigured() && isRemoteEventId(id);

      if (useRemote) {
        setEventsSaving(true);
        try {
          if (next.result === 'left') {
            const remote = await leaveEventRemote(id);
            if (!remote.ok) {
              console.error('[events] leave failed', {
                eventId: id,
                error: remote.error,
              });
              showNetworkErrorAlert(
                remote.error,
                i18n.t('errors.joinUpdateFailed'),
              );
              return 'unchanged';
            }
          } else if (next.result === 'joined') {
            const remote = await joinEventRemote(id, 'joined', {
              ticketQuantity: next.ticketQuantity,
            });
            if (!remote.ok) {
              console.error('[events] join failed', {
                eventId: id,
                error: remote.error,
              });
              showNetworkErrorAlert(
                remote.error,
                i18n.t('errors.joinRegisterFailed'),
              );
              return 'unchanged';
            }
          }
        } catch (error) {
          console.error('[events] join/leave threw', {
            eventId: id,
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error,
          });
          showNetworkErrorAlert(error, i18n.t('errors.joinUpdateFailed'));
          return 'unchanged';
        } finally {
          setEventsSaving(false);
        }
      }

    const nextJoined = new Set(joinedRef.current);
    if (next.joined) nextJoined.add(id);
    else nextJoined.delete(id);

    setJoinedIds(nextJoined);
    joinedRef.current = nextJoined;

      if (next.result === 'joined') {
        setTicketQuantityByEvent((prev) => ({
          ...prev,
          [id]: next.ticketQuantity,
        }));
        // 参加できたら空き通知希望は不要
        if (watchlistIds?.has?.(id)) {
          const nextWatch = new Set(
            watchlistIds instanceof Set ? watchlistIds : [],
          );
          nextWatch.delete(id);
          persistWatchlist(nextWatch);
          if (useRemote) {
            void removeWatchlistRemote(id);
          }
        }
      } else if (next.result === 'left') {
        setTicketQuantityByEvent((prev) => {
          if (!(id in prev)) return prev;
          const { [id]: _removed, ...rest } = prev;
          return rest;
        });
      }

    setEvents((prev) => {
        const nextEvents = prev.map((item) =>
          item.id === id ? next.event : item,
        );
      eventsRef.current = nextEvents;
        if (
          isHostedByMe(
            next.event,
            hostedIdsRef.current,
            currentUserIdRef.current,
          )
        ) {
          persistHostedEvents(nextEvents, hostedIdsRef.current);
        }
      return nextEvents;
      });

      if (useRemote) {
        void loadEventParticipants(id);
      }

      return next.result;
    },
    [
      persistHostedEvents,
      loadEventParticipants,
      eventPayments,
      watchlistIds,
      persistWatchlist,
    ],
  );

  const recordEventPayment = useCallback((payment: EventPaymentRecord) => {
    setEventPayments((prev) => ({ ...prev, [payment.eventId]: payment }));
    const qty = Math.max(1, Math.floor(Number(payment.ticketQuantity) || 1));
    setTicketQuantityByEvent((prev) => ({
      ...prev,
      [payment.eventId]: qty,
    }));
  }, []);

  const eventPayment = useCallback(
    (eventId: string) => eventPayments[eventId],
    [eventPayments],
  );

  const markEventRefunded = useCallback((eventId: string) => {
    setEventPayments((prev) => {
      const current = prev[eventId];
      if (!current) return prev;
      return { ...prev, [eventId]: { ...current, status: 'refunded' } };
    });
  }, []);

  const cancelHostedEvent = useCallback(
    async (eventId: string, reason?: string): Promise<SportEvent | null> => {
      const current = eventsRef.current.find((item) => item.id === eventId);
      if (
        !current ||
        !isHostedByMe(
          current,
          hostedIdsRef.current,
          currentUserIdRef.current,
        )
      ) {
        return null;
      }
      if (isEventCancelled(current)) return current;

      setEventsSaving(true);
      try {
        if (isSupabaseConfigured()) {
          const remote = await cancelRemoteEvent(eventId, reason);
          if (!remote.ok) {
            showNetworkErrorAlert(
              remote.error,
              i18n.t('errors.eventCancelFailed'),
            );
            return null;
          }
          const nextEvent = remote.data;
          setEvents((prev) => {
            const nextEvents = prev.map((item) =>
              item.id === eventId ? nextEvent : item,
            );
            eventsRef.current = nextEvents;
            persistHostedEvents(nextEvents, hostedIdsRef.current);
            return nextEvents;
          });

          const attendees = participantsByEvent[eventId] ?? [];
          const recipientIds = attendees
            .map((a) => a.id)
            .filter((uid) => uid && uid !== currentUserIdRef.current);
          if (recipientIds.length > 0) {
            void notifyEventUpdatePush({
              recipientUserIds: recipientIds,
              title: 'イベントが中止になりました',
              body: nextEvent.title,
              eventId,
            });
          }

          return nextEvent;
        }

        const nextEvent: SportEvent = {
          ...current,
          cancelledAt: new Date().toISOString(),
          cancelReason: reason?.trim() || undefined,
        };
        setEvents((prev) => {
          const nextEvents = prev.map((item) =>
            item.id === eventId ? nextEvent : item,
          );
          eventsRef.current = nextEvents;
          persistHostedEvents(nextEvents, hostedIdsRef.current);
          return nextEvents;
        });
        return nextEvent;
      } catch (error) {
        showNetworkErrorAlert(error, i18n.t('errors.eventCancelFailed'));
        return null;
      } finally {
        setEventsSaving(false);
      }
    },
    [participantsByEvent, persistHostedEvents],
  );

  const updateOrganizerProfile = useCallback(
    async (
      profile: OrganizerProfile,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const next = applyOrganizerProfile(profile);
    const displayName = organizerDisplayName(next);
      const uid = currentUserIdRef.current;

      const localSave = await saveOrganizerProfile(uid, next);
      if (!localSave.ok) {
        if (__DEV__) console.warn('[organizer] local save', localSave.error);
      }

    setEvents((prev) => {
      const nextEvents = prev.map((item) =>
          isHostedByMe(item, hostedIdsRef.current, uid)
          ? {
              ...item,
              host: displayName,
                hostId: uid || item.hostId,
              hostImageUri: next.imageUri,
              hostBio: next.bio || undefined,
                hostContact: undefined,
                hostSnsUrl: next.snsLinks[0]?.url,
                hostSnsLinks: next.snsLinks,
            }
          : item,
      );
      eventsRef.current = nextEvents;
        persistHostedEvents(nextEvents, hostedIdsRef.current);
      return nextEvents;
    });

      if (uid && isSupabaseConfigured()) {
        try {
          const remote = await updateRemoteHostProfileFields({
            hostId: uid,
            hostName: displayName,
            hostImageUri: next.imageUri,
            hostBio: next.bio,
            hostSnsLinks: next.snsLinks,
          });
          if (!remote.ok) {
            if (__DEV__) {
              console.warn('[organizer] remote host update', remote.error);
            }
            return {
              ok: false,
              error:
                remote.error ||
                '主催者情報をサーバーに保存できませんでした。端末には保存済みです。',
            };
          }

          const clubRemote = await upsertClubRow({
            id: uid,
            name: displayName,
            imageUrl: next.imageUri ?? null,
            coverImageUrl: next.coverUri ?? null,
            bio: next.bio,
          });
          if (!clubRemote.ok && __DEV__) {
            console.warn('[organizer] clubs upsert', clubRemote.error);
          }
        } catch (error) {
          if (__DEV__) console.warn('[organizer] remote threw', error);
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : '主催者情報をサーバーに保存できませんでした。端末には保存済みです。',
          };
        }
      }

      if (!localSave.ok) return localSave;
      return { ok: true };
    },
    [applyOrganizerProfile, persistHostedEvents],
  );

  const createEvent = useCallback(
    async (payload: CreateEventPayload): Promise<CreateEventResult> => {
      const ngHit = findNgWordInCreatePayload(payload);
      if (ngHit) {
        return { ok: false, error: NG_WORD_ERROR_MESSAGE };
      }

      const hostId = (await resolveAuthUserId()) ?? currentUserIdRef.current;
      if (!hostId) {
        return {
          ok: false,
          error: 'ログインしてからイベントを作成してください',
        };
      }
      if (!isSupabaseConfigured()) {
        return {
          ok: false,
          error:
            'Supabase が未設定です。環境変数と events テーブルの適用を確認してください',
        };
      }

      setEventsSaving(true);
      try {
        const remote = await insertRemoteEvent({
          hostId,
          payload,
          organizer: organizerRef.current,
        });
        if (!remote.ok) {
          return {
            ok: false,
            error:
              remote.error ||
              'イベントの保存に失敗しました。しばらくしてから再試行してください',
          };
        }

        const created = remote.data;
        const primary = created[0];
        if (!primary) {
          return { ok: false, error: 'イベントの保存に失敗しました' };
        }

        for (const item of created) {
          await ensureHostParticipant(item.id, hostId);
        }

        const nextHosted = new Set(hostedIdsRef.current);
        for (const item of created) nextHosted.add(item.id);
        hostedIdsRef.current = nextHosted;
        setHostedIds(nextHosted);

        setEvents((prev) => {
          const createdIds = new Set(created.map((e) => e.id));
          const withoutDup = prev.filter((item) => !createdIds.has(item.id));
          const nextEvents = [...created, ...withoutDup];
          eventsRef.current = nextEvents;
          persistHostedEvents(nextEvents, nextHosted);
          return nextEvents;
        });

        setJoinedIds((prev) => {
          const nextJoined = new Set(prev);
          for (const item of created) nextJoined.add(item.id);
          joinedRef.current = nextJoined;
          return nextJoined;
        });

        setParticipantsByEvent((prev) => {
          const next = { ...prev };
          for (const item of created) {
            next[item.id] = [
              {
                id: hostId,
                name: item.host,
                imageUri: item.hostImageUri,
                self: true,
              },
            ];
          }
          return next;
        });

        // 翻訳は作成成功後にバックグラウンド実行（失敗しても公開は維持）
        const createdIds = created.map((item) => item.id);
        void requestEventTranslation({
          eventIds: createdIds,
          title: payload.title,
          description: payload.description,
          sourceLang: getCurrentAppLanguage(),
        }).then((translated) => {
          if (!translated.ok) {
            if (__DEV__) {
              console.warn('[events] translate skipped/failed', translated.error);
            }
            return;
          }
          const idSet = new Set(translated.updatedIds);
          setEvents((prev) => {
            const nextEvents = prev.map((item) => {
              if (!idSet.has(item.id)) return item;
              return {
                ...item,
                sourceLang: translated.sourceLang,
                titleJa: translated.titleJa || item.titleJa,
                titleEn: translated.titleEn || item.titleEn,
                descriptionJa: translated.descriptionJa || item.descriptionJa,
                descriptionEn: translated.descriptionEn || item.descriptionEn,
                translatedAt: new Date().toISOString(),
              };
            });
            eventsRef.current = nextEvents;
            persistHostedEvents(nextEvents, hostedIdsRef.current);
            return nextEvents;
          });
        });

        return { ok: true, event: primary, events: created };
      } finally {
        setEventsSaving(false);
      }
    },
    [persistHostedEvents],
  );

  const resetAccountData = useCallback(() => {
    const previousUserId = currentUserIdRef.current;
    const nextEvents = __DEV__ ? getDevSampleEvents() : [];
    const nextJoined = new Set<string>();
    const nextFavorites = new Set<string>();
    const nextHosted = new Set<string>();
    const nextOrganizer = EMPTY_ORGANIZER_PROFILE;
    eventsRef.current = nextEvents;
    joinedRef.current = nextJoined;
    hostedIdsRef.current = nextHosted;
    organizerRef.current = nextOrganizer;
    setEvents(nextEvents);
    setJoinedIds(nextJoined);
    setHostedIds(nextHosted);
    setOrganizerProfile(nextOrganizer);
    setEventPayments({});
    setTicketQuantityByEvent({});
    setDrafts([]);
    void clearEventDrafts(previousUserId);
    persistFavorites(nextFavorites);
    persistWatchlist(new Set());
    persistCheckIns({});
    void clearHostedEventsSnapshot(previousUserId);
    void clearOrganizerProfile(previousUserId);
    void refreshEvents();
  }, [persistFavorites, persistWatchlist, persistCheckIns, refreshEvents]);

  const clearParticipantSessionData = useCallback(() => {
    const empty = new Set<string>();
    joinedRef.current = empty;
    setJoinedIds(empty);
    setFavoriteIds(new Set());
    setWatchlistIds(new Set());
  }, []);

  const hydrateParticipantSessionData = useCallback(async () => {
    const [favoritesLoaded, watchlistLoaded] = await Promise.all([
      loadFavoriteEventIds(),
      loadWatchlistEventIds(),
    ]);
    const cleaned = favoritesLoaded.filter(
      (id) => !LEGACY_DEMO_PARTICIPANT_IDS.has(id),
    );
    if (cleaned.length !== favoritesLoaded.length) {
      void saveFavoriteEventIds(cleaned);
    }
    setFavoriteIds(new Set(cleaned));
    setWatchlistIds(new Set(watchlistLoaded));
    await refreshEvents();
    await refreshMyParticipations();
    await refreshMyFavorites();
    await refreshMyWatchlist();

    // 参加／主催イベントのチャット履歴を DB から復元（再ログイン・再起動対策）
    try {
      const { syncChatsForEvents } = await import('@/lib/chatsContext');
      await syncChatsForEvents(eventsRef.current, {
        joinedIds: joinedRef.current,
        hostedIds: hostedIdsRef.current,
        currentUserId: currentUserIdRef.current,
      });
    } catch (error) {
      if (__DEV__) {
        console.warn('[events] syncChatsForEvents failed', error);
      }
    }
  }, [
    refreshEvents,
    refreshMyParticipations,
    refreshMyFavorites,
    refreshMyWatchlist,
  ]);

  const mine = useCallback(
    (event: SportEvent) => isHostedByMe(event, hostedIds, currentUserId),
    [hostedIds, currentUserId],
  );

  const joinedEvents = useMemo(
    () =>
      events.filter((e) => joinedIds.has(e.id)),
    [events, joinedIds],
  );

  const hostedEvents = useMemo(
    () => events.filter((e) => mine(e)),
    [events, mine],
  );

  const upcomingJoinedEvents = useMemo(
    () => joinedEvents.filter((event) => !isEventPast(event, now)),
    [joinedEvents, now],
  );

  const upcomingHostedEvents = useMemo(
    () =>
      hostedEvents.filter((event) => !isHostedEventArchived(event, now)),
    [hostedEvents, now],
  );

  const pastJoinedEvents = useMemo(
    () =>
      sortPastEventsNewestFirst(
        events.filter(
          (event) =>
            isEventPast(event, now) &&
            joinedIds.has(event.id) &&
            !mine(event),
        ),
      ),
    [events, joinedIds, mine, now],
  );

  const pastHostedEvents = useMemo(
    () =>
      sortPastEventsNewestFirst(
        hostedEvents.filter((event) => isHostedEventArchived(event, now)),
      ),
    [hostedEvents, now],
  );

  const favoriteEvents = useMemo(
    () =>
      sortEventsUpcomingThenPast(
        events.filter((event) => favoriteIds.has(event.id)),
        now,
      ),
    [events, favoriteIds, now],
  );

  const pastHistoryEvents = useMemo(
    () =>
      sortPastEventsNewestFirst(
        events.filter(
          (event) =>
            isEventPast(event, now) &&
            (joinedIds.has(event.id) || mine(event)),
        ),
      ),
    [events, joinedIds, mine, now],
  );

  const value = useMemo(
    () => ({
      events,
      joinedIds,
      hostedIds,
      drafts,
      favoriteIds,
      watchlistIds,
      checkInsByEvent,
      organizerProfile,
      updateOrganizerProfile,
      toggleJoin,
      loadEventParticipants,
      preloadEventParticipants,
      participantsForEvent,
      hasParticipantsLoaded,
      isParticipating,
      refreshMyParticipations,
      toggleFavorite,
      refreshMyFavorites,
      toggleWatchlist,
      refreshMyWatchlist,
      toggleCheckIn,
      checkedInIds,
      recordEventPayment,
      eventPayment,
      markEventRefunded,
      cancelHostedEvent,
      createEvent,
      refreshEvents,
      ensureRemoteEvent,
      eventsLoading,
      eventsSaving,
      eventsError,
      clearEventsError,
      currentUserId,
      saveEventDraft,
      deleteEventDraft,
      resetAccountData,
      clearParticipantSessionData,
      hydrateParticipantSessionData,
      now,
      joinedEvents,
      hostedEvents,
      upcomingJoinedEvents,
      upcomingHostedEvents,
      pastJoinedEvents,
      pastHostedEvents,
      favoriteEvents,
      pastHistoryEvents,
    }),
    [
      events,
      joinedIds,
      hostedIds,
      drafts,
      favoriteIds,
      watchlistIds,
      checkInsByEvent,
      organizerProfile,
      updateOrganizerProfile,
      toggleJoin,
      loadEventParticipants,
      preloadEventParticipants,
      participantsForEvent,
      hasParticipantsLoaded,
      isParticipating,
      refreshMyParticipations,
      toggleFavorite,
      refreshMyFavorites,
      toggleWatchlist,
      refreshMyWatchlist,
      toggleCheckIn,
      checkedInIds,
      recordEventPayment,
      eventPayment,
      markEventRefunded,
      cancelHostedEvent,
      createEvent,
      refreshEvents,
      ensureRemoteEvent,
      eventsLoading,
      eventsSaving,
      eventsError,
      clearEventsError,
      currentUserId,
      saveEventDraft,
      deleteEventDraft,
      resetAccountData,
      clearParticipantSessionData,
      hydrateParticipantSessionData,
      now,
      joinedEvents,
      hostedEvents,
      upcomingJoinedEvents,
      upcomingHostedEvents,
      pastJoinedEvents,
      pastHostedEvents,
      favoriteEvents,
      pastHistoryEvents,
    ],
  );

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
}

export function useEvents() {
  const ctx = useContext(EventsContext);
  if (!ctx) {
    throw new Error('useEvents must be used within EventsProvider');
  }
  return ctx;
}
