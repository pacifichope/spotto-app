import type { Club, ClubMember } from '@/lib/clubs';
import { eventsForClub } from '@/lib/clubs';
import { isRemoteEventId } from '@/lib/chatsRemote';
import type { SportEvent } from '@/lib/events';
import {
  resolveDisplayImageUrl,
  resolvePublicImageUrl,
  isLocalImageUri,
} from '@/lib/storage';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type ParticipantRow = {
  event_id: string;
  user_id: string;
  status: string;
  display_name?: string | null;
  avatar_url?: string | null;
  created_at?: string;
};

type ProfileRow = {
  id: string;
  display_name?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
};

function resolveAvatarUri(raw: string | null | undefined): string | undefined {
  const trimmed = String(raw || '').trim();
  if (!trimmed || isLocalImageUri(trimmed)) return undefined;
  return (
    resolveDisplayImageUrl(trimmed) ||
    resolvePublicImageUrl(trimmed) ||
    trimmed
  );
}

function displayNameFromProfile(
  profile: ProfileRow | null | undefined,
  snapshotName?: string | null,
): string {
  return (
    profile?.display_name?.trim() ||
    profile?.nickname?.trim() ||
    snapshotName?.trim() ||
    ''
  );
}

/**
 * クラブ主催イベントの参加者を取得し、profiles.avatar_url を結合して
 * メンバー一覧（主催者優先）を返す。
 */
export async function fetchClubMembersWithAvatars(options: {
  club: Club;
  events: SportEvent[];
  currentUserId?: string | null;
}): Promise<ClubMember[]> {
  const { club, events, currentUserId } = options;
  const clubEvents = eventsForClub(club.id, events);
  const remoteEventIds = [
    ...new Set(
      clubEvents
        .map((event) => event.id)
        .filter((id) => isRemoteEventId(id)),
    ),
  ];

  const hostIdRaw = club.id.trim();
  const hostId =
    hostIdRaw === 'me'
      ? currentUserId?.trim() || hostIdRaw
      : hostIdRaw;
  const hostImage =
    resolveAvatarUri(club.imageUri) ||
    resolveAvatarUri(clubEvents[0]?.hostImageUri) ||
    undefined;

  const seedHost: ClubMember = {
    id: hostId,
    name: club.hostName || club.name,
    imageUri: hostImage,
    role: 'host',
  };

  // 既存メンバー（サンプル等）をベースに、リモートで上書き・追記する
  const byId = new Map<string, ClubMember>();
  if (seedHost.id) {
    byId.set(seedHost.id, seedHost);
  }
  for (const member of club.members) {
    const id = member.id?.trim();
    if (!id) continue;
    const existing = byId.get(id);
    byId.set(id, {
      ...existing,
      ...member,
      id,
      imageUri:
        resolveAvatarUri(member.imageUri) ||
        resolveAvatarUri(existing?.imageUri) ||
        (member.role === 'host' ? hostImage : undefined),
      role: member.role === 'host' || existing?.role === 'host' ? 'host' : 'member',
    });
  }

  if (!isSupabaseConfigured() || remoteEventIds.length === 0) {
    return orderClubMembers([...byId.values()], hostId);
  }

  const client = getSupabaseClient();
  if (!client) return orderClubMembers([...byId.values()], hostId);

  try {
    let rows: ParticipantRow[] | null = null;
    let error: { message?: string; code?: string } | null = null;

    const withSnapshot = await client
      .from('event_participants')
      .select('event_id, user_id, status, display_name, avatar_url, created_at')
      .in('event_id', remoteEventIds)
      .eq('status', 'joined')
      .order('created_at', { ascending: true });
    rows = withSnapshot.data as ParticipantRow[] | null;
    error = withSnapshot.error;

    if (
      error &&
      (error.message?.includes('display_name') ||
        error.message?.includes('avatar_url') ||
        error.code === '42703')
    ) {
      const legacy = await client
        .from('event_participants')
        .select('event_id, user_id, status, created_at')
        .in('event_id', remoteEventIds)
        .eq('status', 'joined')
        .order('created_at', { ascending: true });
      rows = legacy.data as ParticipantRow[] | null;
      error = legacy.error;
    }

    if (error) {
      console.warn('[clubMembers] participants fetch failed', {
        code: error.code,
        message: error.message,
        eventCount: remoteEventIds.length,
      });
      return orderClubMembers([...byId.values()], hostId);
    }

    const joined = rows ?? [];
    const userIds = [
      ...new Set(
        joined
          .map((row) => String(row.user_id || '').trim())
          .filter(Boolean),
      ),
    ];
    // 主催者プロフィールも必ず取る（イベント未参加でもアバター表示）
    if (hostId && !userIds.includes(hostId) && looksLikeFirebaseUid(hostId)) {
      userIds.push(hostId);
    }

    const profileById = new Map<string, ProfileRow>();
    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await client
        .from('profiles')
        .select('id, display_name, nickname, avatar_url')
        .in('id', userIds);
      if (profileError) {
        console.warn('[clubMembers] profiles join failed', {
          code: profileError.code,
          message: profileError.message,
          requested: userIds.length,
        });
      } else {
        for (const profile of profiles ?? []) {
          const id = String((profile as ProfileRow).id ?? '').trim();
          if (!id) continue;
          profileById.set(id, profile as ProfileRow);
        }
      }
    }

    // 主催者アバターを profiles から補強
    const hostProfile = profileById.get(hostId);
    if (hostProfile) {
      const name = displayNameFromProfile(hostProfile, seedHost.name) || seedHost.name;
      const imageUri =
        resolveAvatarUri(hostProfile.avatar_url) || seedHost.imageUri;
      byId.set(hostId, {
        id: hostId,
        name,
        imageUri,
        role: 'host',
      });
    }

    // 参加者をマージ（同一ユーザーは最初の参加を優先）
    for (const row of joined) {
      const userId = String(row.user_id || '').trim();
      if (!userId) continue;
      const profile = profileById.get(userId);
      const existing = byId.get(userId);
      const name =
        displayNameFromProfile(profile, row.display_name) ||
        existing?.name ||
        '名前未設定';
      const imageUri =
        resolveAvatarUri(profile?.avatar_url) ||
        resolveAvatarUri(row.avatar_url) ||
        resolveAvatarUri(existing?.imageUri) ||
        undefined;
      const isHost = userId === hostId || existing?.role === 'host';
      byId.set(userId, {
        id: userId,
        name,
        imageUri,
        role: isHost ? 'host' : 'member',
      });
    }

    // 実参加者・profiles が取れたら、サンプル用の仮メンバーは落とす
    if (joined.length > 0 || profileById.size > 0) {
      for (const [id, member] of [...byId.entries()]) {
        if (member.role === 'host' || id === hostId) continue;
        if (!looksLikeFirebaseUid(id)) {
          byId.delete(id);
        }
      }
    }

    if (__DEV__) {
      const list = [...byId.values()];
      console.log('[clubMembers] enriched', {
        clubId: club.id,
        events: remoteEventIds.length,
        members: list.length,
        withAvatar: list.filter((m) => Boolean(m.imageUri)).length,
      });
    }

    return orderClubMembers([...byId.values()], hostId);
  } catch (error) {
    console.warn('[clubMembers] enrich threw', error);
    return orderClubMembers([...byId.values()], hostId);
  }
}

function looksLikeFirebaseUid(id: string) {
  // Firebase UID は通常 28 文字前後の英数字。スラッグ（サンプルクラブ）は除外。
  return /^[A-Za-z0-9]{20,}$/.test(id);
}

function orderClubMembers(members: ClubMember[], hostId: string): ClubMember[] {
  const hosts = members.filter(
    (m) => m.role === 'host' || (hostId && m.id === hostId),
  );
  const others = members.filter(
    (m) => !(m.role === 'host' || (hostId && m.id === hostId)),
  );
  // ホストが複数ある場合は先頭の1人だけ
  const host = hosts[0]
    ? [{ ...hosts[0], role: 'host' as const }]
    : [];
  return [...host, ...others];
}
