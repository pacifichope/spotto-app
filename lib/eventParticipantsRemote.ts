import type { EventAttendee } from '@/lib/attendees';
import { isRemoteEventId } from '@/lib/chatsRemote';
import { resolveAuthUserId } from '@/lib/eventsRemote';
import { ensureFirebaseAuthenticatedClaim } from '@/lib/firebaseEnsureClaims';
import {
  firebaseJwtHasAuthenticatedRole,
  getFirebaseIdToken,
  peekFirebaseJwtClaims,
} from '@/lib/firebaseIdToken';
import {
  resolveDisplayImageUrl,
  resolvePublicImageUrl,
  isLocalImageUri,
} from '@/lib/storage';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { getUserProfile, type UserGender } from '@/lib/userProfile';
import { pushProfileToRemote } from '@/lib/userProfileRemote';

export type ParticipantStatus = 'joined';

export type EventParticipantRow = {
  id: string;
  event_id: string;
  user_id: string;
  status: ParticipantStatus;
  created_at: string;
  /** 購入・確保した参加枠数（未設定時は 1） */
  ticket_quantity?: number | null;
  /** 参加登録時点の表示名スナップショット */
  display_name?: string | null;
  /** 参加登録時点のアバター URL スナップショット */
  avatar_url?: string | null;
  /** 参加登録時点の性別スナップショット */
  gender?: string | null;
  profiles?: {
    display_name?: string | null;
    nickname?: string | null;
    avatar_url?: string | null;
    gender?: string | null;
  } | null;
};

export type ParticipantsRemoteResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function asGender(raw: string | null | undefined): UserGender | undefined {
  if (raw === '男性' || raw === '女性') return raw;
  return undefined;
}

function logParticipantsError(
  op: 'join' | 'leave' | 'fetchMine' | 'fetchEvent' | 'fetchBatch' | 'ensureHost',
  detail: Record<string, unknown>,
) {
  // 読み取り系の権限不足はゲスト閲覧で起き得る。LogBox 赤画面を避けるため warn にする。
  const code = String(detail.code ?? '');
  const message = String(detail.message ?? detail.error ?? '');
  const isPermission =
    code === '42501' || /permission denied/i.test(message);
  if (
    isPermission &&
    (op === 'fetchEvent' || op === 'fetchMine' || op === 'fetchBatch')
  ) {
    if (__DEV__) {
      console.warn(`[eventParticipants] ${op} permission denied (soft)`, detail);
    }
    return;
  }
  console.error(`[eventParticipants] ${op} failed`, detail);
}

function isPermissionDeniedError(error: {
  code?: string;
  message?: string;
} | null) {
  if (!error) return false;
  return (
    error.code === '42501' ||
    /permission denied/i.test(String(error.message || ''))
  );
}

function resolveAvatarUri(raw: string | null | undefined): string | undefined {
  const trimmed = String(raw || '').trim();
  if (!trimmed || isLocalImageUri(trimmed)) return undefined;
  return resolveDisplayImageUrl(trimmed) || resolvePublicImageUrl(trimmed) || trimmed;
}

/**
 * 参加登録前に profiles へ本人の表示名・アバターを upsert し、
 * event_participants 用のスナップショットも返す。
 */
async function ensureJoinerProfileSnapshot(userId: string): Promise<{
  displayName: string;
  avatarUrl: string | null;
  gender: '男性' | '女性' | null;
  profileOk: boolean;
}> {
  const local = getUserProfile();
  const displayName = local.name.trim();
  const gender =
    local.gender === '男性' || local.gender === '女性' ? local.gender : null;
  const push = await pushProfileToRemote(userId, local);
  if (!push.ok) {
    console.warn('[eventParticipants] ensureJoinerProfile failed', {
      userId,
      error: push.error,
      displayName: displayName || null,
      hasAvatar: Boolean(local.imageUri),
    });
  } else if (__DEV__) {
    console.log('[eventParticipants] ensureJoinerProfile ok', {
      userId,
      displayName: displayName || null,
      hasAvatar: Boolean(local.imageUri),
    });
  }
  const avatarUrl =
    resolveDisplayImageUrl(local.imageUri) ||
    (local.imageUri && !isLocalImageUri(local.imageUri)
      ? local.imageUri.trim()
      : null);
  return {
    displayName,
    avatarUrl,
    gender,
    profileOk: push.ok,
  };
}

function formatParticipantsRemoteError(
  message: string | undefined,
  fallback: string,
) {
  const raw = String(message || '').trim() || fallback;
  if (/operator does not exist:\s*text\s*=\s*uuid|text = uuid/i.test(raw)) {
    return (
      `${raw}\n\n` +
      'event_participants.user_id（text）と uuid の比較が残っています。' +
      ' supabase/apply_event_participants_firebase_rls.sql を SQL Editor で実行し、' +
      'RLS を requesting_user_id()（text）同士の比較に更新してください。'
    );
  }
  if (/row level security|rls/i.test(raw)) {
    return (
      `${raw}\n\n` +
      'Firebase JWT の sub と user_id が一致しているか、' +
      'RLS が requesting_user_id()（auth.jwt()->>\'sub\'）を使っているか確認してください。' +
      ' profiles 一覧閲覧には supabase/apply_profiles_select_attendees.sql も必要です。' +
      ' SQL: supabase/apply_event_participants_firebase_rls.sql'
    );
  }
  if (/permission denied|42501/i.test(raw)) {
    return (
      `${raw}\n\n` +
      'event_participants の SELECT 権限が不足しています。' +
      ' supabase/apply_event_participants_select_public.sql を SQL Editor で実行し、' +
      'anon / authenticated に GRANT SELECT と RLS SELECT ポリシーを付与してください。' +
      ' （JWT が anon 扱いの場合も SELECT できるようになります）'
    );
  }
  if (/foreign key|violates foreign key/i.test(raw)) {
    return (
      `${raw}\n\n` +
      'event_id が events に存在するか、' +
      'user_id の auth.users FK が残っていないか確認してください。' +
      ' SQL: supabase/apply_event_participants_firebase_rls.sql'
    );
  }
  if (/invalid input syntax for type uuid/i.test(raw)) {
    return (
      `${raw}\n\n` +
      'user_id が uuid のままの可能性があります。Firebase UID 用に text へ変更してください。' +
      ' SQL: supabase/apply_event_participants_firebase_rls.sql'
    );
  }
  return raw;
}

/** 参加登録前に JWT sub / role を確保し、デバッグ用メタを返す */
async function resolveJoinAuthContext(): Promise<{
  userId: string | null;
  hasAuthenticatedRole: boolean;
  jwtSub: string | null;
}> {
  await ensureFirebaseAuthenticatedClaim();
  const token = await getFirebaseIdToken(false);
  const claims = token ? peekFirebaseJwtClaims(token) : null;
  const jwtSub =
    typeof claims?.sub === 'string' && claims.sub.trim()
      ? claims.sub.trim()
      : null;
  const userId = (await resolveAuthUserId()) ?? jwtSub;
  return {
    userId,
    hasAuthenticatedRole: token
      ? firebaseJwtHasAuthenticatedRole(token)
      : false,
    jwtSub,
  };
}

export function participantRowToAttendee(
  row: EventParticipantRow,
  currentUserId?: string | null,
  options?: { clubIds?: string[] },
): EventAttendee {
  const profile = row.profiles;
  const name =
    profile?.display_name?.trim() ||
    profile?.nickname?.trim() ||
    row.display_name?.trim() ||
    '';
  const imageUri =
    resolveAvatarUri(profile?.avatar_url) ||
    resolveAvatarUri(row.avatar_url) ||
    undefined;

  if (!name) {
    console.warn('[eventParticipants] attendee missing display name', {
      userId: row.user_id,
      eventId: row.event_id,
      hasProfile: Boolean(profile),
      snapshotName: row.display_name ?? null,
    });
  }

  return {
    id: row.user_id,
    name: name || '名前未設定',
    imageUri,
    gender: asGender(profile?.gender) || asGender(row.gender),
    self: Boolean(currentUserId && row.user_id === currentUserId),
    ticketQuantity: Math.max(1, Math.floor(Number(row.ticket_quantity) || 1)),
    clubIds: options?.clubIds,
  };
}

export async function fetchMyParticipationIds(): Promise<
  ParticipantsRemoteResult<{
    joinedIds: string[];
  }>
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  const auth = await resolveJoinAuthContext();
  const userId = auth.userId;
  if (!userId) {
    return { ok: true, data: { joinedIds: [] } };
  }

  try {
    const { data, error } = await client
      .from('event_participants')
      .select('event_id, status')
      .eq('user_id', userId);

    if (error) {
      if (isPermissionDeniedError(error)) {
        logParticipantsError('fetchMine', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          userId,
          hasAuthenticatedRole: auth.hasAuthenticatedRole,
          jwtSub: auth.jwtSub,
          softFallback: true,
        });
        return { ok: true, data: { joinedIds: [] } };
      }
      logParticipantsError('fetchMine', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId,
        hasAuthenticatedRole: auth.hasAuthenticatedRole,
        jwtSub: auth.jwtSub,
      });
      return {
        ok: false,
        error: formatParticipantsRemoteError(
          error.message,
          '参加情報の取得に失敗しました',
        ),
      };
    }

    const joinedIds: string[] = [];
    for (const row of data ?? []) {
      const eventId = String((row as { event_id?: string }).event_id ?? '');
      const status = (row as { status?: string }).status;
      if (!eventId) continue;
      // キャンセル待ちは廃止。joined のみ参加扱い
      if (status === 'joined' || !status) joinedIds.push(eventId);
    }
    return { ok: true, data: { joinedIds } };
  } catch (error) {
    logParticipantsError('fetchMine', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '参加情報の取得に失敗しました',
    };
  }
}

export type MyParticipantTicket = {
  id: string;
  eventId: string;
  userId: string;
  ticketQuantity: number;
  createdAt: string;
};

/** 自分の参加行（チケット表示用の予約 ID・枚数・申込日時） */
export async function fetchMyParticipantTicket(
  eventId: string,
): Promise<ParticipantsRemoteResult<MyParticipantTicket | null>> {
  const eid = String(eventId || '').trim();
  if (!eid) return { ok: true, data: null };
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  const auth = await resolveJoinAuthContext();
  const userId = auth.userId;
  if (!userId) return { ok: true, data: null };

  try {
    const { data, error } = await client
      .from('event_participants')
      .select('id, event_id, user_id, status, created_at, ticket_quantity')
      .eq('event_id', eid)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isPermissionDeniedError(error)) {
        return { ok: true, data: null };
      }
      return {
        ok: false,
        error: formatParticipantsRemoteError(
          error.message,
          '予約情報の取得に失敗しました',
        ),
      };
    }
    if (!data) return { ok: true, data: null };
    const status = String((data as { status?: string }).status || '');
    if (status && status !== 'joined') return { ok: true, data: null };

    return {
      ok: true,
      data: {
        id: String((data as { id?: string }).id || ''),
        eventId: String((data as { event_id?: string }).event_id || eid),
        userId: String((data as { user_id?: string }).user_id || userId),
        ticketQuantity: Math.max(
          1,
          Math.floor(Number((data as { ticket_quantity?: number }).ticket_quantity) || 1),
        ),
        createdAt: String((data as { created_at?: string }).created_at || ''),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '予約情報の取得に失敗しました',
    };
  }
}

type ParticipantProfileRow = {
  display_name?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
  gender?: string | null;
};

function putProfileRow(
  profileById: Map<string, ParticipantProfileRow>,
  profile: ParticipantProfileRow & { id?: string | null },
) {
  const id = String(profile.id ?? '').trim();
  if (!id) return;
  const prev = profileById.get(id);
  profileById.set(id, {
    display_name: profile.display_name ?? prev?.display_name ?? null,
    nickname: profile.nickname ?? prev?.nickname ?? null,
    avatar_url: profile.avatar_url ?? prev?.avatar_url ?? null,
    // 性別は後勝ちではなく、どちらか一方でも入っていれば残す
    gender: asGender(profile.gender) || asGender(prev?.gender) || profile.gender || prev?.gender || null,
  });
}

/**
 * 参加者の profiles（氏名・アバター・性別）。
 * 1) SECURITY DEFINER RPC（ゲストでも性別まで読める）
 * 2) profiles 直接 SELECT（RLS が通る場合の補完）
 */
async function fetchParticipantProfiles(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  userIds: string[],
  options?: { eventId?: string; eventIds?: string[] },
) {
  const profileById = new Map<string, ParticipantProfileRow>();
  if (userIds.length === 0) return profileById;

  const eventIds = [
    ...new Set(
      [
        ...(options?.eventId ? [options.eventId] : []),
        ...(options?.eventIds ?? []),
      ]
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  ];

  if (eventIds.length > 0) {
    const rpcResults = await Promise.all(
      eventIds.map(async (eventId) => {
        const { data, error } = await client.rpc(
          'profiles_for_event_attendees',
          { p_event_id: eventId },
        );
        if (error) {
          if (__DEV__) {
            console.warn('[eventParticipants] profiles RPC failed', {
              eventId,
              code: error.code,
              message: error.message,
              note:
                'supabase/apply_profiles_for_event_attendees.sql を適用すると' +
                ' ゲストでも性別が読めます。',
            });
          }
          return [] as ParticipantProfileRow[];
        }
        return (Array.isArray(data) ? data : []) as (ParticipantProfileRow & {
          id?: string | null;
        })[];
      }),
    );
    for (const rows of rpcResults) {
      for (const profile of rows) putProfileRow(profileById, profile);
    }
  }

  const missing = userIds.filter((id) => !profileById.has(id));
  const selectIds = missing.length > 0 ? missing : userIds;
  // RPC で揃っていても gender 欠損分を直接 SELECT で補完
  const needsGenderFill = userIds.some((id) => {
    const row = profileById.get(id);
    return row && !asGender(row.gender);
  });
  if (selectIds.length > 0 || needsGenderFill) {
    const { data: profiles, error } = await client
      .from('profiles')
      .select('id, display_name, nickname, avatar_url, gender')
      .in('id', needsGenderFill ? userIds : selectIds);
    if (error) {
      if (profileById.size === 0) {
        console.warn('[eventParticipants] profiles fetch failed', {
          code: error.code,
          message: error.message,
          hint: error.hint,
          requested: userIds.length,
          note:
            'profiles_select_authenticated が無いと他ユーザーが読めません。' +
            ' supabase/apply_profiles_select_attendees.sql または' +
            ' apply_profiles_for_event_attendees.sql を実行してください。',
        });
      }
    } else {
      for (const profile of profiles ?? []) {
        putProfileRow(
          profileById,
          profile as ParticipantProfileRow & { id?: string | null },
        );
      }
    }
  }

  if (__DEV__) {
    const missingAfter = userIds.filter((id) => !profileById.has(id));
    const withGender = userIds.filter((id) =>
      asGender(profileById.get(id)?.gender),
    ).length;
    console.log('[eventParticipants] profiles joined', {
      requested: userIds.length,
      fetched: profileById.size,
      withGender,
      rpcEvents: eventIds.length,
      missingCount: missingAfter.length,
      missingSample: missingAfter.slice(0, 5),
    });
  }
  return profileById;
}

const PARTICIPANT_SELECT_WITH_SNAPSHOT =
  'id, event_id, user_id, status, created_at, ticket_quantity, display_name, avatar_url, gender';
const PARTICIPANT_SELECT_SNAPSHOT_NO_GENDER =
  'id, event_id, user_id, status, created_at, ticket_quantity, display_name, avatar_url';
const PARTICIPANT_SELECT_BASE =
  'id, event_id, user_id, status, created_at, ticket_quantity';
const PARTICIPANT_SELECT_LEGACY = 'id, event_id, user_id, status, created_at';

async function mapJoinedAttendees(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  rows: EventParticipantRow[],
  currentUserId?: string | null,
  eventId?: string,
) {
  const joinedRows = rows.filter((row) => row.status === 'joined' || !row.status);
  const userIds = [...new Set(joinedRows.map((row) => row.user_id).filter(Boolean))];
  const eid = String(eventId || '').trim();
  const profileById = await fetchParticipantProfiles(client, userIds, {
    eventId: eid || undefined,
  });

  let clubIds: string[] | undefined;
  if (eid && isRemoteEventId(eid)) {
    const { data: eventRow } = await client
      .from('events')
      .select('host_id')
      .eq('id', eid)
      .maybeSingle();
    const hostId = String(
      (eventRow as { host_id?: string } | null)?.host_id ?? '',
    ).trim();
    if (hostId) clubIds = [hostId];
  }

  const attendees = joinedRows.map((row) =>
    participantRowToAttendee(
      { ...row, profiles: profileById.get(row.user_id) ?? null },
      currentUserId,
      clubIds ? { clubIds } : undefined,
    ),
  );
  if (__DEV__) {
    console.log('[eventParticipants] fetchEvent mapped', {
      eventId,
      joinedRows: joinedRows.length,
      attendees: attendees.length,
      named: attendees.filter((a) => a.name && a.name !== '名前未設定').length,
      withAvatar: attendees.filter((a) => Boolean(a.imageUri)).length,
      withGender: attendees.filter((a) => Boolean(a.gender)).length,
      clubIds,
    });
  }
  return { attendees, joinedRows };
}

export async function fetchEventParticipants(
  eventId: string,
  currentUserId?: string | null,
): Promise<
  ParticipantsRemoteResult<{
    attendees: EventAttendee[];
    joinedCount: number;
  }>
> {
  if (!isSupabaseConfigured() || !isRemoteEventId(eventId)) {
    return { ok: false, error: 'remote unavailable' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  try {
    let data: EventParticipantRow[] | null = null;
    let error: { code?: string; message: string; details?: string; hint?: string } | null =
      null;

    const withSnapshot = await client
      .from('event_participants')
      .select(PARTICIPANT_SELECT_WITH_SNAPSHOT)
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    data = withSnapshot.data as EventParticipantRow[] | null;
    error = withSnapshot.error;

    if (
      error &&
      (error.message?.includes('gender') || error.code === '42703')
    ) {
      const noGender = await client
        .from('event_participants')
        .select(PARTICIPANT_SELECT_SNAPSHOT_NO_GENDER)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });
      data = noGender.data as EventParticipantRow[] | null;
      error = noGender.error;
    }

    if (
      error &&
      (error.message?.includes('display_name') ||
        error.message?.includes('avatar_url') ||
        error.code === '42703')
    ) {
      const withQty = await client
        .from('event_participants')
        .select(PARTICIPANT_SELECT_BASE)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });
      data = withQty.data as EventParticipantRow[] | null;
      error = withQty.error;
    }

    if (
      error &&
      (error.message?.includes('ticket_quantity') || error.code === '42703')
    ) {
      const legacy = await client
        .from('event_participants')
        .select(PARTICIPANT_SELECT_LEGACY)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });
      data = legacy.data as EventParticipantRow[] | null;
      error = legacy.error;
    }

    if (error) {
      if (isPermissionDeniedError(error)) {
        logParticipantsError('fetchEvent', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          eventId,
          softFallback: true,
        });
        // ゲストでも画面を落とさない（空の参加者一覧で続行）
        return {
          ok: true,
          data: { attendees: [], joinedCount: 0 },
        };
      }
      logParticipantsError('fetchEvent', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        eventId,
      });
      return {
        ok: false,
        error: formatParticipantsRemoteError(
          error.message,
          '参加者一覧の取得に失敗しました',
        ),
      };
    }

    const rows = data ?? [];
    const { attendees, joinedRows } = await mapJoinedAttendees(
      client,
      rows,
      currentUserId,
      eventId,
    );
    const joinedCount = joinedRows.reduce((sum, row) => {
      const qty = Math.max(1, Math.floor(Number(row.ticket_quantity) || 1));
      return sum + qty;
    }, 0);

    return {
      ok: true,
      data: {
        attendees,
        joinedCount,
      },
    };
  } catch (error) {
    logParticipantsError('fetchEvent', {
      error: error instanceof Error ? error.message : String(error),
      eventId,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '参加者一覧の取得に失敗しました',
    };
  }
}

export type EventParticipantsBundle = {
  attendees: EventAttendee[];
  joinedCount: number;
};

/**
 * ホーム一覧向け: 複数イベントの参加者を一括取得（profiles.avatar_url 付き）。
 */
export async function fetchEventParticipantsBatch(
  eventIds: string[],
  currentUserId?: string | null,
): Promise<
  ParticipantsRemoteResult<Record<string, EventParticipantsBundle>>
> {
  const ids = [
    ...new Set(
      eventIds
        .map((id) => String(id || '').trim())
        .filter((id) => isRemoteEventId(id)),
    ),
  ];
  if (ids.length === 0) {
    return { ok: true, data: {} };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'remote unavailable' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  const empty: Record<string, EventParticipantsBundle> = {};
  for (const id of ids) {
    empty[id] = { attendees: [], joinedCount: 0 };
  }

  try {
    let data: EventParticipantRow[] | null = null;
    let error: {
      code?: string;
      message: string;
      details?: string;
      hint?: string;
    } | null = null;

    const withSnapshot = await client
      .from('event_participants')
      .select(PARTICIPANT_SELECT_WITH_SNAPSHOT)
      .in('event_id', ids)
      .order('created_at', { ascending: true });
    data = withSnapshot.data as EventParticipantRow[] | null;
    error = withSnapshot.error;

    if (
      error &&
      (error.message?.includes('gender') || error.code === '42703')
    ) {
      const noGender = await client
        .from('event_participants')
        .select(PARTICIPANT_SELECT_SNAPSHOT_NO_GENDER)
        .in('event_id', ids)
        .order('created_at', { ascending: true });
      data = noGender.data as EventParticipantRow[] | null;
      error = noGender.error;
    }

    if (
      error &&
      (error.message?.includes('display_name') ||
        error.message?.includes('avatar_url') ||
        error.code === '42703')
    ) {
      const withQty = await client
        .from('event_participants')
        .select(PARTICIPANT_SELECT_BASE)
        .in('event_id', ids)
        .order('created_at', { ascending: true });
      data = withQty.data as EventParticipantRow[] | null;
      error = withQty.error;
    }

    if (
      error &&
      (error.message?.includes('ticket_quantity') || error.code === '42703')
    ) {
      const legacy = await client
        .from('event_participants')
        .select(PARTICIPANT_SELECT_LEGACY)
        .in('event_id', ids)
        .order('created_at', { ascending: true });
      data = legacy.data as EventParticipantRow[] | null;
      error = legacy.error;
    }

    if (error) {
      if (isPermissionDeniedError(error)) {
        logParticipantsError('fetchBatch', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          eventCount: ids.length,
          softFallback: true,
        });
        return { ok: true, data: empty };
      }
      logParticipantsError('fetchBatch', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        eventCount: ids.length,
      });
      return {
        ok: false,
        error: formatParticipantsRemoteError(
          error.message,
          '参加者一覧の取得に失敗しました',
        ),
      };
    }

    const rows = (data ?? []).filter(
      (row) => row.status === 'joined' || !row.status,
    );
    const userIds = [
      ...new Set(rows.map((row) => row.user_id).filter(Boolean)),
    ];
    const profileById = await fetchParticipantProfiles(client, userIds, {
      eventIds: ids,
    });

    const byEvent: Record<string, EventParticipantRow[]> = {};
    for (const id of ids) byEvent[id] = [];
    for (const row of rows) {
      const eid = String(row.event_id ?? '').trim();
      if (!eid || !byEvent[eid]) continue;
      byEvent[eid].push(row);
    }

    const result: Record<string, EventParticipantsBundle> = { ...empty };
    for (const eid of ids) {
      const eventRows = byEvent[eid] ?? [];
      const attendees = eventRows.map((row) =>
        participantRowToAttendee(
          { ...row, profiles: profileById.get(row.user_id) ?? null },
          currentUserId,
        ),
      );
      const joinedCount = eventRows.reduce((sum, row) => {
        const qty = Math.max(1, Math.floor(Number(row.ticket_quantity) || 1));
        return sum + qty;
      }, 0);
      result[eid] = { attendees, joinedCount };
    }

    if (__DEV__) {
      const withFaces = Object.values(result).filter(
        (item) => item.attendees.length > 0,
      ).length;
      console.log('[eventParticipants] fetchBatch ok', {
        events: ids.length,
        withFaces,
        profiles: profileById.size,
      });
    }

    return { ok: true, data: result };
  } catch (error) {
    logParticipantsError('fetchBatch', {
      error: error instanceof Error ? error.message : String(error),
      eventCount: ids.length,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '参加者一覧の取得に失敗しました',
    };
  }
}

export async function joinEventRemote(
  eventId: string,
  _status: ParticipantStatus = 'joined',
  options?: { ticketQuantity?: number },
): Promise<
  ParticipantsRemoteResult<{ status: ParticipantStatus; ticketQuantity: number }>
> {
  // キャンセル待ちは廃止。常に joined のみ受け付ける
  const status: ParticipantStatus = 'joined';
  if (!isSupabaseConfigured()) {
    console.error('[eventParticipants] join aborted: supabase not configured');
    return { ok: false, error: 'Supabase が未設定です' };
  }
  if (!isRemoteEventId(eventId)) {
    console.error('[eventParticipants] join aborted: invalid eventId', {
      eventId,
    });
    return { ok: false, error: 'remote unavailable' };
  }
  const client = getSupabaseClient();
  if (!client) {
    console.error('[eventParticipants] join aborted: no client');
    return { ok: false, error: 'Supabase が未設定です' };
  }

  const auth = await resolveJoinAuthContext();
  const userId = auth.userId;
  if (!userId) {
    logParticipantsError('join', {
      reason: 'missing_user_id',
      eventId,
      status,
      hasAuthenticatedRole: auth.hasAuthenticatedRole,
      jwtSub: auth.jwtSub,
    });
    return { ok: false, error: 'ログインが必要です' };
  }

  const ticketQuantity =
    status === 'joined'
      ? Math.max(1, Math.floor(Number(options?.ticketQuantity) || 1))
      : 1;

  const snapshot = await ensureJoinerProfileSnapshot(userId);
  if (!snapshot.displayName) {
    logParticipantsError('join', {
      reason: 'missing_display_name',
      eventId,
      userId,
      note: 'プロフィール名が空のまま参加しようとしています',
    });
  }

  const payload: Record<string, unknown> = {
    // events.id / event_participants.event_id は uuid
    event_id: eventId.trim().toLowerCase(),
    // Firebase UID。DB 側は text（uuid と比較しない）
    user_id: String(userId).trim(),
    status,
    ticket_quantity: ticketQuantity,
    display_name: snapshot.displayName || null,
    avatar_url: snapshot.avatarUrl,
    gender: snapshot.gender,
  };

  console.log('[eventParticipants] join payload', {
    event_id: payload.event_id,
    user_id: payload.user_id,
    status: payload.status,
    ticket_quantity: ticketQuantity,
    display_name: payload.display_name,
    hasAvatar: Boolean(payload.avatar_url),
    profileOk: snapshot.profileOk,
    hasAuthenticatedRole: auth.hasAuthenticatedRole,
    jwtSub: auth.jwtSub,
    userIdMatchesJwtSub: payload.user_id === auth.jwtSub,
  });

  if (!auth.hasAuthenticatedRole) {
    console.warn(
      '[eventParticipants] JWT role is not authenticated — RLS may reject insert',
    );
  }
  if (auth.jwtSub && payload.user_id !== auth.jwtSub) {
    console.warn(
      '[eventParticipants] user_id !== jwt.sub — RLS with_check will fail',
      { user_id: payload.user_id, jwtSub: auth.jwtSub },
    );
  }

  try {
    let data: {
      event_id?: string;
      user_id?: string;
      status?: string;
      ticket_quantity?: number | null;
    } | null = null;
    let error: { code?: string; message: string; details?: string; hint?: string } | null =
      null;

    const first = await client
      .from('event_participants')
      .upsert(payload, { onConflict: 'event_id,user_id' })
      .select('event_id, user_id, status, ticket_quantity')
      .maybeSingle();
    data = first.data;
    error = first.error;

    // ticket_quantity / snapshot 列未マイグレーション時は段階的に再試行
    if (
      error &&
      (error.message?.includes('ticket_quantity') ||
        error.message?.includes('display_name') ||
        error.message?.includes('avatar_url') ||
        error.message?.includes('gender') ||
        error.code === '42703')
    ) {
      const slim: Record<string, unknown> = {
        event_id: payload.event_id,
        user_id: payload.user_id,
        status: payload.status,
      };
      if (
        !error.message?.includes('ticket_quantity') &&
        payload.ticket_quantity != null
      ) {
        slim.ticket_quantity = payload.ticket_quantity;
      }
      if (
        !error.message?.includes('display_name') &&
        payload.display_name != null
      ) {
        slim.display_name = payload.display_name;
      }
      if (
        !error.message?.includes('avatar_url') &&
        payload.avatar_url != null
      ) {
        slim.avatar_url = payload.avatar_url;
      }
      if (
        !error.message?.includes('gender') &&
        payload.gender != null
      ) {
        slim.gender = payload.gender;
      }
      const retry = await client
        .from('event_participants')
        .upsert(slim, { onConflict: 'event_id,user_id' })
        .select('event_id, user_id, status, ticket_quantity')
        .maybeSingle();
      data = retry.data;
      error = retry.error;

      if (
        error &&
        (error.message?.includes('ticket_quantity') || error.code === '42703')
      ) {
        const minimal = {
          event_id: payload.event_id,
          user_id: payload.user_id,
          status: payload.status,
        };
        const retry2 = await client
          .from('event_participants')
          .upsert(minimal, { onConflict: 'event_id,user_id' })
          .select('event_id, user_id, status')
          .maybeSingle();
        data = retry2.data;
        error = retry2.error;
      }
    }

    if (error) {
      logParticipantsError('join', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payload,
        hasAuthenticatedRole: auth.hasAuthenticatedRole,
        jwtSub: auth.jwtSub,
      });
      return {
        ok: false,
        error: formatParticipantsRemoteError(
          error.message,
          '参加登録に失敗しました',
        ),
      };
    }

    console.log('[eventParticipants] join ok', data ?? payload);
    return { ok: true, data: { status, ticketQuantity } };
  } catch (error) {
    logParticipantsError('join', {
      error: error instanceof Error ? error.message : String(error),
      payload,
    });
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : '参加登録に失敗しました',
    };
  }
}

export async function leaveEventRemote(
  eventId: string,
): Promise<ParticipantsRemoteResult<void>> {
  if (!isSupabaseConfigured() || !isRemoteEventId(eventId)) {
    return { ok: false, error: 'remote unavailable' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  const auth = await resolveJoinAuthContext();
  const userId = auth.userId;
  if (!userId) {
    return { ok: false, error: 'ログインが必要です' };
  }

  console.log('[eventParticipants] leave payload', {
    event_id: eventId,
    user_id: userId,
  });

  try {
    const { error } = await client
      .from('event_participants')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (error) {
      logParticipantsError('leave', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        eventId,
        userId,
      });
      return {
        ok: false,
        error: formatParticipantsRemoteError(
          error.message,
          '参加キャンセルに失敗しました',
        ),
      };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    logParticipantsError('leave', {
      error: error instanceof Error ? error.message : String(error),
      eventId,
      userId,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '参加キャンセルに失敗しました',
    };
  }
}

/** 主催者を参加者として登録（イベント作成直後） */
export async function ensureHostParticipant(
  eventId: string,
  hostId: string,
): Promise<void> {
  if (!isSupabaseConfigured() || !isRemoteEventId(eventId) || !hostId) return;
  const client = getSupabaseClient();
  if (!client) return;

  const snapshot = await ensureJoinerProfileSnapshot(hostId);
  const payload: Record<string, unknown> = {
    event_id: eventId,
    user_id: hostId,
    status: 'joined' as const,
    display_name: snapshot.displayName || null,
    avatar_url: snapshot.avatarUrl,
    gender: snapshot.gender,
  };
  console.log('[eventParticipants] ensureHost payload', {
    ...payload,
    profileOk: snapshot.profileOk,
  });

  try {
    let { error } = await client
      .from('event_participants')
      .upsert(payload, { onConflict: 'event_id,user_id' });
    if (
      error &&
      (error.message?.includes('display_name') ||
        error.message?.includes('avatar_url') ||
        error.code === '42703')
    ) {
      const retry = await client.from('event_participants').upsert(
        {
          event_id: eventId,
          user_id: hostId,
          status: 'joined',
        },
        { onConflict: 'event_id,user_id' },
      );
      error = retry.error;
    }
    if (error) {
      logParticipantsError('ensureHost', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payload,
      });
    }
  } catch (error) {
    logParticipantsError('ensureHost', {
      error: error instanceof Error ? error.message : String(error),
      payload,
    });
  }
}
