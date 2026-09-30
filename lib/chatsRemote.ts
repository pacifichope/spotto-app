import type { ChatMessage, EventChatMode } from '@/lib/chats';
import { formatChatClock, parseChatMode } from '@/lib/chats';
import { resolveAuthUserId } from '@/lib/eventsRemote';
import { ensureFirebaseAuthenticatedClaim } from '@/lib/firebaseEnsureClaims';
import {
  firebaseJwtHasAuthenticatedRole,
  getFirebaseIdToken,
  peekFirebaseJwtClaims,
} from '@/lib/firebaseIdToken';
import {
  isLocalImageUri,
  resolvePublicImageUrl,
} from '@/lib/storage';
import { authorizeSupabaseRealtime, getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type ChatMessageRow = {
  id: string;
  event_id: string;
  mode: string;
  dm_user_id: string | null;
  sender_id: string;
  sender_name: string;
  sender_image_uri: string | null;
  body: string;
  created_at: string;
};

export type ChatsRemoteResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRemoteEventId(eventId: string) {
  return UUID_RE.test(eventId.trim());
}

function logChatError(
  op: 'fetch' | 'insert' | 'subscribe' | 'subscribe-inbox' | 'delete',
  detail: Record<string, unknown>,
) {
  console.error(`[chatsRemote] ${op} failed`, detail);
}

export function rowToChatMessage(
  row: ChatMessageRow,
  currentUserId: string | null,
): ChatMessage {
  const at = new Date(row.created_at).getTime();
  const isMe = Boolean(currentUserId && row.sender_id === currentUserId);
  const rawImage = row.sender_image_uri?.trim() || undefined;
  return {
    id: row.id,
    role: isMe ? 'me' : 'member',
    name: row.sender_name || (isMe ? '自分' : '参加者'),
    text: row.body,
    time: formatChatClock(Number.isFinite(at) ? at : Date.now()),
    at: Number.isFinite(at) ? at : Date.now(),
    seeded: false,
    // ローカル URI は他端末で壊れるため公開 URL のみ採用
    imageUri: resolvePublicImageUrl(rawImage) || undefined,
    senderId: row.sender_id,
  };
}

/** profiles.avatar_url で欠けた／ローカルだったアイコンを補完 */
async function enrichChatAvatarsFromProfiles(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  if (messages.length === 0) return messages;
  const client = getSupabaseClient();
  if (!client) return messages;

  const needIds = [
    ...new Set(
      messages
        .filter((m) => {
          if (!m.senderId) return false;
          if (!m.imageUri) return true;
          return isLocalImageUri(m.imageUri);
        })
        .map((m) => m.senderId!)
        .filter(Boolean),
    ),
  ];
  if (needIds.length === 0) {
    // 既存 URL も正規化
    return messages.map((m) => ({
      ...m,
      imageUri: resolvePublicImageUrl(m.imageUri) || m.imageUri,
    }));
  }

  try {
    const { data, error } = await client
      .from('profiles')
      .select('id, avatar_url')
      .in('id', needIds);
    if (error) {
      console.warn('[chatsRemote] profile avatar enrich failed', {
        code: error.code,
        message: error.message,
      });
      return messages;
    }
    const byId = new Map<string, string>();
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? '');
      const url = resolvePublicImageUrl(
        (row as { avatar_url?: string | null }).avatar_url,
      );
      if (id && url) byId.set(id, url);
    }
    return messages.map((m) => {
      const fromMsg = resolvePublicImageUrl(m.imageUri);
      if (fromMsg) return { ...m, imageUri: fromMsg };
      const fromProfile = m.senderId ? byId.get(m.senderId) : undefined;
      return { ...m, imageUri: fromProfile || undefined };
    });
  } catch (error) {
    console.warn('[chatsRemote] profile avatar enrich threw', error);
    return messages;
  }
}

/** host ロール表示用に主催者 ID で上書き */
export function annotateHostRoles(
  messages: ChatMessage[],
  hostUserId?: string | null,
): ChatMessage[] {
  const hostId = hostUserId?.trim();
  if (!hostId) return messages;
  return messages.map((message) => {
    if (message.role === 'me') return message;
    if (message.senderId === hostId) {
      return { ...message, role: 'host' as const };
    }
    return message;
  });
}

function formatChatRemoteError(message: string | undefined, fallback: string) {
  const raw = String(message || '').trim() || fallback;
  if (/row level security|rls|42501/i.test(raw)) {
    return (
      `${raw}\n\n` +
      'sender_id が JWT sub と一致しているか、' +
      'RLS が requesting_user_id() を使っているか確認してください。' +
      ' SQL: supabase/apply_chat_messages_firebase_rls.sql'
    );
  }
  if (/permission denied|jwt|authenticated/i.test(raw)) {
    return (
      `${raw}\n\n` +
      'JWT に role: "authenticated" が必要です。ensure-claims を確認してください。'
    );
  }
  return raw;
}

async function resolveChatSenderId(): Promise<{
  senderId: string | null;
  hasAuthenticatedRole: boolean;
  tokenPresent: boolean;
}> {
  await ensureFirebaseAuthenticatedClaim();
  const token = await getFirebaseIdToken(false);
  if (!token) {
    return {
      senderId: null,
      hasAuthenticatedRole: false,
      tokenPresent: false,
    };
  }
  const claims = peekFirebaseJwtClaims(token);
  const senderId =
    typeof claims?.sub === 'string' && claims.sub.trim()
      ? claims.sub.trim()
      : null;
  return {
    senderId,
    hasAuthenticatedRole: firebaseJwtHasAuthenticatedRole(token),
    tokenPresent: true,
  };
}

export async function fetchChatMessages(input: {
  eventId: string;
  mode: EventChatMode;
  dmUserId?: string | null;
  currentUserId?: string | null;
  hostUserId?: string | null;
}): Promise<ChatsRemoteResult<ChatMessage[]>> {
  if (!isSupabaseConfigured() || !isRemoteEventId(input.eventId)) {
    return { ok: false, error: 'remote unavailable' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  try {
    const auth = await resolveChatSenderId();
    if (!auth.tokenPresent || !auth.senderId) {
      const error = 'ログインセッションを確認できません。再ログインしてください。';
      logChatError('fetch', { error, eventId: input.eventId, mode: input.mode });
      return { ok: false, error };
    }
    if (!auth.hasAuthenticatedRole) {
      const error =
        '認証トークンに role: "authenticated" がありません。API（ensure-claims）を確認してください。';
      logChatError('fetch', {
        error,
        eventId: input.eventId,
        senderId: auth.senderId,
      });
      return { ok: false, error };
    }

    // JWT を realtime / PostgREST に確実に載せる
    await ensureFirebaseAuthenticatedClaim();

    const mode = parseChatMode(input.mode);
    let query = client
      .from('chat_messages')
      .select('*')
      .eq('event_id', input.eventId)
      .eq('mode', mode)
      .order('created_at', { ascending: true });

    if (mode === 'host') {
      const dm = input.dmUserId?.trim();
      if (!dm) return { ok: false, error: 'dm_user_id required' };
      query = query.eq('dm_user_id', dm);
    } else {
      query = query.is('dm_user_id', null);
    }

    const { data, error } = await query;
    if (error) {
      logChatError('fetch', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        eventId: input.eventId,
        mode,
        senderId: auth.senderId,
      });
      return {
        ok: false,
        error: formatChatRemoteError(
          error.message,
          'メッセージの取得に失敗しました',
        ),
      };
    }

    const rows = (data as ChatMessageRow[] | null) ?? [];
    const baseMessages = annotateHostRoles(
      rows.map((row) =>
        rowToChatMessage(row, input.currentUserId ?? auth.senderId),
      ),
      input.hostUserId,
    );
    const messages = await enrichChatAvatarsFromProfiles(baseMessages);
    if (__DEV__) {
      console.log('[chatsRemote] fetch ok', {
        eventId: input.eventId,
        mode,
        count: messages.length,
        senderId: auth.senderId,
        withAvatar: messages.filter((m) => m.imageUri).length,
      });
    }
    return { ok: true, data: messages };
  } catch (error) {
    logChatError('fetch', {
      error,
      eventId: input.eventId,
      mode: input.mode,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'メッセージの取得に失敗しました',
    };
  }
}

/**
 * 主催者向け: そのイベントの host DM に登場する相手 user_id 一覧。
 * 再起動後に DM スレッドを復元するために使う。
 */
export async function fetchHostDmPeerIds(
  eventId: string,
): Promise<string[]> {
  if (!isSupabaseConfigured() || !isRemoteEventId(eventId)) return [];
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    await ensureFirebaseAuthenticatedClaim();
    const { data, error } = await client
      .from('chat_messages')
      .select('dm_user_id')
      .eq('event_id', eventId)
      .eq('mode', 'host')
      .not('dm_user_id', 'is', null);
    if (error) {
      if (__DEV__) {
        console.warn('[chatsRemote] fetchHostDmPeerIds', error.message);
      }
      return [];
    }
    const ids = new Set<string>();
    for (const row of data ?? []) {
      const id = String(
        (row as { dm_user_id?: string | null }).dm_user_id ?? '',
      ).trim();
      if (id) ids.add(id);
    }
    return [...ids];
  } catch (error) {
    if (__DEV__) {
      console.warn('[chatsRemote] fetchHostDmPeerIds threw', error);
    }
    return [];
  }
}

export async function insertChatMessage(input: {
  eventId: string;
  mode: EventChatMode;
  dmUserId?: string | null;
  body: string;
  senderName: string;
  senderImageUri?: string;
  hostUserId?: string | null;
}): Promise<ChatsRemoteResult<ChatMessage>> {
  if (!isSupabaseConfigured() || !isRemoteEventId(input.eventId)) {
    return { ok: false, error: 'remote unavailable' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  const auth = await resolveChatSenderId();
  const senderId = auth.senderId || (await resolveAuthUserId());
  if (!senderId) {
    const error = 'ログインが必要です';
    logChatError('insert', { error, eventId: input.eventId });
    return { ok: false, error };
  }
  if (!auth.hasAuthenticatedRole) {
    const error =
      '認証トークンに role: "authenticated" がありません。API（ensure-claims）を確認してください。';
    logChatError('insert', { error, eventId: input.eventId, senderId });
    return { ok: false, error };
  }

  const mode = parseChatMode(input.mode);
  const dmUserId =
    mode === 'host' ? input.dmUserId?.trim() || null : null;
  if (mode === 'host' && !dmUserId) {
    return { ok: false, error: 'DM の相手が特定できません' };
  }

  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: 'メッセージが空です' };
  }

  const payload = {
    event_id: input.eventId,
    mode,
    dm_user_id: dmUserId,
    sender_id: senderId,
    sender_name: input.senderName.trim() || 'ユーザー',
    // ローカル file:// は保存しない（他端末で壊れる）
    sender_image_uri:
      resolvePublicImageUrl(input.senderImageUri) || null,
    body,
  };

  console.log('[chatsRemote] insert payload', {
    event_id: payload.event_id,
    mode: payload.mode,
    sender_id: payload.sender_id,
    dm_user_id: payload.dm_user_id,
    bodyLen: payload.body.length,
  });

  try {
    const { data, error } = await client
      .from('chat_messages')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      logChatError('insert', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        payload,
      });
      return {
        ok: false,
        error: formatChatRemoteError(
          error?.message,
          'メッセージの送信に失敗しました',
        ),
      };
    }

    const message = (
      await enrichChatAvatarsFromProfiles(
        annotateHostRoles(
          [rowToChatMessage(data as ChatMessageRow, senderId)],
          input.hostUserId,
        ),
      )
    )[0];
    return { ok: true, data: message };
  } catch (error) {
    logChatError('insert', { error, payload });
    return {
      ok: false,
      error: formatChatRemoteError(
        error instanceof Error ? error.message : undefined,
        'メッセージの送信に失敗しました',
      ),
    };
  }
}

/** 自分が送ったメッセージを削除（RLS: sender_id = JWT sub） */
export async function deleteChatMessage(
  messageId: string,
): Promise<ChatsRemoteResult<void>> {
  const id = String(messageId || '').trim();
  if (!id) {
    return { ok: false, error: 'メッセージ ID がありません' };
  }
  // ローカル仮 ID / シードはリモート削除不要
  if (!UUID_RE.test(id)) {
    return { ok: true, data: undefined };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }

  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase が未設定です' };

  const auth = await resolveChatSenderId();
  const senderId = auth.senderId || (await resolveAuthUserId());
  if (!senderId) {
    return { ok: false, error: 'ログインが必要です' };
  }
  if (!auth.hasAuthenticatedRole) {
    return {
      ok: false,
      error:
        '認証トークンに role: "authenticated" がありません。API（ensure-claims）を確認してください。',
    };
  }

  console.log('[chatsRemote] delete', { messageId: id, senderId });

  try {
    const { error, count } = await client
      .from('chat_messages')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('sender_id', senderId);

    if (error) {
      logChatError('delete', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        messageId: id,
        senderId,
      });
      return {
        ok: false,
        error: formatChatRemoteError(
          error.message,
          'メッセージの削除に失敗しました',
        ),
      };
    }
    if (count === 0) {
      logChatError('delete', {
        reason: 'no_rows',
        messageId: id,
        senderId,
      });
      return {
        ok: false,
        error: '削除できるメッセージが見つかりません（自分の投稿のみ削除できます）',
      };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    logChatError('delete', {
      error: error instanceof Error ? error.message : String(error),
      messageId: id,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'メッセージの削除に失敗しました',
    };
  }
}

export type ChatRealtimeHandlers = {
  onInsert: (message: ChatMessage, row: ChatMessageRow) => void;
  onDelete?: (messageId: string) => void;
  /** SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED など */
  onStatus?: (status: string, err?: Error) => void;
};

function rowMatchesThread(
  row: ChatMessageRow | Partial<ChatMessageRow> | null | undefined,
  mode: EventChatMode,
  dmUserId?: string | null,
): boolean {
  if (!row) return false;
  const rowMode = parseChatMode(row.mode);
  if (rowMode !== mode) return false;
  if (mode === 'group') {
    const rowDm = String(row.dm_user_id ?? '').trim();
    return !rowDm;
  }
  const dm = dmUserId?.trim();
  if (!dm) return false;
  return String(row.dm_user_id ?? '').trim() === dm;
}

/**
 * イベント＋モード（＋DM）の INSERT / DELETE を購読。unsubscribe を返す。
 * Realtime フィルタは event_id のみ。mode / dm はクライアント側で絞る
 * （複合フィルタの取りこぼしを避ける）。
 */
export function subscribeChatMessages(input: {
  eventId: string;
  mode: EventChatMode;
  dmUserId?: string | null;
  currentUserId?: string | null;
  hostUserId?: string | null;
  handlers: ChatRealtimeHandlers;
}): (() => void) | null {
  if (!isSupabaseConfigured() || !isRemoteEventId(input.eventId)) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const mode = parseChatMode(input.mode);
  const dm = input.dmUserId?.trim() || null;
  if (mode === 'host' && !dm) return null;

  const eventId = input.eventId.trim();
  // 単一カラムのみ（複合フィルタは環境によって無視／失敗することがある）
  const filter = `event_id=eq.${eventId}`;
  const channelName = `chat:${eventId}:${mode}:${dm ?? 'group'}:${Date.now()}`;
  let removed = false;

  const safeRemove = () => {
    if (removed) return;
    removed = true;
    void client.removeChannel(channel);
  };

  const deliverInsert = (row: ChatMessageRow) => {
    if (removed) return;
    if (String(row.event_id ?? '') !== eventId) return;
    if (!rowMatchesThread(row, mode, dm)) return;
    // 購読開始時の UID 固定を避け、都度渡された currentUserId を使う
    const base = annotateHostRoles(
      [rowToChatMessage(row, input.currentUserId ?? null)],
      input.hostUserId,
    )[0];
    if (!base) return;
    if (__DEV__) {
      console.log('[chatsRemote] deliver INSERT', {
        id: base.id,
        role: base.role,
        mode,
        dm,
      });
    }
    // アバター補完を待たず即座に反映
    input.handlers.onInsert(base, row);
    void enrichChatAvatarsFromProfiles([base])
      .then(([enriched]) => {
        if (removed || !enriched) return;
        if (
          enriched.imageUri === base.imageUri &&
          enriched.name === base.name &&
          enriched.role === base.role
        ) {
          return;
        }
        input.handlers.onInsert(enriched, row);
      })
      .catch(() => {
        // 補完失敗は表示済みメッセージを維持
      });
  };

  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter,
      },
      (payload) => {
        const row = payload.new as ChatMessageRow;
        if (!row?.id) return;
        deliverInsert(row);
      },
    )
    // フィルタ無しのバックアップ（取りこぼし対策）。event_id はクライアントで照合
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      },
      (payload) => {
        const row = payload.new as ChatMessageRow;
        if (!row?.id) return;
        if (String(row.event_id ?? '') !== eventId) return;
        deliverInsert(row);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages',
      },
      (payload) => {
        if (removed) return;
        const row = payload.old as Partial<ChatMessageRow> | null;
        const messageId = row?.id ? String(row.id) : '';
        if (!messageId) return;
        if (row?.event_id && String(row.event_id) !== eventId) return;
        if (row?.mode != null && !rowMatchesThread(row, mode, dm)) return;
        input.handlers.onDelete?.(messageId);
      },
    );

  void (async () => {
    const authorized = await authorizeSupabaseRealtime(client);
    if (removed) return;
    if (!authorized) {
      logChatError('subscribe', {
        status: 'AUTH_MISSING',
        eventId,
        mode,
        filter,
        dmUserId: dm,
      });
      // 意図的切断として扱い、CLOSED の再入を防ぐ
      safeRemove();
      input.handlers.onStatus?.(
        'CHANNEL_ERROR',
        new Error('realtime auth missing'),
      );
      return;
    }
    channel.subscribe((status, err) => {
      // cleanup 由来の CLOSED 等は無視（detach ↔ CLOSED の無限再入を防ぐ）
      if (removed) return;
      if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        logChatError('subscribe', {
          status,
          err,
          eventId,
          mode,
          filter,
          dmUserId: dm,
        });
        // 先に removed にしてから通知（handler 内の removeChannel 再入を遮断）
        removed = true;
        input.handlers.onStatus?.(status, err);
        void client.removeChannel(channel);
        return;
      }
      input.handlers.onStatus?.(status, err);
      if (__DEV__ && status === 'SUBSCRIBED') {
        console.log('[chatsRemote] subscribed', {
          eventId,
          mode,
          dmUserId: dm,
          authorized,
        });
      }
    });
  })();

  return () => {
    safeRemove();
  };
}

/**
 * イベント単位の inbox 購読（一覧画面用）。
 * mode / dm を問わず event_id の INSERT/DELETE を受け取り、呼び出し側でスレッドへ振り分ける。
 */
export function subscribeEventChatInbox(input: {
  eventId: string;
  currentUserId?: string | null;
  hostUserId?: string | null;
  handlers: ChatRealtimeHandlers;
}): (() => void) | null {
  if (!isSupabaseConfigured() || !isRemoteEventId(input.eventId)) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const eventId = input.eventId.trim();
  const filter = `event_id=eq.${eventId}`;
  const channelName = `chat-inbox:${eventId}:${Date.now()}`;
  let removed = false;

  const safeRemove = () => {
    if (removed) return;
    removed = true;
    void client.removeChannel(channel);
  };

  const deliverInsert = (row: ChatMessageRow) => {
    if (removed) return;
    if (String(row.event_id ?? '') !== eventId) return;
    const base = annotateHostRoles(
      [rowToChatMessage(row, input.currentUserId ?? null)],
      input.hostUserId,
    )[0];
    if (!base) return;
    if (__DEV__) {
      console.log('[chatsRemote] inbox INSERT', {
        id: base.id,
        mode: row.mode,
        dm: row.dm_user_id,
      });
    }
    input.handlers.onInsert(base, row);
    void enrichChatAvatarsFromProfiles([base])
      .then(([enriched]) => {
        if (removed || !enriched) return;
        if (
          enriched.imageUri === base.imageUri &&
          enriched.name === base.name &&
          enriched.role === base.role
        ) {
          return;
        }
        input.handlers.onInsert(enriched, row);
      })
      .catch(() => {
        // 補完失敗は表示済みを維持
      });
  };

  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter,
      },
      (payload) => {
        const row = payload.new as ChatMessageRow;
        if (!row?.id) return;
        deliverInsert(row);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      },
      (payload) => {
        const row = payload.new as ChatMessageRow;
        if (!row?.id) return;
        if (String(row.event_id ?? '') !== eventId) return;
        deliverInsert(row);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages',
      },
      (payload) => {
        if (removed) return;
        const row = payload.old as Partial<ChatMessageRow> | null;
        const messageId = row?.id ? String(row.id) : '';
        if (!messageId) return;
        if (row?.event_id && String(row.event_id) !== eventId) return;
        input.handlers.onDelete?.(messageId);
      },
    );

  void (async () => {
    const authorized = await authorizeSupabaseRealtime(client);
    if (removed) return;
    if (!authorized) {
      logChatError('subscribe-inbox', {
        status: 'AUTH_MISSING',
        eventId,
        filter,
      });
      safeRemove();
      input.handlers.onStatus?.(
        'CHANNEL_ERROR',
        new Error('realtime auth missing'),
      );
      return;
    }
    channel.subscribe((status, err) => {
      if (removed) return;
      if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        logChatError('subscribe-inbox', {
          status,
          err,
          eventId,
          filter,
        });
        removed = true;
        input.handlers.onStatus?.(status, err);
        void client.removeChannel(channel);
        return;
      }
      input.handlers.onStatus?.(status, err);
      if (__DEV__ && status === 'SUBSCRIBED') {
        console.log('[chatsRemote] inbox subscribed', { eventId, authorized });
      }
    });
  })();

  return () => {
    safeRemove();
  };
}
