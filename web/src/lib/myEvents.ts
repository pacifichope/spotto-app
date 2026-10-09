import { createAuthedSupabase } from '@/lib/supabase';
import { setQueryCache } from '@/lib/queryCache';
import {
  eventListColumns,
  isEventPast,
  mapEventRow,
  type EventRow,
  type PublicEvent,
} from '@/lib/types';

export type MyEventsBundle = {
  joinedUpcoming: PublicEvent[];
  joinedPast: PublicEvent[];
  favorites: PublicEvent[];
  hostedUpcoming: PublicEvent[];
  hostedPast: PublicEvent[];
};

async function fetchEventsByIds(
  getIdToken: () => Promise<string | null>,
  ids: string[],
): Promise<PublicEvent[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    150,
  );
  if (unique.length === 0) return [];
  const supabase = createAuthedSupabase(getIdToken);
  const mapped: PublicEvent[] = [];
  const chunkSize = 60;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('events')
      .select(eventListColumns())
      .in('id', chunk)
      .is('cancelled_at', null);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as EventRow[]) {
      const event = mapEventRow(row);
      if (event) mapped.push(event);
    }
  }
  const order = new Map(unique.map((id, i) => [id, i]));
  return mapped.sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
}

function splitUpcomingPast(events: PublicEvent[]) {
  const upcoming: PublicEvent[] = [];
  const past: PublicEvent[] = [];
  for (const event of events) {
    if (isEventPast(event)) past.push(event);
    else upcoming.push(event);
  }
  const byStart = (a: PublicEvent, b: PublicEvent) =>
    `${a.eventDate}${a.eventTime}`.localeCompare(`${b.eventDate}${b.eventTime}`);
  upcoming.sort(byStart);
  past.sort((a, b) => byStart(b, a));
  return { upcoming, past };
}

/**
 * アプリのマイページと同じく、参加・お気に入り・主催イベントを取得する。
 */
export async function fetchMyEventsBundle(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<MyEventsBundle> {
  const userId = input.userId.trim();
  if (!userId) {
    return {
      joinedUpcoming: [],
      joinedPast: [],
      favorites: [],
      hostedUpcoming: [],
      hostedPast: [],
    };
  }

  const supabase = createAuthedSupabase(input.getIdToken);

  const [joinedRes, favRes, hostedRes] = await Promise.all([
    supabase
      .from('event_participants')
      .select('event_id, status')
      .eq('user_id', userId)
      .limit(200),
    supabase
      .from('event_favorites')
      .select('event_id')
      .eq('user_id', userId)
      .limit(100),
    supabase
      .from('events')
      .select(eventListColumns())
      .eq('host_id', userId)
      .is('cancelled_at', null)
      .order('event_date', { ascending: true })
      .limit(80),
  ]);

  if (joinedRes.error) throw new Error(joinedRes.error.message);
  if (favRes.error) throw new Error(favRes.error.message);
  if (hostedRes.error) throw new Error(hostedRes.error.message);

  const joinedIds = (joinedRes.data ?? [])
    .filter((row) => {
      const status = String((row as { status?: string }).status ?? '').toLowerCase();
      return !status || status === 'joined' || status === 'confirmed';
    })
    .map((row) => String((row as { event_id?: string }).event_id ?? '').trim())
    .filter(Boolean);

  const favoriteIds = (favRes.data ?? [])
    .map((row) => String((row as { event_id?: string }).event_id ?? '').trim())
    .filter(Boolean);

  const [joinedEvents, favoriteEvents] = await Promise.all([
    fetchEventsByIds(input.getIdToken, joinedIds),
    fetchEventsByIds(input.getIdToken, favoriteIds),
  ]);

  const hostedEvents = ((hostedRes.data ?? []) as unknown as EventRow[]).flatMap(
    (row) => {
      const event = mapEventRow(row);
      return event ? [event] : [];
    },
  );

  const joined = splitUpcomingPast(joinedEvents);
  const hosted = splitUpcomingPast(hostedEvents);

  const bundle: MyEventsBundle = {
    joinedUpcoming: joined.upcoming,
    joinedPast: joined.past,
    favorites: favoriteEvents,
    hostedUpcoming: hosted.upcoming,
    hostedPast: hosted.past,
  };
  setQueryCache(`myEvents:${userId}`, bundle);
  return bundle;
}
