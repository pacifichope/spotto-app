import {
  isEventCancelled,
  isEventPast,
  parseEventDateTime,
  type SportEvent,
} from '@/lib/events';
import i18n from '@/lib/i18n';
import type { LatLng } from '@/lib/userLocation';

export type SortKey = 'recommended' | 'soonest';

export type DateFilterId =
  | 'today'
  | 'tomorrow'
  | 'weekend'
  | 'week'
  | 'nextWeek';

export type LevelFilterId = 'all' | 'beginner' | 'intermediate' | 'advanced';

export type EventFilters = {
  level: LevelFilterId;
  /** プリセット（今日／今週末など） */
  date: DateFilterId | null;
  /** ホーム横ストリップの特定日 YYYY-MM-DD */
  day: string | null;
};

export const EMPTY_FILTERS: EventFilters = {
  level: 'all',
  date: null,
  day: null,
};

/**
 * ホーム／メイン一覧向け。
 * 終了済み・中止は除外し、開催前および開催中のみ残す。
 * （参加履歴・主催履歴は eventsContext の past* を使う）
 */
export function isActiveBrowseEvent(
  event: Pick<
    SportEvent,
    'date' | 'time' | 'endTime' | 'endDate' | 'sessions' | 'cancelledAt'
  >,
  now = new Date(),
) {
  if (isEventCancelled(event)) return false;
  if (isEventPast(event, now)) return false;
  return true;
}

export function filterActiveBrowseEvents<T extends SportEvent>(
  events: T[],
  now = new Date(),
): T[] {
  return events.filter((event) => {
    try {
      return isActiveBrowseEvent(event, now);
    } catch {
      return false;
    }
  });
}

/**
 * label / hint は getter。参照のたびに現在の言語で解決される
 * （言語切替後の再レンダーで最新の文言になる）。
 */
export const SORT_OPTIONS: {
  key: SortKey;
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    key: 'recommended',
    get label() {
      return i18n.t('home.sort.recommended.label');
    },
    get hint() {
      return i18n.t('home.sort.recommended.hint');
    },
  },
  {
    key: 'soonest',
    get label() {
      return i18n.t('home.sort.soonest.label');
    },
    get hint() {
      return i18n.t('home.sort.soonest.hint');
    },
  },
];

function levelFilterOption(id: LevelFilterId) {
  return {
    id,
    get label() {
      return i18n.t(`home.filter.level.${id}.label`);
    },
    get hint() {
      return i18n.t(`home.filter.level.${id}.hint`);
    },
  };
}

function dateFilterOption(id: DateFilterId) {
  return {
    id,
    get label() {
      return i18n.t(`home.filter.date.${id}.label`);
    },
    get hint() {
      return i18n.t(`home.filter.date.${id}.hint`);
    },
  };
}

export const LEVEL_FILTER_OPTIONS: {
  id: LevelFilterId;
  readonly label: string;
  readonly hint: string;
}[] = [
  levelFilterOption('all'),
  levelFilterOption('beginner'),
  levelFilterOption('intermediate'),
  levelFilterOption('advanced'),
];

export const DATE_FILTER_OPTIONS: {
  id: DateFilterId;
  readonly label: string;
  readonly hint: string;
}[] = [
  dateFilterOption('today'),
  dateFilterOption('tomorrow'),
  dateFilterOption('weekend'),
  dateFilterOption('week'),
  dateFilterOption('nextWeek'),
];

export function sortLabel(sortKey: SortKey) {
  return SORT_OPTIONS.find((option) => option.key === sortKey)?.label ?? i18n.t('home.sort.title');
}

export function activeFilterCount(filters: EventFilters) {
  return (
    (filters.level !== 'all' ? 1 : 0) +
    (filters.date ? 1 : 0) +
    (filters.day ? 1 : 0)
  );
}

export function hasActiveFilters(filters: EventFilters) {
  return activeFilterCount(filters) > 0;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, amount: number) {
  const next = startOfDay(value);
  next.setDate(next.getDate() + amount);
  return next;
}

export function eventStartAt(event: SportEvent, now = new Date()) {
  if (event.sessions && event.sessions.length > 0) {
    const starts = event.sessions.map((session) =>
      parseEventDateTime(session.date, session.time).getTime(),
    );
    const upcoming = starts.filter((time) => time >= now.getTime()).sort((a, b) => a - b);
    if (upcoming[0] != null) return new Date(upcoming[0]);
    return new Date(Math.min(...starts));
  }
  return parseEventDateTime(event.date, event.time);
}

/**
 * マップ表示用: 開催日が「今日〜（days-1）日後」の範囲内か。
 * 既定 7 = 今日を含む1週間（7日間）。それより先の開催はマップから除外する。
 */
export function isEventWithinUpcomingDays(
  event: SportEvent,
  days = 7,
  now = new Date(),
) {
  if (!Number.isFinite(days) || days <= 0) return false;
  const start = startOfDay(eventStartAt(event, now));
  const today = startOfDay(now);
  const endExclusive = addDays(today, days);
  const t = start.getTime();
  return t >= today.getTime() && t < endExclusive.getTime();
}

export function filterEventsWithinUpcomingDays<T extends SportEvent>(
  events: T[],
  days = 7,
  now = new Date(),
): T[] {
  return events.filter((event) => {
    try {
      return isEventWithinUpcomingDays(event, days, now);
    } catch {
      return false;
    }
  });
}

export function distanceKm(from: LatLng, to: LatLng) {
  const dLat = (to.latitude - from.latitude) * 111;
  const dLng =
    (to.longitude - from.longitude) *
    111 *
    Math.cos((from.latitude * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function matchesDateFilter(event: SportEvent, date: DateFilterId, now = new Date()) {
  const day = startOfDay(eventStartAt(event, now));
  const today = startOfDay(now);
  const dayMs = day.getTime();
  const todayMs = today.getTime();

  if (date === 'today') return dayMs === todayMs;
  if (date === 'tomorrow') return dayMs === addDays(today, 1).getTime();

  const dow = today.getDay();
  const saturday = addDays(today, dow === 0 ? -1 : 6 - dow);
  const sunday = addDays(saturday, 1);

  if (date === 'weekend') {
    if (dow === 0) return dayMs === todayMs;
    return dayMs >= Math.max(todayMs, saturday.getTime()) && dayMs <= sunday.getTime();
  }

  if (date === 'week') {
    const weekEnd = dow === 0 ? today : addDays(today, 7 - dow);
    return dayMs >= todayMs && dayMs <= weekEnd.getTime();
  }

  const thisSunday = dow === 0 ? today : addDays(today, 7 - dow);
  const nextMonday = addDays(thisSunday, 1);
  const nextSunday = addDays(nextMonday, 6);
  return dayMs >= nextMonday.getTime() && dayMs <= nextSunday.getTime();
}

function matchesLevelFilter(event: SportEvent, level: LevelFilterId) {
  if (level === 'all') return true;
  if (level === 'beginner') {
    return event.level === '初心者' || event.level === '誰でも歓迎';
  }
  if (level === 'intermediate') return event.level === '中級';
  return event.level === '上級';
}

export function filterEventsByBrowse(
  events: SportEvent[],
  filters: EventFilters,
  now = new Date(),
) {
  return events.filter((event) => {
    if (!matchesLevelFilter(event, filters.level)) return false;
    // 横ストリップの特定日が最優先
    if (filters.day) {
      return eventDateStamps(event).includes(filters.day);
    }
    if (filters.date && !matchesDateFilter(event, filters.date, now)) {
      return false;
    }
    return true;
  });
}

/** おすすめ順用のユーザー興味プロファイル */
export type BrowseInterestProfile = {
  sportWeights: Record<string, number>;
  hostWeights: Record<string, number>;
  favoriteIds: Set<string>;
};

export function buildBrowseInterestProfile(input: {
  joinedEvents?: SportEvent[];
  favoriteEvents?: SportEvent[];
  favoriteIds?: Set<string>;
}): BrowseInterestProfile {
  const sportWeights: Record<string, number> = {};
  const hostWeights: Record<string, number> = {};

  const bump = (
    map: Record<string, number>,
    key: string | undefined,
    amount: number,
  ) => {
    const id = String(key || '').trim();
    if (!id) return;
    map[id] = (map[id] ?? 0) + amount;
  };

  for (const event of input.joinedEvents ?? []) {
    bump(sportWeights, event.sport, 1);
    bump(hostWeights, event.hostId || event.host, 1);
  }
  for (const event of input.favoriteEvents ?? []) {
    bump(sportWeights, event.sport, 0.6);
    bump(hostWeights, event.hostId || event.host, 0.4);
  }

  return {
    sportWeights,
    hostWeights,
    favoriteIds:
      input.favoriteIds instanceof Set
        ? input.favoriteIds
        : new Set(input.favoriteIds ?? []),
  };
}

export type SortEventsOptions = {
  origin?: LatLng | null;
  now?: Date;
  interest?: BrowseInterestProfile | null;
  /** nearby: 距離は補助 / prefecture: 県庁所在地からの距離を重視 */
  areaMode?: 'nearby' | 'prefecture' | null;
};

/**
 * おすすめ度（大きいほど上位）。
 * - 開催日時の近さ
 * - 参加人数（人気）
 * - 過去参加・お気に入りに基づく興味
 * - 基準地からの距離
 */
export function recommendedEventScore(
  event: SportEvent,
  options: SortEventsOptions = {},
): number {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const startMs = eventStartAt(event, now).getTime();
  const hours = (startMs - nowMs) / 36e5;

  // 開催が近いほど高い（概ね 3 日で半減）。過去開催はほぼ 0
  const timeScore =
    hours >= 0 ? Math.exp(-hours / 72) : Math.exp(hours / 24) * 0.04;

  // 参加人数が多いほど高い（約 40 人で飽和気味）
  const joined = Math.max(0, Math.floor(Number(event.joinedCount) || 0));
  const popularityScore = Math.log1p(joined) / Math.log1p(40);

  let interestScore = 0;
  const interest = options.interest;
  if (interest) {
    if (interest.favoriteIds.has(event.id)) interestScore += 0.55;
    const sportKey = String(event.sport || '').trim();
    const sportW = sportKey ? interest.sportWeights[sportKey] ?? 0 : 0;
    interestScore += Math.min(0.45, sportW * 0.18);
    const hostKey = String(event.hostId || event.host || '').trim();
    const hostW = hostKey ? interest.hostWeights[hostKey] ?? 0 : 0;
    interestScore += Math.min(0.3, hostW * 0.12);
  }

  let distanceScore = 0.45;
  if (options.origin) {
    const km = distanceKm(options.origin, {
      latitude: event.latitude,
      longitude: event.longitude,
    });
    // 県庁所在地モードは広めに減衰、現在地は近距離を強く優遇
    const scale = options.areaMode === 'prefecture' ? 35 : 18;
    distanceScore = Number.isFinite(km) ? Math.exp(-km / scale) : 0;
  }

  if (options.areaMode === 'prefecture') {
    return (
      0.28 * timeScore +
      0.18 * popularityScore +
      0.14 * interestScore +
      0.4 * distanceScore
    );
  }

  return (
    0.4 * timeScore +
    0.25 * popularityScore +
    0.2 * interestScore +
    0.15 * distanceScore
  );
}

export function sortEventsByBrowse(
  events: SportEvent[],
  sortKey: SortKey,
  originOrOptions: LatLng | null | SortEventsOptions = null,
  nowArg = new Date(),
) {
  const options: SortEventsOptions =
    originOrOptions &&
    typeof originOrOptions === 'object' &&
    ('origin' in originOrOptions ||
      'interest' in originOrOptions ||
      'areaMode' in originOrOptions ||
      'now' in originOrOptions)
      ? (originOrOptions as SortEventsOptions)
      : { origin: originOrOptions as LatLng | null, now: nowArg };

  const now = options.now ?? nowArg;
  const nowMs = now.getTime();
  const origin = options.origin ?? null;

  return [...events].sort((a, b) => {
    const startA = eventStartAt(a, now).getTime();
    const startB = eventStartAt(b, now).getTime();

    if (sortKey === 'soonest') {
      const upcomingA = startA >= nowMs ? 0 : 1;
      const upcomingB = startB >= nowMs ? 0 : 1;
      if (upcomingA !== upcomingB) return upcomingA - upcomingB;
      if (startA !== startB) return startA - startB;
      // 同日時は距離が近い方を先に（都道府県モード向け）
      if (origin) {
        const distA = distanceKm(origin, {
          latitude: a.latitude,
          longitude: a.longitude,
        });
        const distB = distanceKm(origin, {
          latitude: b.latitude,
          longitude: b.longitude,
        });
        return distA - distB;
      }
      return 0;
    }

    const scoreA = recommendedEventScore(a, { ...options, origin, now });
    const scoreB = recommendedEventScore(b, { ...options, origin, now });
    if (scoreA !== scoreB) return scoreB - scoreA;
    return startA - startB;
  });
}

/** イベントが属する開催日スタンプ（YYYY-MM-DD）一覧 */
export function eventDateStamps(event: SportEvent): string[] {
  if (event.sessions && event.sessions.length > 0) {
    const stamps = event.sessions
      .map((session) => String(session?.date || '').trim())
      .filter(Boolean);
    return [...new Set(stamps)].sort();
  }
  const stamp = String(event.date || '').trim();
  return stamp ? [stamp] : [];
}

/** 日付スタンプ → その日のイベント一覧 */
export function groupEventsByDate(
  events: SportEvent[],
): Map<string, SportEvent[]> {
  const map = new Map<string, SportEvent[]>();
  for (const event of events) {
    for (const stamp of eventDateStamps(event)) {
      const list = map.get(stamp);
      if (list) {
        if (!list.some((item) => item.id === event.id)) list.push(event);
      } else {
        map.set(stamp, [event]);
      }
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) =>
      `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
    );
  }
  return map;
}
