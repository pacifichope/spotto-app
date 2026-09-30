import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { clubIdFromEvent } from '@/lib/clubs';
import { fetchJoinedClubsForUser } from '@/lib/clubsRemote';
import { useEvents } from '@/lib/eventsContext';

const STORAGE_KEY = '@spotto/joined-clubs';

type AsyncStorageType =
  typeof import('@react-native-async-storage/async-storage').default;

function getAsyncStorage(): AsyncStorageType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage')
      .default as AsyncStorageType;
  } catch {
    return null;
  }
}

type ClubsContextValue = {
  joinedClubIds: Set<string>;
  joinClub: (clubId: string) => void;
  leaveClub: (clubId: string) => void;
  isClubJoined: (clubId: string) => boolean;
  resetJoinedClubs: () => void;
  /** 参加イベント / リモートから参加クラブを再同期 */
  refreshJoinedClubs: () => Promise<void>;
};

const ClubsContext = createContext<ClubsContextValue | null>(null);

export function ClubsProvider({ children }: { children: ReactNode }) {
  const { currentUserId, events, joinedIds } = useEvents();
  const [joinedClubIds, setJoinedClubIds] = useState<Set<string>>(
    () => new Set(),
  );

  const persist = useCallback((next: Set<string>) => {
    const storage = getAsyncStorage();
    void storage?.setItem(STORAGE_KEY, JSON.stringify([...next]));
  }, []);

  const mergeClubIds = useCallback(
    (ids: Iterable<string>) => {
      setJoinedClubIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const raw of ids) {
          const id = String(raw || '').trim();
          if (!id || next.has(id)) continue;
          next.add(id);
          changed = true;
        }
        if (!changed) return prev;
        persist(next);
        return next;
      });
    },
    [persist],
  );

  useEffect(() => {
    let cancelled = false;
    const storage = getAsyncStorage();
    if (!storage) return;
    storage
      .getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return;
        setJoinedClubIds(
          new Set(parsed.filter((id): id is string => typeof id === 'string')),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // 参加中イベントからクラブ ID を導出（ローカル同期）
  useEffect(() => {
    const derived: string[] = [];
    const safeEvents = Array.isArray(events) ? events : [];
    const joined =
      joinedIds instanceof Set ? joinedIds : new Set<string>();
    for (const event of safeEvents) {
      if (!joined.has(event.id)) continue;
      const clubId = clubIdFromEvent(event);
      if (clubId) derived.push(clubId);
      const hostId = String(event.hostId || '').trim();
      if (hostId) derived.push(hostId);
    }
    if (derived.length > 0) mergeClubIds(derived);
  }, [events, joinedIds, mergeClubIds]);

  const refreshJoinedClubs = useCallback(async () => {
    const uid = String(currentUserId || '').trim();
    if (!uid) return;
    const remote = await fetchJoinedClubsForUser(uid);
    if (!remote.ok) {
      console.warn('[clubs] refreshJoinedClubs failed', remote.error);
      return;
    }
    mergeClubIds(remote.data.map((stub) => stub.id));
  }, [currentUserId, mergeClubIds]);

  // ログインユーザーの参加クラブをリモートから同期
  useEffect(() => {
    const uid = String(currentUserId || '').trim();
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      const remote = await fetchJoinedClubsForUser(uid);
      if (cancelled || !remote.ok) return;
      mergeClubIds(remote.data.map((stub) => stub.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, mergeClubIds]);

  const joinClub = useCallback(
    (clubId: string) => {
      if (!clubId) return;
      mergeClubIds([clubId]);
    },
    [mergeClubIds],
  );

  const leaveClub = useCallback(
    (clubId: string) => {
      if (!clubId) return;
      setJoinedClubIds((prev) => {
        if (!prev.has(clubId)) return prev;
        const next = new Set(prev);
        next.delete(clubId);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const isClubJoined = useCallback(
    (clubId: string) => {
      if (!clubId) return false;
      try {
        return Boolean(joinedClubIds?.has?.(clubId));
      } catch {
        return false;
      }
    },
    [joinedClubIds],
  );

  const resetJoinedClubs = useCallback(() => {
    const next = new Set<string>();
    setJoinedClubIds(next);
    persist(next);
  }, [persist]);

  const value = useMemo(
    () => ({
      joinedClubIds,
      joinClub,
      leaveClub,
      isClubJoined,
      resetJoinedClubs,
      refreshJoinedClubs,
    }),
    [
      joinedClubIds,
      joinClub,
      leaveClub,
      isClubJoined,
      resetJoinedClubs,
      refreshJoinedClubs,
    ],
  );

  return (
    <ClubsContext.Provider value={value}>{children}</ClubsContext.Provider>
  );
}

export function useClubs() {
  const ctx = useContext(ClubsContext);
  if (!ctx) {
    throw new Error('useClubs must be used within ClubsProvider');
  }
  return ctx;
}
