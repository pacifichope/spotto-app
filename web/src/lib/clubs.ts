import { createAuthedSupabase } from '@/lib/supabase';

export type JoinedClub = {
  id: string;
  name: string;
  imageUri?: string;
  sport?: string;
  bio?: string;
};

/**
 * 参加イベントの主催者を「参加したクラブ」として集約（アプリ版 fetchJoinedClubsForUser 相当）。
 */
export async function fetchJoinedClubs(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<JoinedClub[]> {
  const uid = input.userId.trim();
  if (!uid) return [];

  const supabase = createAuthedSupabase(input.getIdToken);
  const { data: parts, error: partsError } = await supabase
    .from('event_participants')
    .select('event_id, status')
    .eq('user_id', uid);
  if (partsError) throw new Error(partsError.message);

  const eventIds = [
    ...new Set(
      (parts ?? [])
        .filter((row) => {
          const status = String((row as { status?: string }).status ?? '').toLowerCase();
          return !status || status === 'joined' || status === 'confirmed';
        })
        .map((row) => String((row as { event_id?: string }).event_id ?? '').trim())
        .filter(Boolean),
    ),
  ];

  const byHost = new Map<string, JoinedClub>();

  if (eventIds.length > 0) {
    const { data: events, error } = await supabase
      .from('events')
      .select('host_id, host_name, host_image_uri, image_uri, sport, host_bio')
      .in('id', eventIds.slice(0, 200));
    if (error) throw new Error(error.message);
    for (const row of events ?? []) {
      const hostId = String((row as { host_id?: string }).host_id ?? '').trim();
      if (!hostId || byHost.has(hostId)) continue;
      byHost.set(hostId, {
        id: hostId,
        name:
          String((row as { host_name?: string }).host_name ?? '').trim() || 'クラブ',
        imageUri:
          String(
            (row as { host_image_uri?: string }).host_image_uri ||
              (row as { image_uri?: string }).image_uri ||
              '',
          ).trim() || undefined,
        sport: String((row as { sport?: string }).sport ?? '').trim() || undefined,
        bio: String((row as { host_bio?: string }).host_bio ?? '').trim() || undefined,
      });
    }
  }

  return [...byHost.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
