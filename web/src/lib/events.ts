import { cache } from 'react';

import { createPublicSupabase } from '@/lib/supabase';
import {
  activeEventsOrFilter,
  eventColumns,
  eventListColumns,
  filterActiveEvents,
  mapEventRow,
  type EventRow,
  type PublicEvent,
} from '@/lib/types';

/** 公開ホーム／サイトマップ用。終了済みイベントは含めない。 */
export const listPublicEvents = cache(async (): Promise<PublicEvent[]> => {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from('events')
    .select(eventListColumns())
    .is('cancelled_at', null)
    .or(activeEventsOrFilter())
    .order('event_date', { ascending: true })
    .limit(80);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as EventRow[];
  return filterActiveEvents(
    rows.flatMap((row) => {
      const event = mapEventRow(row);
      return event ? [event] : [];
    }),
  );
});

export const getPublicEvent = cache(async (id: string): Promise<PublicEvent | null> => {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from('events')
    .select(eventColumns())
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const event = mapEventRow(data as unknown as EventRow);
  if (!event) return null;

  // クラブプロフィール画像（clubs.image_url）を優先し、なければ events.host_image_uri
  if (!event.hostId) return event;
  const { data: club } = await supabase
    .from('clubs')
    .select('image_url')
    .eq('id', event.hostId)
    .maybeSingle();
  const clubImage = String(
    (club as { image_url?: string | null } | null)?.image_url || '',
  ).trim();
  if (!clubImage) return event;
  return { ...event, hostImageUri: clubImage };
});

/** 同一シリーズ（または同一タイトル＋主催）の開催回一覧。日程ピッカー用。 */
export const listEventScheduleOccurrences = cache(
  async (event: PublicEvent): Promise<PublicEvent[]> => {
    const supabase = createPublicSupabase();
    const seriesId = event.seriesId?.trim();

    if (seriesId) {
      const { data, error } = await supabase
        .from('events')
        .select(eventColumns())
        .eq('series_id', seriesId)
        .is('cancelled_at', null)
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true })
        .limit(40);
      if (!error && data) {
        const list = (data as unknown as EventRow[])
          .flatMap((row) => {
            const mapped = mapEventRow(row);
            return mapped ? [mapped] : [];
          })
          .filter((item) => !event.title || item.title === event.title);
        if (list.length > 1) return list;
      }
    }

    if (!event.hostId || !event.title.trim()) return [event];

    const { data, error } = await supabase
      .from('events')
      .select(eventColumns())
      .eq('host_id', event.hostId)
      .eq('title', event.title)
      .is('cancelled_at', null)
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true })
      .limit(40);
    if (error || !data) return [event];

    const peers = (data as unknown as EventRow[]).flatMap((row) => {
      const mapped = mapEventRow(row);
      return mapped ? [mapped] : [];
    });
    const dates = new Set(peers.map((item) => item.eventDate));
    if (peers.length <= 1 || dates.size <= 1) return [event];
    return peers;
  },
);
