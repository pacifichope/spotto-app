import { createAuthedSupabase } from '@/lib/supabase';
import type { PublicEvent } from '@/lib/types';

export type JoinInput = {
  event: PublicEvent;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  ticketQuantity?: number;
  getIdToken: () => Promise<string | null>;
};

/**
 * アプリの joinEventRemote と同じ upsert。
 * user_id は Firebase UID（jwt.sub）と一致させる。
 */
export async function joinEvent(input: JoinInput) {
  const supabase = createAuthedSupabase(input.getIdToken);
  const ticketQuantity = Math.max(1, Math.floor(input.ticketQuantity || 1));
  const { data, error } = await supabase
    .from('event_participants')
    .upsert(
      {
        event_id: input.event.id.trim().toLowerCase(),
        user_id: input.userId.trim(),
        status: 'joined',
        ticket_quantity: ticketQuantity,
        display_name: input.displayName || null,
        avatar_url: input.avatarUrl || null,
      },
      { onConflict: 'event_id,user_id' },
    )
    .select('event_id, user_id, status, ticket_quantity')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
