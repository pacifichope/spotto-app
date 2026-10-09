export type PublicEvent = {
  id: string;
  title: string;
  sport: string;
  location: string;
  eventDate: string;
  eventTime: string;
  endDate: string;
  endTime: string;
  level: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  joinedCount: number;
  hostId: string;
  hostName: string;
  description: string;
  imageUri: string | null;
  priceYen: number;
};

export type EventRow = {
  id: string;
  title: string | null;
  sport: string | null;
  location: string | null;
  event_date: string | null;
  event_time: string | null;
  end_date: string | null;
  end_time: string | null;
  level: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  joined_count: number | null;
  host_id: string | null;
  host_name: string | null;
  /** list / inbox 取得では省略可 */
  description?: string | null;
  image_uri: string | null;
  price_yen: number | null;
  cancelled_at: string | null;
};

/** 詳細・予約など description が必要な場面 */
const EVENT_COLUMNS =
  'id, title, sport, location, event_date, event_time, end_date, end_time, level, latitude, longitude, capacity, joined_count, host_id, host_name, description, image_uri, price_yen, cancelled_at';

/** ホーム一覧・マップ（description は載せない） */
const EVENT_LIST_COLUMNS =
  'id, title, sport, location, event_date, event_time, end_date, end_time, level, latitude, longitude, capacity, joined_count, host_id, host_name, image_uri, price_yen, cancelled_at';

/** チャット一覧に必要な最小カラム */
const EVENT_INBOX_COLUMNS =
  'id, title, sport, image_uri, host_id, cancelled_at';

export function eventColumns() {
  return EVENT_COLUMNS;
}

export function eventListColumns() {
  return EVENT_LIST_COLUMNS;
}

export function eventInboxColumns() {
  return EVENT_INBOX_COLUMNS;
}

function numberOrNull(value: number | null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapEventRow(row: EventRow): PublicEvent | null {
  if (!row.id || row.cancelled_at) return null;
  return {
    id: row.id,
    title: row.title?.trim() || '',
    sport: row.sport?.trim() || '',
    location: row.location?.trim() || '',
    eventDate: row.event_date || '',
    eventTime: row.event_time || '',
    endDate: row.end_date || '',
    endTime: row.end_time || '',
    level: row.level?.trim() || '',
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    capacity: Number(row.capacity) || 0,
    joinedCount: Number(row.joined_count) || 0,
    hostId: row.host_id?.trim() || '',
    hostName: row.host_name?.trim() || '',
    description: row.description?.trim() || '', // list 取得時は空でも可
    imageUri: row.image_uri?.trim() || null,
    priceYen: Math.max(0, Math.floor(Number(row.price_yen) || 0)),
  };
}

/** 終了日時が過去なら true（終了日が無ければ開始日時で判定） */
export function isEventPast(event: PublicEvent, now = Date.now()) {
  const endDate = event.endDate || event.eventDate;
  const endTime = event.endTime || event.eventTime || '23:59';
  if (!endDate) return false;
  const ms = Date.parse(`${endDate}T${normalizeClock(endTime)}`);
  return Number.isFinite(ms) ? ms < now : false;
}

/** 開催中・開催予定のみ（ホーム／マップ等の公開一覧用） */
export function filterActiveEvents(
  events: PublicEvent[],
  now = Date.now(),
): PublicEvent[] {
  return events.filter((event) => !isEventPast(event, now));
}

/**
 * Asia/Tokyo の今日（YYYY-MM-DD）。
 * Supabase で明らかに終了した行を落とすための下限。
 */
export function tokyoDateStamp(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

/**
 * 開催日または終了日が今日以降（進行中の複数日イベント含む）。
 * 同日内に終了したものは filterActiveEvents / isEventPast で最終除外。
 */
export function activeEventsOrFilter(now = Date.now()): string {
  const today = tokyoDateStamp(now);
  return `event_date.gte.${today},end_date.gte.${today}`;
}

export type EventStatusKind = 'ended' | 'open' | 'full';

/** カード／詳細用の募集ステータス */
export function getEventStatus(
  event: Pick<
    PublicEvent,
    'eventDate' | 'eventTime' | 'endDate' | 'endTime' | 'capacity' | 'joinedCount'
  >,
  now = Date.now(),
): EventStatusKind {
  if (isEventPast(event as PublicEvent, now)) return 'ended';
  if (event.capacity > 0 && event.joinedCount >= event.capacity) return 'full';
  return 'open';
}

/** i18n キー（event.status*） */
export function eventStatusMessageKey(status: EventStatusKind) {
  if (status === 'ended') return 'event.statusEnded';
  if (status === 'full') return 'event.statusFull';
  return 'event.statusOpen';
}

/** @deprecated use eventStatusMessageKey + t() */
export function eventStatusLabel(status: EventStatusKind) {
  if (status === 'ended') return 'イベント終了';
  if (status === 'full') return '満員';
  return '募集中';
}

function normalizeClock(time: string) {
  const t = time.trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{1,2}:\d{2}$/.test(t)) return `${t}:00`;
  return '23:59:00';
}
