import { absoluteImageUrl } from '@/lib/eventSeo';
import {
  clubDetailCacheKey,
  clubsCacheKey,
  isQueryCacheFresh,
  setQueryCache,
} from '@/lib/queryCache';
import { sanitizeSnsLinks, type SnsLink } from '@/lib/snsLinks';
import { createAuthedSupabase, createPublicSupabase } from '@/lib/supabase';
import {
  eventListColumns,
  mapEventRow,
  type EventRow,
  type PublicEvent,
} from '@/lib/types';

export type JoinedClub = {
  id: string;
  name: string;
  imageUri?: string;
  sport?: string;
};

export type ClubMember = {
  id: string;
  name: string;
  imageUri?: string;
  role?: 'host' | 'member';
  self?: boolean;
};

export type ClubDetail = {
  id: string;
  name: string;
  hostName: string;
  imageUri?: string;
  coverUri?: string;
  sport?: string;
  snsLinks: SnsLink[];
  events: PublicEvent[];
  members: ClubMember[];
};

const JOINED_CLUBS_KEY_PREFIX = 'spotto:joined-clubs:';

function joinedClubsStorageKey(userId: string) {
  return `${JOINED_CLUBS_KEY_PREFIX}${userId.trim()}`;
}

export function readJoinedClubIds(userId: string): Set<string> {
  const uid = userId.trim();
  if (!uid || typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(joinedClubsStorageKey(uid));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

function writeJoinedClubIds(userId: string, ids: Set<string>) {
  const uid = userId.trim();
  if (!uid || typeof window === 'undefined') return;
  window.localStorage.setItem(
    joinedClubsStorageKey(uid),
    JSON.stringify([...ids]),
  );
}

export function joinClubLocal(userId: string, clubId: string) {
  const id = clubId.trim();
  if (!userId.trim() || !id) return;
  const next = readJoinedClubIds(userId);
  next.add(id);
  writeJoinedClubIds(userId, next);
}

export function leaveClubLocal(userId: string, clubId: string) {
  const id = clubId.trim();
  if (!userId.trim() || !id) return;
  const next = readJoinedClubIds(userId);
  next.delete(id);
  writeJoinedClubIds(userId, next);
}

/** クラブ詳細へのパス（id = host_id / Firebase UID） */
export function clubHref(clubId: string) {
  const id = String(clubId || '').trim();
  if (!id) return '/clubs';
  return `/clubs/${encodeURIComponent(id)}`;
}

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
    .eq('user_id', uid)
    .limit(300);
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
  ].slice(0, 120);

  const byHost = new Map<string, JoinedClub>();

  if (eventIds.length > 0) {
    const chunkSize = 60;
    for (let i = 0; i < eventIds.length; i += chunkSize) {
      const chunk = eventIds.slice(i, i + chunkSize);
      const { data: events, error } = await supabase
        .from('events')
        .select('host_id, host_name, host_image_uri, image_uri, sport')
        .in('id', chunk);
      if (error) throw new Error(error.message);
      for (const row of events ?? []) {
        const hostId = String((row as { host_id?: string }).host_id ?? '').trim();
        if (!hostId || byHost.has(hostId)) continue;
        byHost.set(hostId, {
          id: hostId,
          name:
            String((row as { host_name?: string }).host_name ?? '').trim() ||
            'クラブ',
          imageUri:
            String(
              (row as { host_image_uri?: string }).host_image_uri ||
                (row as { image_uri?: string }).image_uri ||
                '',
            ).trim() || undefined,
          sport:
            String((row as { sport?: string }).sport ?? '').trim() || undefined,
        });
      }
    }
  }

  const list = [...byHost.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'ja'),
  );
  setQueryCache(clubsCacheKey(uid), list);
  return list;
}

/** マイページ等からのプリフェッチ */
export function prefetchJoinedClubs(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): void {
  const key = clubsCacheKey(input.userId);
  if (isQueryCacheFresh(key)) return;
  void fetchJoinedClubs(input).catch(() => {
    /* ignore */
  });
}

/**
 * クラブ詳細（主催者 ID = host_id）。
 * clubs テーブル・profiles・主催イベントから組み立てる。
 */
export async function fetchClubDetail(clubId: string): Promise<ClubDetail | null> {
  const id = String(clubId || '').trim();
  if (!id) return null;

  const supabase = createPublicSupabase();

  const [eventsRes, clubRes, profileRes] = await Promise.all([
    supabase
      .from('events')
      .select(`${eventListColumns()}, host_image_uri`)
      .eq('host_id', id)
      .is('cancelled_at', null)
      .order('event_date', { ascending: true })
      .limit(48),
    supabase
      .from('clubs')
      .select('id, name, image_url, cover_image_url, sns_links')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id, display_name, nickname, avatar_url')
      .eq('id', id)
      .maybeSingle(),
  ]);

  if (eventsRes.error) throw new Error(eventsRes.error.message);

  // clubs: sns_links 未適用時はフォールバック
  type ClubRowLoose = {
    name?: string;
    image_url?: string | null;
    cover_image_url?: string | null;
    sns_links?: unknown;
  };
  let clubRow: ClubRowLoose | null = clubRes.error
    ? null
    : ((clubRes.data as ClubRowLoose | null) ?? null);
  if (clubRes.error && /sns_links/i.test(clubRes.error.message || '')) {
    const fallback = await supabase
      .from('clubs')
      .select('id, name, image_url, cover_image_url')
      .eq('id', id)
      .maybeSingle();
    clubRow = fallback.error
      ? null
      : ((fallback.data as ClubRowLoose | null) ?? null);
  }
  const profileRow = profileRes.error ? null : profileRes.data;

  const eventRows = (eventsRes.data ?? []) as unknown as Array<
    EventRow & {
      host_image_uri?: string | null;
    }
  >;
  const events = eventRows.flatMap((row) => {
    const event = mapEventRow(row);
    return event ? [event] : [];
  });

  const sample = eventRows[0];
  const profileName = String(
    (profileRow as { display_name?: string; nickname?: string } | null)
      ?.display_name ||
      (profileRow as { nickname?: string } | null)?.nickname ||
      '',
  ).trim();
  const clubName = String(clubRow?.name || '').trim();
  const eventHostName = String(sample?.host_name ?? '').trim();
  const name = clubName || profileName || eventHostName || 'クラブ';

  const clubImage = String(clubRow?.image_url || '').trim();
  const profileAvatar = String(
    (profileRow as { avatar_url?: string | null } | null)?.avatar_url || '',
  ).trim();
  const hostImage = String(sample?.host_image_uri || '').trim();
  const imageUri =
    absoluteImageUrl(clubImage) ||
    absoluteImageUrl(profileAvatar) ||
    absoluteImageUrl(hostImage) ||
    absoluteImageUrl(sample?.image_uri) ||
    undefined;

  const coverRaw = String(clubRow?.cover_image_url || '').trim();
  const coverUri =
    absoluteImageUrl(coverRaw) ||
    absoluteImageUrl(sample?.image_uri) ||
    undefined;

  const sport =
    [...new Set(events.map((event) => event.sport).filter(Boolean))][0] ||
    undefined;

  // SNS は clubs テーブルのみ（イベント行のネスト列は読まない）
  const snsLinks = sanitizeSnsLinks(clubRow?.sns_links);

  if (!clubRow && !profileRow && events.length === 0) {
    return null;
  }

  const hostName = clubName || eventHostName || profileName || name;
  const members = await fetchClubMembers({
    clubId: id,
    hostName,
    hostImageUri: imageUri,
    eventIds: events.map((event) => event.id),
  });

  const detail: ClubDetail = {
    id,
    name,
    hostName,
    imageUri,
    coverUri,
    sport,
    snsLinks,
    events,
    members,
  };
  setQueryCache(clubDetailCacheKey(id), detail);
  return detail;
}

function looksLikeFirebaseUid(id: string) {
  return /^[A-Za-z0-9]{20,}$/.test(id);
}

/**
 * クラブ主催イベントの参加者 + 主催者をメンバー一覧にする。
 */
export async function fetchClubMembers(input: {
  clubId: string;
  hostName: string;
  hostImageUri?: string;
  eventIds: string[];
  currentUserId?: string | null;
}): Promise<ClubMember[]> {
  const hostId = input.clubId.trim();
  if (!hostId) return [];

  const byId = new Map<string, ClubMember>();
  byId.set(hostId, {
    id: hostId,
    name: input.hostName || '主催者',
    imageUri: input.hostImageUri,
    role: 'host',
  });

  const eventIds = [
    ...new Set(input.eventIds.map((id) => id.trim()).filter(Boolean)),
  ].slice(0, 40);

  const supabase = createPublicSupabase();

  if (eventIds.length > 0) {
    type ParticipantRow = {
      event_id?: string;
      user_id?: string;
      status?: string;
      display_name?: string | null;
      avatar_url?: string | null;
    };

    let rows: ParticipantRow[] = [];
    const withSnapshot = await supabase
      .from('event_participants')
      .select('event_id, user_id, status, display_name, avatar_url')
      .in('event_id', eventIds)
      .eq('status', 'joined')
      .limit(400);

    if (
      withSnapshot.error &&
      (withSnapshot.error.message?.includes('display_name') ||
        withSnapshot.error.message?.includes('avatar_url'))
    ) {
      const legacy = await supabase
        .from('event_participants')
        .select('event_id, user_id, status')
        .in('event_id', eventIds)
        .eq('status', 'joined')
        .limit(400);
      if (!legacy.error) rows = (legacy.data ?? []) as ParticipantRow[];
    } else if (!withSnapshot.error) {
      rows = (withSnapshot.data ?? []) as ParticipantRow[];
    }

    const userIds = [
      ...new Set(
        rows
          .map((row) => String(row.user_id || '').trim())
          .filter(Boolean),
      ),
    ].slice(0, 80);
    if (hostId && !userIds.includes(hostId) && looksLikeFirebaseUid(hostId)) {
      userIds.push(hostId);
    }

    const profileById = new Map<
      string,
      {
        display_name?: string | null;
        nickname?: string | null;
        avatar_url?: string | null;
      }
    >();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, nickname, avatar_url')
        .in('id', userIds);
      for (const profile of profiles ?? []) {
        const pid = String((profile as { id?: string }).id ?? '').trim();
        if (!pid) continue;
        profileById.set(pid, profile as {
          display_name?: string | null;
          nickname?: string | null;
          avatar_url?: string | null;
        });
      }
    }

    const hostProfile = profileById.get(hostId);
    if (hostProfile) {
      const hostDisplay =
        String(hostProfile.display_name || hostProfile.nickname || '').trim() ||
        input.hostName;
      byId.set(hostId, {
        id: hostId,
        name: hostDisplay,
        imageUri:
          absoluteImageUrl(hostProfile.avatar_url ?? null) ||
          input.hostImageUri,
        role: 'host',
      });
    }

    for (const row of rows) {
      const userId = String(row.user_id || '').trim();
      if (!userId || byId.has(userId)) continue;
      const profile = profileById.get(userId);
      const name =
        String(
          profile?.display_name ||
            profile?.nickname ||
            row.display_name ||
            '',
        ).trim() || 'メンバー';
      byId.set(userId, {
        id: userId,
        name,
        imageUri:
          absoluteImageUrl(profile?.avatar_url ?? null) ||
          absoluteImageUrl(row.avatar_url ?? null) ||
          undefined,
        role: userId === hostId ? 'host' : 'member',
      });
    }
  }

  const currentUserId = String(input.currentUserId || '').trim();
  const list = [...byId.values()].map((member) => ({
    ...member,
    self: Boolean(currentUserId && member.id === currentUserId),
  }));

  const hosts = list.filter((m) => m.role === 'host' || m.id === hostId);
  const others = list.filter((m) => !(m.role === 'host' || m.id === hostId));
  const host = hosts[0] ? [{ ...hosts[0], role: 'host' as const }] : [];
  return [...host, ...others];
}
