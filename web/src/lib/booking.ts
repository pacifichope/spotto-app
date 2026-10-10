import { createAuthedSupabase } from '@/lib/supabase';
import type { PublicEvent } from '@/lib/types';

export type JoinInput = {
  event: PublicEvent;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  gender?: '男性' | '女性' | '' | null;
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
  const gender =
    input.gender === '男性' || input.gender === '女性' ? input.gender : null;
  const payload: Record<string, unknown> = {
    event_id: input.event.id.trim().toLowerCase(),
    user_id: input.userId.trim(),
    status: 'joined',
    ticket_quantity: ticketQuantity,
    display_name: input.displayName || null,
    avatar_url: input.avatarUrl || null,
    gender,
  };

  let { data, error } = await supabase
    .from('event_participants')
    .upsert(payload, { onConflict: 'event_id,user_id' })
    .select('event_id, user_id, status, ticket_quantity')
    .maybeSingle();

  // gender 列未適用環境向けフォールバック
  if (
    error &&
    (error.message?.includes('gender') || error.code === '42703')
  ) {
    delete payload.gender;
    ({ data, error } = await supabase
      .from('event_participants')
      .upsert(payload, { onConflict: 'event_id,user_id' })
      .select('event_id, user_id, status, ticket_quantity')
      .maybeSingle());
  }

  if (error) throw new Error(error.message);
  return data;
}

/** 参加キャンセル（event_participants 行を削除） */
export async function leaveEvent(input: {
  eventId: string;
  userId: string;
  getIdToken: () => Promise<string | null>;
}) {
  const supabase = createAuthedSupabase(input.getIdToken);
  const { error } = await supabase
    .from('event_participants')
    .delete()
    .eq('event_id', input.eventId.trim().toLowerCase())
    .eq('user_id', input.userId.trim());
  if (error) throw new Error(error.message);
}
