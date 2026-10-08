import { absoluteImageUrl } from '@/lib/eventSeo';
import { createAuthedSupabase, createPublicSupabase } from '@/lib/supabase';

export type EventAttendee = {
  id: string;
  name: string;
  imageUri?: string;
  bio?: string;
  gender?: '男性' | '女性';
  self?: boolean;
  isHost?: boolean;
  ticketQuantity?: number;
};

type ParticipantRow = {
  user_id?: string | null;
  status?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  ticket_quantity?: number | null;
};

type ProfileRow = {
  id?: string | null;
  display_name?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
  gender?: string | null;
};

function resolveAvatar(raw: string | null | undefined): string | undefined {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return undefined;
  return absoluteImageUrl(trimmed) || (/^https?:\/\//i.test(trimmed) ? trimmed : undefined);
}

function asGender(raw: string | null | undefined): '男性' | '女性' | undefined {
  if (raw === '男性' || raw === '女性') return raw;
  return undefined;
}

/**
 * イベント参加者を取得（スナップショット + profiles を結合）。
 * ゲストでも event_participants の公開 SELECT で読める想定。profiles は認証時に補強。
 */
export async function fetchEventAttendees(input: {
  eventId: string;
  hostId?: string | null;
  hostName?: string | null;
  hostImageUri?: string | null;
  currentUserId?: string | null;
  getIdToken?: () => Promise<string | null>;
}): Promise<EventAttendee[]> {
  const eventId = input.eventId.trim();
  if (!eventId) return [];

  const client =
    input.getIdToken != null
      ? createAuthedSupabase(input.getIdToken)
      : createPublicSupabase();

  let rows: ParticipantRow[] = [];
  const withSnapshot = await client
    .from('event_participants')
    .select('user_id, status, display_name, avatar_url, ticket_quantity, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (withSnapshot.error) {
    const legacy = await client
      .from('event_participants')
      .select('user_id, status, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (legacy.error) throw new Error(legacy.error.message);
    rows = (legacy.data ?? []) as ParticipantRow[];
  } else {
    rows = (withSnapshot.data ?? []) as ParticipantRow[];
  }

  const joined = rows.filter((row) => {
    const status = String(row.status || '').toLowerCase();
    return !status || status === 'joined' || status === 'confirmed';
  });

  const userIds = [
    ...new Set(
      joined
        .map((row) => String(row.user_id || '').trim())
        .filter(Boolean),
    ),
  ];

  const profileById = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data: profiles } = await client
      .from('profiles')
      .select('id, display_name, nickname, avatar_url, gender')
      .in('id', userIds);
    for (const profile of (profiles ?? []) as ProfileRow[]) {
      const id = String(profile.id || '').trim();
      if (id) profileById.set(id, profile);
    }
  }

  const attendees: EventAttendee[] = joined.map((row) => {
    const userId = String(row.user_id || '').trim();
    const profile = profileById.get(userId);
    const name =
      String(profile?.display_name || profile?.nickname || row.display_name || '').trim() ||
      '名前未設定';
    const imageUri =
      resolveAvatar(profile?.avatar_url) || resolveAvatar(row.avatar_url);
    return {
      id: userId,
      name,
      imageUri,
      gender: asGender(profile?.gender),
      self: Boolean(input.currentUserId && userId === input.currentUserId),
      isHost: Boolean(input.hostId && userId === input.hostId),
      ticketQuantity: Math.max(1, Math.floor(Number(row.ticket_quantity) || 1)),
    };
  });

  const hostId = String(input.hostId || '').trim();
  if (hostId && !attendees.some((person) => person.id === hostId)) {
    attendees.unshift({
      id: hostId,
      name: String(input.hostName || '').trim() || '主催者',
      imageUri: resolveAvatar(input.hostImageUri),
      isHost: true,
      ticketQuantity: 1,
    });
  } else if (hostId) {
    for (const person of attendees) {
      if (person.id === hostId) person.isHost = true;
    }
  }

  return attendees;
}
