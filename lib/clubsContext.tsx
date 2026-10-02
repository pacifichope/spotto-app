import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { clubIdFromEvent } from '@/lib/clubs';
import { fetchJoinedClubsForUser } from '@/lib/clubsRemote';
import { useEvents } from '@/lib/eventsContext';

/** 旧: 端末全体で共有されていたキー（ユーザー切替で件数が混ざる）。移行せず削除する。 */
const LEGACY_STORAGE_KEY = '@spotto/joined-clubs';

function storageKeyForUser(userId: string) {
  return `${LEGACY_STORAGE_KEY}:${userId.trim()}`;
}

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

function parseClubIdList(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
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

type ClubsContextValue = {
  joinedClubIds: Set<string>;
  joinClub: (clubId: string) => void;
  leaveClub: (clubId: string) => void;
  isClubJoined: (clubId: string) => boolean;
  resetJoinedClubs: () => void;
  /** 退会時など、現ユーザーの永続化データも削除 */
  clearPersistedJoinedClubs: () => void;
  /** 参加イベント / リモートから参加クラブを再同期 */
  refreshJoinedClubs: () => Promise<void>;
};

const ClubsContext = createContext<ClubsContextValue | null>(null);

const EMPTY_CLUB_IDS: Set<string> = new Set();

export function ClubsProvider({ children }: { children: ReactNode }) {
  const { currentUserId, events, joinedIds } = useEvents();
  const [joinedClubIds, setJoinedClubIds] = useState<Set<string>>(
    () => new Set(),
  );
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const loadGenerationRef = useRef(0);

  const persist = useCallback((next: Set<string>, userId?: string | null) => {
    const uid = String(userId ?? currentUserIdRef.current ?? '').trim();
    if (!uid) return;
    const storage = getAsyncStorage();
    void storage?.setItem(storageKeyForUser(uid), JSON.stringify([...next]));
  }, []);

  const mergeClubIds = useCallback(
    (ids: Iterable<string>) => {
      const uid = String(currentUserIdRef.current || '').trim();
      if (!uid) return;
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
        persist(next, uid);
        return next;
      });
    },
    [persist],
  );

  const replaceClubIds = useCallback(
    (ids: Iterable<string>, userId: string) => {
      const uid = userId.trim();
      if (!uid) return;
      const next = new Set<string>();
      for (const raw of ids) {
        const id = String(raw || '').trim();
        if (id) next.add(id);
      }
      setJoinedClubIds(next);
      persist(next, uid);
    },
    [persist],
  );

  // ユーザー切替・ログアウト直後は先に空にして件数の持ち越しを防ぐ
  useLayoutEffect(() => {
    setJoinedClubIds(new Set());
  }, [currentUserId]);

  // ユーザー単位で端末キャッシュ＋リモートを読み込み（レガシー共通キーは破棄）
  useEffect(() => {
    const storage = getAsyncStorage();
    void storage?.removeItem(LEGACY_STORAGE_KEY);

    const uid = String(currentUserId || '').trim();
    if (!uid) return;

    const generation = ++loadGenerationRef.current;
    let cancelled = false;

    void (async () => {
      try {
        const local = storage
          ? parseClubIdList(await storage.getItem(storageKeyForUser(uid)))
          : new Set<string>();

        if (cancelled || generation !== loadGenerationRef.current) return;

        const next = new Set(local);
        const remote = await fetchJoinedClubsForUser(uid);
        if (cancelled || generation !== loadGenerationRef.current) return;

        if (remote.ok) {
          for (const stub of remote.data) {
            const id = String(stub.id || '').trim();
            if (id) next.add(id);
          }
        } else if (__DEV__) {
          console.warn('[clubs] load remote failed', remote.error);
        }

        // 新規ユーザーは local/remote とも空 → 件数 0
        replaceClubIds(next, uid);
      } catch (error) {
        if (__DEV__) {
          console.warn('[clubs] load joined clubs failed', error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, replaceClubIds]);

  // 参加中イベントからクラブ ID を導出（ログイン中のみ）
  useEffect(() => {
    const uid = String(currentUserId || '').trim();
    if (!uid) return;

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
  }, [currentUserId, events, joinedIds, mergeClubIds]);

  const refreshJoinedClubs = useCallback(async () => {
    const uid = String(currentUserId || '').trim();
    if (!uid) {
      setJoinedClubIds(new Set());
      return;
    }
    const remote = await fetchJoinedClubsForUser(uid);
    if (!remote.ok) {
      console.warn('[clubs] refreshJoinedClubs failed', remote.error);
      return;
    }
    // リモート結果で置換（幽霊 ID を落とす）。参加イベント由来は直後の effect で再マージ。
    replaceClubIds(
      remote.data.map((stub) => stub.id),
      uid,
    );
  }, [currentUserId, replaceClubIds]);

  const joinClub = useCallback(
    (clubId: string) => {
      if (!clubId) return;
      if (!String(currentUserIdRef.current || '').trim()) return;
      mergeClubIds([clubId]);
    },
    [mergeClubIds],
  );

  const leaveClub = useCallback(
    (clubId: string) => {
      if (!clubId) return;
      const uid = String(currentUserIdRef.current || '').trim();
      if (!uid) return;
      setJoinedClubIds((prev) => {
        if (!prev.has(clubId)) return prev;
        const next = new Set(prev);
        next.delete(clubId);
        persist(next, uid);
        return next;
      });
    },
    [persist],
  );

  const isClubJoined = useCallback(
    (clubId: string) => {
      if (!clubId) return false;
      if (!String(currentUserId || '').trim()) return false;
      try {
        return Boolean(joinedClubIds?.has?.(clubId));
      } catch {
        return false;
      }
    },
    [currentUserId, joinedClubIds],
  );

  const resetJoinedClubs = useCallback(() => {
    // メモリのみクリア（ログアウト時）。ユーザー別ストレージは残し、再ログインで復元する。
    setJoinedClubIds(new Set());
  }, []);

  const clearPersistedJoinedClubs = useCallback(() => {
    const uid = String(currentUserIdRef.current || '').trim();
    setJoinedClubIds(new Set());
    if (!uid) return;
    const storage = getAsyncStorage();
    void storage?.removeItem(storageKeyForUser(uid));
  }, []);

  const exposedJoinedClubIds = currentUserId
    ? joinedClubIds
    : EMPTY_CLUB_IDS;

  const value = useMemo(
    () => ({
      joinedClubIds: exposedJoinedClubIds,
      joinClub,
      leaveClub,
      isClubJoined,
      resetJoinedClubs,
      refreshJoinedClubs,
      clearPersistedJoinedClubs,
    }),
    [
      exposedJoinedClubIds,
      joinClub,
      leaveClub,
      isClubJoined,
      resetJoinedClubs,
      refreshJoinedClubs,
      clearPersistedJoinedClubs,
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
