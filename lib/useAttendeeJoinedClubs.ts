import { useEffect, useMemo, useRef, useState } from 'react';

import { clubIdFromEvent, type Club } from '@/lib/clubs';
import {
  clubStubFromSportEvent,
  fetchJoinedClubsForUser,
  resolveClubsFromIds,
  type RemoteClubStub,
} from '@/lib/clubsRemote';
import type { SportEvent } from '@/lib/events';
import type { OrganizerProfile } from '@/lib/organizerProfile';

function uniqIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * プロフィール対象ユーザーの参加クラブをシード + リモートから解決する。
 */
export function useAttendeeJoinedClubs(options: {
  userId: string | null | undefined;
  seedClubIds?: string[] | null;
  hintClubIds?: string[] | null;
  /** ヒント用のイベント（現在開いているイベントなど） */
  hintEvents?: SportEvent[] | null;
  events: SportEvent[];
  organizerProfile: OrganizerProfile;
  currentUserId?: string | null;
  enabled?: boolean;
}) {
  const {
    userId,
    seedClubIds,
    hintClubIds,
    hintEvents,
    events,
    organizerProfile,
    currentUserId,
    enabled = true,
  } = options;

  const localIds = useMemo(
    () =>
      uniqIds([
        ...(Array.isArray(seedClubIds) ? seedClubIds : []),
        ...(Array.isArray(hintClubIds) ? hintClubIds : []),
      ]),
    [seedClubIds, hintClubIds],
  );

  const localStubs = useMemo(() => {
    const stubs: RemoteClubStub[] = [];
    const seen = new Set<string>();
    const pushEvent = (event: SportEvent | null | undefined) => {
      if (!event) return;
      const stub = clubStubFromSportEvent(event);
      if (!stub || seen.has(stub.id)) return;
      seen.add(stub.id);
      stubs.push(stub);
    };
    for (const event of Array.isArray(hintEvents) ? hintEvents : []) {
      pushEvent(event);
    }
    // ヒント ID がローカル events にあればスタブ化（resolveClub 失敗時用）
    const safeEvents = Array.isArray(events) ? events : [];
    for (const id of localIds) {
      const match = safeEvents.find(
        (event) =>
          clubIdFromEvent(event) === id ||
          String(event.hostId || '').trim() === id,
      );
      pushEvent(match);
    }
    return stubs;
  }, [hintEvents, events, localIds]);

  const [remoteStubs, setRemoteStubs] = useState<RemoteClubStub[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchGen = useRef(0);

  useEffect(() => {
    const uid = String(userId || '').trim();
    if (!enabled || !uid) {
      setRemoteStubs([]);
      setLoading(false);
      return;
    }

    const gen = ++fetchGen.current;
    setRemoteStubs([]);
    setLoading(true);

    void (async () => {
      try {
        const remote = await fetchJoinedClubsForUser(uid);
        if (fetchGen.current !== gen) return;
        if (remote.ok) {
          setRemoteStubs(remote.data);
        } else {
          console.warn('[useAttendeeJoinedClubs] remote failed', {
            userId: uid,
            error: remote.error,
          });
        }
      } catch (error) {
        if (fetchGen.current !== gen) return;
        console.warn('[useAttendeeJoinedClubs] threw', { userId: uid, error });
      } finally {
        if (fetchGen.current === gen) setLoading(false);
      }
    })();
  }, [userId, enabled]);

  const clubs = useMemo(() => {
    if (!enabled || !String(userId || '').trim()) return [];
    const stubs = [...localStubs, ...remoteStubs];
    const ids = uniqIds([
      ...localIds,
      ...stubs.map((stub) => stub.id),
    ]);
    try {
      return resolveClubsFromIds(
        ids,
        Array.isArray(events) ? events : [],
        organizerProfile,
        currentUserId,
        stubs,
      ).filter((club): club is Club => Boolean(club?.id));
    } catch (error) {
      console.warn('[useAttendeeJoinedClubs] resolve failed', error);
      return stubs.map((stub) => ({
        id: stub.id,
        name: stub.name,
        imageUri: stub.coverUri,
        coverUri: stub.coverUri,
        bio: stub.bio || '',
        tag: stub.tag,
        hostName: stub.name,
        members: [],
      }));
    }
  }, [
    enabled,
    userId,
    localIds,
    localStubs,
    remoteStubs,
    events,
    organizerProfile,
    currentUserId,
  ]);

  return { clubs, loading };
}
