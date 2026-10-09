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
  return mapEventRow(data as unknown as EventRow);
});
