import { createAuthedSupabase } from '@/lib/supabase';

export async function fetchFavoriteEventIds(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<string[]> {
  const client = createAuthedSupabase(input.getIdToken);
  const { data, error } = await client
    .from('event_favorites')
    .select('event_id')
    .eq('user_id', input.userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => String((row as { event_id?: string }).event_id ?? '').trim())
    .filter(Boolean);
}

export async function addFavorite(input: {
  userId: string;
  eventId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<void> {
  const client = createAuthedSupabase(input.getIdToken);
  const eventId = input.eventId.trim().toLowerCase();
  const { error } = await client.from('event_favorites').upsert(
    { user_id: input.userId.trim(), event_id: eventId },
    { onConflict: 'user_id,event_id', ignoreDuplicates: true },
  );
  if (error && error.code !== '23505') {
    const inserted = await client.from('event_favorites').insert({
      user_id: input.userId.trim(),
      event_id: eventId,
    });
    if (inserted.error && inserted.error.code !== '23505') {
      throw new Error(inserted.error.message);
    }
  }
}

export async function removeFavorite(input: {
  userId: string;
  eventId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<void> {
  const client = createAuthedSupabase(input.getIdToken);
  const { error } = await client
    .from('event_favorites')
    .delete()
    .eq('user_id', input.userId.trim())
    .eq('event_id', input.eventId.trim().toLowerCase());
  if (error) throw new Error(error.message);
}
