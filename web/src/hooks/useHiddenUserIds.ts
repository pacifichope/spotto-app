'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { createAuthedSupabase } from '@/lib/supabase';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';

async function fetchBlockSets(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<{ blockedIds: Set<string>; hiddenIds: Set<string> }> {
  const uid = input.userId.trim();
  const empty = { blockedIds: new Set<string>(), hiddenIds: new Set<string>() };
  if (!uid) return empty;

  try {
    const supabase = createAuthedSupabase(input.getIdToken);
    const [{ data: outgoing }, { data: incoming }] = await Promise.all([
      supabase.from('blocks').select('blocked_id').eq('blocker_id', uid),
      supabase.from('blocks').select('blocker_id').eq('blocked_id', uid),
    ]);

    const blockedIds = new Set<string>();
    const hiddenIds = new Set<string>();
    for (const row of (outgoing ?? []) as { blocked_id?: string }[]) {
      const id = String(row.blocked_id || '').trim();
      if (!id) continue;
      blockedIds.add(id);
      hiddenIds.add(id);
    }
    for (const row of (incoming ?? []) as { blocker_id?: string }[]) {
      const id = String(row.blocker_id || '').trim();
      if (id) hiddenIds.add(id);
    }
    return { blockedIds, hiddenIds };
  } catch {
    return empty;
  }
}

/** ブロック関係により非表示にすべきユーザー ID */
export function useHiddenUserIds() {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(() => new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const reload = useCallback(async () => {
    if (!user) {
      setBlockedIds(new Set());
      setHiddenIds(new Set());
      return;
    }
    const next = await fetchBlockSets({
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
    });
    setBlockedIds(next.blockedIds);
    setHiddenIds(next.hiddenIds);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const markBlocked = useCallback((userId: string) => {
    const id = userId.trim();
    if (!id) return;
    setBlockedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setHiddenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const markUnblocked = useCallback((userId: string) => {
    const id = userId.trim();
    if (!id) return;
    setBlockedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setHiddenIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return {
    /** 自分がブロックした ID（解除 UI 用） */
    blockedIds,
    /** 非表示対象（双方向） */
    hiddenIds,
    reload,
    markBlocked,
    markUnblocked,
  };
}
