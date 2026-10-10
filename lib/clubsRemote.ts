import { isRemoteEventId } from '@/lib/chatsRemote';
import {
  clubIdFromEvent,
  resolveClub,
  type Club,
} from '@/lib/clubs';
import { ensureFirebaseAuthenticatedClaim } from '@/lib/firebaseEnsureClaims';
import { SPORT_IMAGE_PRESETS, type SportEvent } from '@/lib/events';
import type { OrganizerProfile } from '@/lib/organizerProfile';
import {
  resolveDisplayImageUrl,
  resolvePublicImageUrl,
} from '@/lib/storage';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type ClubsRemoteResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type RemoteClubStub = {
  id: string;
  name: string;
  coverUri: string;
  tag?: string;
};

const EVENT_ID_CHUNK = 80;

function resolveCover(raw: string | null | undefined): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return SPORT_IMAGE_PRESETS.default;
  return (
    resolveDisplayImageUrl(trimmed) ||
    resolvePublicImageUrl(trimmed) ||
    trimmed
  );
}

function stubFromEventRow(row: {
  host_id?: string | null;
  host_name?: string | null;
  image_uri?: string | null;
  sport?: string | null;
}): RemoteClubStub | null {
  const hostId = String(row.host_id ?? '').trim();
  if (!hostId) return null;
  const hostName = String(row.host_name ?? '').trim() || 'クラブ';
  const sport = String(row.sport ?? '').trim();
  return {
    id: hostId,
    name: hostName,
    coverUri: resolveCover(row.image_uri),
    tag: sport || undefined,
  };
}

/** ローカルイベントからクラブスタブを組み立てる（リモート失敗時のフォールバック） */
export function clubStubFromSportEvent(
  event: Pick<
    SportEvent,
    'host' | 'hostId' | 'imageUri' | 'sport'
  >,
): RemoteClubStub | null {
  const id = clubIdFromEvent(event);
  if (!id) return null;
  const name = String(event.host || '').trim() || 'クラブ';
  return {
    id,
    name,
    coverUri: resolveCover(event.imageUri),
    tag: String(event.sport || '').trim() || undefined,
  };
}

/**
 * 指定ユーザーが参加したイベントの主催者（クラブ）を返す。
 * ローカル events に無くても表示できるようスタブ情報付き。
 */
export async function fetchJoinedClubsForUser(
  userId: string,
): Promise<ClubsRemoteResult<RemoteClubStub[]>> {
  const uid = String(userId || '').trim();
  if (!uid) return { ok: true, data: [] };
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  try {
    await ensureFirebaseAuthenticatedClaim();

    const { data: parts, error: partsError } = await client
      .from('event_participants')
      .select('event_id, status')
      .eq('user_id', uid);

    if (partsError) {
      console.warn('[clubsRemote] participants fetch failed', {
        userId: uid,
        code: partsError.code,
        message: partsError.message,
        hint: partsError.hint,
      });
      return {
        ok: false,
        error: partsError.message || '参加クラブの取得に失敗しました',
      };
    }

    const eventIds = [
      ...new Set(
        (parts ?? [])
          .filter((row) => {
            const status = String(
              (row as { status?: string }).status ?? 'joined',
            ).trim();
            // joined / 空 / 旧データの null を参加扱い
            return !status || status === 'joined';
          })
          .map((row) =>
            String((row as { event_id?: string }).event_id ?? '').trim(),
          )
          .filter((id) => id && isRemoteEventId(id)),
      ),
    ];

    const byHost = new Map<string, RemoteClubStub>();

    if (eventIds.length > 0) {
      for (let i = 0; i < eventIds.length; i += EVENT_ID_CHUNK) {
        const chunk = eventIds.slice(i, i + EVENT_ID_CHUNK);
        const { data: eventRows, error: eventsError } = await client
          .from('events')
          .select('id, host_id, host_name, image_uri, sport')
          .in('id', chunk);

        if (eventsError) {
          console.warn('[clubsRemote] events fetch failed', {
            userId: uid,
            chunkSize: chunk.length,
            code: eventsError.code,
            message: eventsError.message,
          });
          return {
            ok: false,
            error: eventsError.message || '参加クラブの取得に失敗しました',
          };
        }

        for (const row of eventRows ?? []) {
          const stub = stubFromEventRow(
            row as {
              host_id?: string | null;
              host_name?: string | null;
              image_uri?: string | null;
              sport?: string | null;
            },
          );
          if (stub && !byHost.has(stub.id)) byHost.set(stub.id, stub);
        }
      }
    }

    // 自分が主催している場合もクラブとして含める
    if (!byHost.has(uid)) {
      const { data: hosted, error: hostedError } = await client
        .from('events')
        .select('id, host_id, host_name, image_uri, sport')
        .eq('host_id', uid)
        .order('created_at', { ascending: false })
        .limit(1);

      if (hostedError) {
        console.warn('[clubsRemote] hosted events fetch failed', {
          userId: uid,
          message: hostedError.message,
        });
      } else if (hosted && hosted.length > 0) {
        const stub = stubFromEventRow(
          hosted[0] as {
            host_id?: string | null;
            host_name?: string | null;
            image_uri?: string | null;
            sport?: string | null;
          },
        );
        if (stub) byHost.set(stub.id, stub);
      }
    }

    // clubs テーブルのカバー／名前で上書き
    const hostIds = [...byHost.keys()];
    if (hostIds.length > 0) {
      const { data: clubRows } = await client
        .from('clubs')
        .select('id, name, cover_image_url, image_url')
        .in('id', hostIds);
      for (const row of clubRows ?? []) {
        const id = String((row as { id?: string }).id ?? '').trim();
        if (!id) continue;
        const existing = byHost.get(id);
        const cover =
          String(
            (row as { cover_image_url?: string }).cover_image_url ?? '',
          ).trim() ||
          String((row as { image_url?: string }).image_url ?? '').trim();
        const name =
          String((row as { name?: string }).name ?? '').trim() ||
          existing?.name ||
          'クラブ';
        if (existing) {
          byHost.set(id, {
            ...existing,
            name,
            coverUri: cover ? resolveCover(cover) : existing.coverUri,
          });
        } else if (cover) {
          byHost.set(id, {
            id,
            name,
            coverUri: resolveCover(cover),
          });
        }
      }
    }

    if (__DEV__) {
      console.log('[clubsRemote] fetchJoinedClubsForUser', {
        userId: uid,
        participantRows: (parts ?? []).length,
        eventIds: eventIds.length,
        clubs: byHost.size,
      });
    }

    return { ok: true, data: [...byHost.values()] };
  } catch (error) {
    console.warn('[clubsRemote] fetchJoinedClubsForUser threw', {
      userId: uid,
      error,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '参加クラブの取得に失敗しました',
    };
  }
}

/** @deprecated 互換用。fetchJoinedClubsForUser を推奨 */
export async function fetchJoinedClubIdsForUser(
  userId: string,
): Promise<ClubsRemoteResult<string[]>> {
  const result = await fetchJoinedClubsForUser(userId);
  if (!result.ok) return result;
  return { ok: true, data: result.data.map((c) => c.id) };
}

function stubToClub(stub: RemoteClubStub): Club {
  return {
    id: stub.id,
    name: stub.name,
    imageUri: stub.coverUri,
    coverUri: stub.coverUri,
    tag: stub.tag,
    hostName: stub.name,
    members: [
      {
        id: stub.id,
        name: stub.name,
        imageUri: stub.coverUri,
        role: 'host',
      },
    ],
  };
}

/**
 * シード / ヒント / リモートのクラブを解決して Club[] にする。
 * resolveClub で取れる場合はリッチな情報を優先し、なければスタブを使う。
 */
export function resolveClubsFromIds(
  clubIds: string[],
  events: SportEvent[],
  organizer: OrganizerProfile,
  currentUserId?: string | null,
  remoteStubs?: RemoteClubStub[],
): Club[] {
  const stubById = new Map(
    (remoteStubs ?? []).map((stub) => [stub.id, stub] as const),
  );
  const safeEvents = Array.isArray(events) ? events : [];
  const seen = new Set<string>();
  const clubs: Club[] = [];

  const pushId = (raw: string) => {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    try {
      const resolved = resolveClub(id, safeEvents, organizer, currentUserId);
      if (resolved?.id) {
        clubs.push(resolved);
        return;
      }
    } catch {
      // fall through to stub
    }
    const stub = stubById.get(id);
    if (stub) clubs.push(stubToClub(stub));
  };

  for (const id of clubIds ?? []) pushId(id);

  return clubs;
}
