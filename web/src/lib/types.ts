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
  description: string | null;
  image_uri: string | null;
  price_yen: number | null;
  cancelled_at: string | null;
};

const EVENT_COLUMNS =
  'id, title, sport, location, event_date, event_time, end_date, end_time, level, latitude, longitude, capacity, joined_count, host_id, host_name, description, image_uri, price_yen, cancelled_at';

export function eventColumns() {
  return EVENT_COLUMNS;
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
    description: row.description?.trim() || '',
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
