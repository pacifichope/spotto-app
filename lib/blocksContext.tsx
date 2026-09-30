import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';

import {
  deleteBlockInSupabase,
  eventHostUserId,
  fetchBlocksFromSupabase,
  filterBlockedAttendees,
  filterBlockedEvents,
  hiddenUserIdSet,
  insertBlockInSupabase,
  isSelfUserId,
  isUserBlocked,
  loadBlocksSnapshot,
  saveBlocksSnapshot,
  type BlockedUser,
  type BlockUserInput,
  type BlocksSnapshot,
} from '@/lib/blocks';
import type { EventAttendee } from '@/lib/attendees';
import { isSupabaseConfigured } from '@/lib/supabase';

type BlocksContextValue = {
  blockedUsers: BlockedUser[];
  /** 自分がブロックした ID（解除 UI 用） */
  blockedIds: Set<string>;
  /** 非表示対象（自分がブロック + 相手が自分をブロック） */
  hiddenIds: Set<string>;
  /** 自分がそのユーザーをブロックしているか */
  isBlocked: (userId: string | null | undefined) => boolean;
  /** 双方向ブロックにより非表示にすべきか */
  isHidden: (userId: string | null | undefined) => boolean;
  isEventBlocked: (event: { host: string; hostId?: string }) => boolean;
  filterEvents: <T extends { host: string; hostId?: string }>(events: T[]) => T[];
  filterAttendees: (attendees: EventAttendee[]) => EventAttendee[];
  blockUser: (input: BlockUserInput) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<void>;
  clearBlockedUsers: () => void;
  refreshBlocks: () => Promise<void>;
};

const BlocksContext = createContext<BlocksContextValue | null>(null);

function applySnapshot(
  snapshot: BlocksSnapshot,
  setBlockedUsers: (users: BlockedUser[]) => void,
  setBlockedMeIds: (ids: string[]) => void,
) {
  setBlockedUsers(snapshot.blockedUsers);
  setBlockedMeIds(snapshot.blockedMeIds);
  void saveBlocksSnapshot(snapshot);
}

export function BlocksProvider({ children }: { children: ReactNode }) {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedMeIds, setBlockedMeIds] = useState<string[]>([]);

  const refreshBlocks = useCallback(async () => {
    const remote = await fetchBlocksFromSupabase();
    if (remote) {
      applySnapshot(remote, setBlockedUsers, setBlockedMeIds);
      return;
    }
    const local = await loadBlocksSnapshot();
    setBlockedUsers(local.blockedUsers);
    setBlockedMeIds(local.blockedMeIds);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const local = await loadBlocksSnapshot();
      if (cancelled) return;
      setBlockedUsers(local.blockedUsers);
      setBlockedMeIds(local.blockedMeIds);
      const remote = await fetchBlocksFromSupabase();
      if (cancelled || !remote) return;
      applySnapshot(remote, setBlockedUsers, setBlockedMeIds);
    })();

    if (!isSupabaseConfigured()) {
      return () => {
        cancelled = true;
      };
    }

    let unsub: (() => void) | null = null;
    void (async () => {
      const { subscribeFirebaseAuth } = await import('@/lib/firebaseAuthSession');
      if (cancelled) return;
      unsub = subscribeFirebaseAuth((user) => {
        setTimeout(() => {
          void (async () => {
            if (!user) {
              if (cancelled) return;
              setBlockedUsers([]);
              setBlockedMeIds([]);
              void saveBlocksSnapshot({ blockedUsers: [], blockedMeIds: [] });
              return;
            }
            const remote = await fetchBlocksFromSupabase();
            if (cancelled || !remote) return;
            applySnapshot(remote, setBlockedUsers, setBlockedMeIds);
          })();
        }, 0);
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const persistLocal = useCallback(
    (nextUsers: BlockedUser[], nextBlockedMe: string[]) => {
      setBlockedUsers(nextUsers);
      setBlockedMeIds(nextBlockedMe);
      void saveBlocksSnapshot({
        blockedUsers: nextUsers,
        blockedMeIds: nextBlockedMe,
      });
    },
    [],
  );

  const blockedIds = useMemo(
    () => new Set(blockedUsers.map((user) => user.id)),
    [blockedUsers],
  );

  const hiddenIds = useMemo(
    () => hiddenUserIdSet(blockedUsers, blockedMeIds),
    [blockedUsers, blockedMeIds],
  );

  const blockUser = useCallback(
    async (input: BlockUserInput) => {
      const id = input.id.trim();
      const name = input.name.trim();
      if (!id || !name || isSelfUserId(id)) return false;

      const previousUsers = blockedUsers;
      const nextUsers: BlockedUser[] = [
        {
          id,
          name,
          imageUri: input.imageUri?.trim() || undefined,
          bio: input.bio?.trim() || undefined,
          blockedAt: Date.now(),
        },
        ...blockedUsers.filter((item) => item.id !== id),
      ];
      persistLocal(nextUsers, blockedMeIds);

      if (isSupabaseConfigured()) {
        const remote = await insertBlockInSupabase(input);
        if (!remote.ok) {
          persistLocal(previousUsers, blockedMeIds);
          Alert.alert(
            'ブロックに失敗しました',
            remote.error || '時間をおいて再度お試しください。',
          );
          return false;
        }
        // クラウドを正として再同期（双方向の blockedMe も含む）
        void refreshBlocks();
      }
      return true;
    },
    [blockedMeIds, blockedUsers, persistLocal, refreshBlocks],
  );

  const unblockUser = useCallback(
    async (userId: string) => {
      const id = userId.trim();
      if (!id) return;
      const previousUsers = blockedUsers;
      persistLocal(
        blockedUsers.filter((item) => item.id !== id),
        blockedMeIds,
      );

      if (isSupabaseConfigured()) {
        const remote = await deleteBlockInSupabase(id);
        if (!remote.ok) {
          persistLocal(previousUsers, blockedMeIds);
          Alert.alert(
            'ブロック解除に失敗しました',
            remote.error || '時間をおいて再度お試しください。',
          );
          return;
        }
        void refreshBlocks();
      }
    },
    [blockedMeIds, blockedUsers, persistLocal, refreshBlocks],
  );

  const clearBlockedUsers = useCallback(() => {
    const ids = blockedUsers.map((user) => user.id);
    persistLocal([], []);
    for (const id of ids) {
      void deleteBlockInSupabase(id);
    }
  }, [blockedUsers, persistLocal]);

  const value = useMemo<BlocksContextValue>(
    () => ({
      blockedUsers,
      blockedIds,
      hiddenIds,
      isBlocked: (userId) => isUserBlocked(userId, blockedIds),
      isHidden: (userId) => isUserBlocked(userId, hiddenIds),
      isEventBlocked: (event) =>
        isUserBlocked(eventHostUserId(event), hiddenIds),
      filterEvents: (events) => filterBlockedEvents(events, hiddenIds),
      filterAttendees: (attendees) =>
        filterBlockedAttendees(attendees, hiddenIds),
      blockUser,
      unblockUser,
      clearBlockedUsers,
      refreshBlocks,
    }),
    [
      blockedUsers,
      blockedIds,
      hiddenIds,
      blockUser,
      unblockUser,
      clearBlockedUsers,
      refreshBlocks,
    ],
  );

  return (
    <BlocksContext.Provider value={value}>{children}</BlocksContext.Provider>
  );
}

export function useBlocks() {
  const ctx = useContext(BlocksContext);
  if (!ctx) {
    throw new Error('useBlocks must be used within BlocksProvider');
  }
  return ctx;
}
