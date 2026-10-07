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
  host_name: string | null;
  description: string | null;
  image_uri: string | null;
  price_yen: number | null;
  cancelled_at: string | null;
};

const EVENT_COLUMNS =
  'id, title, sport, location, event_date, event_time, end_date, end_time, level, latitude, longitude, capacity, joined_count, host_name, description, image_uri, price_yen, cancelled_at';

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
    title: row.title?.trim() || '無題のイベント',
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
    hostName: row.host_name?.trim() || '',
    description: row.description?.trim() || '',
    imageUri: row.image_uri?.trim() || null,
    priceYen: Math.max(0, Math.floor(Number(row.price_yen) || 0)),
  };
}
