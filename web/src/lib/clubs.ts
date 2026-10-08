import { absoluteImageUrl } from '@/lib/eventSeo';
import { sanitizeSnsLinks, type SnsLink } from '@/lib/snsLinks';
import { createAuthedSupabase, createPublicSupabase } from '@/lib/supabase';
import {
  eventColumns,
  mapEventRow,
  type EventRow,
  type PublicEvent,
} from '@/lib/types';

export type JoinedClub = {
  id: string;
  name: string;
  imageUri?: string;
  sport?: string;
  bio?: string;
};

export type ClubDetail = {
  id: string;
  name: string;
  imageUri?: string;
  coverUri?: string;
  sport?: string;
  bio?: string;
  snsLinks: SnsLink[];
  events: PublicEvent[];
};

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
      .select(
        `${eventColumns()}, host_image_uri, host_bio, host_sns_links`,
      )
      .eq('host_id', id)
      .is('cancelled_at', null)
      .order('event_date', { ascending: true })
      .limit(80),
    supabase
      .from('clubs')
      .select('id, name, image_url, cover_image_url, bio, sns_links')
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
    bio?: string;
    sns_links?: unknown;
  };
  let clubRow: ClubRowLoose | null = clubRes.error
    ? null
    : ((clubRes.data as ClubRowLoose | null) ?? null);
  if (clubRes.error && /sns_links/i.test(clubRes.error.message || '')) {
    const fallback = await supabase
      .from('clubs')
      .select('id, name, image_url, cover_image_url, bio')
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
      host_bio?: string | null;
      host_sns_links?: unknown;
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
  const hostName = String(sample?.host_name ?? '').trim();
  const name = clubName || profileName || hostName || 'クラブ';

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

  const bio =
    String(clubRow?.bio || '').trim() ||
    String(sample?.host_bio || '').trim() ||
    undefined;

  const sport =
    [...new Set(events.map((event) => event.sport).filter(Boolean))][0] ||
    undefined;

  const clubSns = sanitizeSnsLinks(clubRow?.sns_links);
  const eventSns = sanitizeSnsLinks(sample?.host_sns_links);
  const snsLinks = clubSns.length > 0 ? clubSns : eventSns;

  if (!clubRow && !profileRow && events.length === 0) {
    return null;
  }

  return {
    id,
    name,
    imageUri,
    coverUri,
    sport,
    bio,
    snsLinks,
    events,
  };
}
