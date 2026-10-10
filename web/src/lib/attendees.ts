import { absoluteImageUrl } from '@/lib/eventSeo';
import { createAuthedSupabase, createPublicSupabase } from '@/lib/supabase';

export type EventAttendee = {
  id: string;
  name: string;
  imageUri?: string;
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
  gender?: string | null;
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

async function loadAttendeeProfiles(
  client: ReturnType<typeof createPublicSupabase>,
  eventId: string,
  userIds: string[],
): Promise<Map<string, ProfileRow>> {
  const profileById = new Map<string, ProfileRow>();
  if (userIds.length === 0) return profileById;

  // ゲストでも読める SECURITY DEFINER RPC（氏名・アバター・性別のみ）
  const { data: rpcRows, error: rpcError } = await client.rpc(
    'profiles_for_event_attendees',
    { p_event_id: eventId },
  );

  if (!rpcError && Array.isArray(rpcRows)) {
    for (const profile of rpcRows as ProfileRow[]) {
      const id = String(profile.id || '').trim();
      if (id) profileById.set(id, profile);
    }
    return profileById;
  }

  // RPC 未適用環境向けフォールバック（authenticated のみ成功する想定）
  const { data: profiles } = await client
    .from('profiles')
    .select('id, display_name, nickname, avatar_url, gender')
    .in('id', userIds);
  for (const profile of (profiles ?? []) as ProfileRow[]) {
    const id = String(profile.id || '').trim();
    if (id) profileById.set(id, profile);
  }
  return profileById;
}

/**
 * イベント参加者を取得（スナップショット + profiles を結合）。
 * ゲストでも event_participants の公開 SELECT と profiles_for_event_attendees RPC で性別まで読める。
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
    .select('user_id, status, display_name, avatar_url, gender, ticket_quantity, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (withSnapshot.error) {
    // gender 列未適用・スナップショット列なし環境向け
    const legacy = await client
      .from('event_participants')
      .select('user_id, status, display_name, avatar_url, ticket_quantity, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (legacy.error) {
      const minimal = await client
        .from('event_participants')
        .select('user_id, status, created_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });
      if (minimal.error) throw new Error(minimal.error.message);
      rows = (minimal.data ?? []) as ParticipantRow[];
    } else {
      rows = (legacy.data ?? []) as ParticipantRow[];
    }
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

  const profileById = await loadAttendeeProfiles(client, eventId, userIds);

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
      gender: asGender(profile?.gender) || asGender(row.gender),
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
