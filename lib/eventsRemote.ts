import { theme } from '@/constants/theme';
import i18n, { getCurrentAppLanguage } from '@/lib/i18n';
import type { CreateEventPayload } from '@/components/createEventSheetTypes';
import {
  DEFAULT_CANCEL_POLICY,
  MAX_EVENT_PHOTOS,
  deriveEventVibe,
  sanitizeEventContentText,
  sanitizeEventItems,
  sanitizeTargetAgeGroups,
  sortEventSessions,
  type EventSession,
  type RegistrationDeadlineOffset,
  type SkillLevel,
  type SportEvent,
} from '@/lib/events';
import { ensureFirebaseAuthenticatedClaim } from '@/lib/firebaseEnsureClaims';
import {
  firebaseJwtHasAuthenticatedRole,
  getFirebaseIdToken,
  peekFirebaseJwtClaims,
} from '@/lib/firebaseIdToken';
import { sanitizePreQuestions } from '@/lib/preQuestions';
import { sanitizeSnsLinks, type SnsLink } from '@/lib/snsLinks';
import { resolveDisplayImageUrl } from '@/lib/storage';
import {
  getSupabaseAnonKey,
  getSupabaseClient,
  getSupabaseUrl,
  isSupabaseConfigured,
} from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import type { OrganizerProfile } from '@/lib/organizerProfile';
import { organizerDisplayName } from '@/lib/organizerProfile';

export type EventsRemoteResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** DB row shape for public.events */
export type EventRow = {
  id: string;
  host_id: string;
  title: string;
  sport: string;
  emoji: string;
  location: string;
  location_note: string | null;
  event_date: string;
  event_time: string;
  end_date: string | null;
  end_time: string | null;
  schedule_type: 'single' | 'recurring';
  sessions: SportEvent['sessions'] | null;
  level: string;
  target_age_groups: string[] | null;
  latitude: number;
  longitude: number;
  capacity: number;
  joined_count: number;
  host_name: string;
  host_image_uri: string | null;
  host_sns_links: SnsLink[] | null;
  vibe: string;
  description: string;
  image_uri: string | null;
  image_uris: string[] | string | null;
  accent: string | null;
  registration_deadline_offset: string;
  waitlist_enabled: boolean;
  waitlist_count: number;
  enable_pre_questions: boolean;
  pre_questions: SportEvent['preQuestions'] | null;
  items_to_bring: string[] | null;
  included_items: string[] | null;
  price_yen: number;
  cancel_policy: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  series_id?: string | null;
  source_lang?: string | null;
  title_ja?: string | null;
  title_en?: string | null;
  description_ja?: string | null;
  description_en?: string | null;
  translated_at?: string | null;
};

function asSkillLevel(raw: string): SkillLevel {
  if (
    raw === '初心者' ||
    raw === '中級' ||
    raw === '上級' ||
    raw === '誰でも歓迎'
  ) {
    return raw;
  }
  return '誰でも歓迎';
}

/**
 * DB の image_uri / image_uris を表示用 URL の配列に正規化。
 * - jsonb 配列・JSON 文字列・単一 URL いずれも許容
 * - Storage オブジェクトパスは公開 URL へ（公開バケット前提）
 */
function parseEventImageUris(
  imageUri: unknown,
  imageUris: unknown,
): { imageUri: string; imageUris: string[] } {
  let list: unknown[] = [];
  if (Array.isArray(imageUris)) {
    list = imageUris;
  } else if (typeof imageUris === 'string' && imageUris.trim()) {
    try {
      const parsed = JSON.parse(imageUris);
      list = Array.isArray(parsed) ? parsed : [imageUris];
    } catch {
      list = [imageUris];
    }
  }
  if (typeof imageUri === 'string' && imageUri.trim()) {
    list = [imageUri, ...list];
  }

  const resolved: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const raw = item.trim();
    if (!raw) continue;
    const display = resolveDisplayImageUrl(raw) || raw;
    if (!resolved.includes(display)) resolved.push(display);
    if (resolved.length >= MAX_EVENT_PHOTOS) break;
  }

  return {
    imageUri: resolved[0] ?? '',
    imageUris: resolved,
  };
}

function encodeDeadlineOffset(offset: RegistrationDeadlineOffset | undefined) {
  if (offset === 'end') return 'end';
  if (typeof offset === 'number' && Number.isFinite(offset)) {
    return String(offset);
  }
  return '0';
}

function decodeDeadlineOffset(raw: string | null | undefined): RegistrationDeadlineOffset {
  if (raw === 'end') return 'end';
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function eventRowToSportEvent(row: EventRow): SportEvent {
  const capacity = Math.max(1, Math.floor(row.capacity || 1));
  const joinedCount = Math.max(
    0,
    Math.min(capacity, Math.floor(row.joined_count || 0)),
  );
  const images = parseEventImageUris(row.image_uri, row.image_uris);
  const imageUri = images.imageUri;
  const imageUris = images.imageUris;
  const snsLinks = sanitizeSnsLinks(row.host_sns_links ?? []);
  const hostImageUri =
    resolveDisplayImageUrl(row.host_image_uri) ||
    row.host_image_uri?.trim() ||
    undefined;

  const sessions = Array.isArray(row.sessions)
    ? row.sessions.filter(
        (session): session is NonNullable<typeof session> =>
          Boolean(session) &&
          typeof session === 'object' &&
          Boolean(String((session as { date?: unknown }).date || '').trim()) &&
          Boolean(String((session as { time?: unknown }).time || '').trim()),
      )
    : undefined;

  return {
    id: String(row.id || '').trim(),
    title: String(row.title || '').trim() || i18n.t('events.untitled'),
    sport: row.sport || 'その他',
    emoji: row.emoji || '🏅',
    location: row.location || i18n.t('events.locationUnset'),
    locationNote: row.location_note?.trim() || undefined,
    date: String(row.event_date || '').trim() || '1970-01-01',
    time: String(row.event_time || '').trim() || '00:00',
    endDate: row.end_date?.trim() || undefined,
    endTime: row.end_time?.trim() || undefined,
    scheduleType: row.schedule_type === 'recurring' ? 'recurring' : 'single',
    sessions: sessions && sessions.length > 0 ? sessions : undefined,
    level: asSkillLevel(row.level),
    targetAgeGroups: sanitizeTargetAgeGroups(row.target_age_groups),
    latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : 0,
    longitude: Number.isFinite(Number(row.longitude))
      ? Number(row.longitude)
      : 0,
    capacity,
    joinedCount,
    spotsLeft: Math.max(0, capacity - joinedCount),
    host: String(row.host_name || '').trim() || i18n.t('events.host'),
    hostId: row.host_id,
    hostImageUri,
    hostSnsUrl: snsLinks[0]?.url,
    hostSnsLinks: snsLinks,
    vibe: row.vibe || '',
    description: row.description || '',
    sourceLang:
      row.source_lang === 'en' || row.source_lang === 'ja'
        ? row.source_lang
        : undefined,
    titleJa: row.title_ja?.trim() || undefined,
    titleEn: row.title_en?.trim() || undefined,
    descriptionJa: row.description_ja?.trim() || undefined,
    descriptionEn: row.description_en?.trim() || undefined,
    translatedAt: row.translated_at?.trim() || undefined,
    imageUri,
    imageUris,
    accent: row.accent?.trim() || theme.colors.primary,
    registrationDeadlineOffset: decodeDeadlineOffset(
      row.registration_deadline_offset,
    ),
    waitlistEnabled: false,
    waitlistCount: 0,
    enablePreQuestions: row.enable_pre_questions === true,
    preQuestions:
      row.enable_pre_questions === true
        ? sanitizePreQuestions(row.pre_questions ?? [])
        : undefined,
    itemsToBring: sanitizeEventItems(row.items_to_bring),
    includedItems: sanitizeEventItems(row.included_items),
    priceYen: Math.max(0, Math.floor(row.price_yen || 0)),
    cancelPolicy: row.cancel_policy?.trim() || undefined,
    cancelledAt: row.cancelled_at?.trim() || undefined,
    cancelReason: row.cancel_reason?.trim() || undefined,
    seriesId: row.series_id?.trim() || undefined,
  };
}

export function buildEventInsertRow(input: {
  hostId: string;
  payload: CreateEventPayload;
  organizer: OrganizerProfile;
  /** この開催回の日時（未指定時は payload の先頭） */
  occurrence?: EventSession;
  /** 互換用。複数日程作成時は共通の series_id を付与（各行は独立イベント） */
  seriesId?: string | null;
}): Record<string, unknown> {
  const { hostId, payload, organizer } = input;
  const displayName = organizerDisplayName(organizer);
  const capacity = Math.max(1, Math.floor(payload.capacity) || 1);
  const priceYen = Math.max(0, Math.floor(payload.priceYen) || 0);
  const imageUris = (
    payload.imageUris[0]
      ? payload.imageUris
      : payload.imageUri
        ? [payload.imageUri]
        : []
  )
    .map((uri) => uri.trim())
    .filter(Boolean)
    .slice(0, MAX_EVENT_PHOTOS);
  const imageUri = imageUris[0] ?? payload.imageUri ?? '';
  const snsLinks = sanitizeSnsLinks(organizer.snsLinks);
  const occurrence =
    input.occurrence ??
    ({
      date: payload.date,
      time: payload.time,
      endDate: payload.endDate,
      endTime: payload.endTime,
    } satisfies EventSession);

  const title = payload.title.trim().slice(0, 80);
  const description = sanitizeEventContentText(payload.description);
  const sourceLang = getCurrentAppLanguage();

  return {
    host_id: hostId,
    title,
    sport: payload.sport,
    emoji: payload.emoji,
    location: payload.location.trim(),
    location_note: payload.locationNote?.trim() || null,
    event_date: occurrence.date,
    event_time: occurrence.time,
    end_date: occurrence.endDate || null,
    end_time: occurrence.endTime || null,
    // 開催回ごとに独立行。sessions はぶら下げない
    schedule_type: 'single',
    sessions: null,
    series_id: input.seriesId?.trim() || null,
    level: payload.level,
    target_age_groups: sanitizeTargetAgeGroups(payload.targetAgeGroups),
    latitude: payload.latitude,
    longitude: payload.longitude,
    capacity,
    joined_count: 1,
    host_name: displayName,
    host_image_uri: organizer.imageUri?.trim() || null,
    host_sns_links: snsLinks,
    vibe: deriveEventVibe(description, title),
    description,
    source_lang: sourceLang,
    title_ja: sourceLang === 'ja' ? title : null,
    title_en: sourceLang === 'en' ? title : null,
    description_ja: sourceLang === 'ja' ? description || null : null,
    description_en: sourceLang === 'en' ? description || null : null,
    translated_at: null,
    image_uri: imageUri,
    image_uris: imageUris,
    accent: theme.colors.primary,
    registration_deadline_offset: encodeDeadlineOffset(
      payload.registrationDeadlineOffset ?? 0,
    ),
    waitlist_enabled: false,
    waitlist_count: 0,
    enable_pre_questions:
      Boolean(payload.enablePreQuestions) &&
      sanitizePreQuestions(payload.preQuestions ?? []).length > 0,
    pre_questions:
      payload.enablePreQuestions && payload.preQuestions
        ? sanitizePreQuestions(payload.preQuestions)
        : null,
    items_to_bring: sanitizeEventItems(payload.itemsToBring),
    included_items: sanitizeEventItems(payload.includedItems),
    price_yen: priceYen,
    cancel_policy:
      priceYen > 0
        ? payload.cancelPolicy?.trim() || DEFAULT_CANCEL_POLICY
        : null,
  };
}

/** 作成ペイロードから「独立した開催回」の一覧を得る */
export function occurrencesFromCreatePayload(
  payload: CreateEventPayload,
): EventSession[] {
  if (
    payload.scheduleType === 'recurring' &&
    Array.isArray(payload.sessions) &&
    payload.sessions.length > 0
  ) {
    return sortEventSessions(payload.sessions);
  }
  return [
    {
      date: payload.date,
      time: payload.time,
      endDate: payload.endDate,
      endTime: payload.endTime,
    },
  ];
}

function mapEventRows(rows: EventRow[] | null | undefined): SportEvent[] {
  if (!rows?.length) return [];
  const events: SportEvent[] = [];
  for (const row of rows) {
    try {
      const event = eventRowToSportEvent(row);
      if (event.id) events.push(event);
    } catch (error) {
      if (__DEV__) {
        console.warn('[events] skip bad row', row?.id, error);
      }
    }
  }
  return events;
}

function isJwtAuthError(error: {
  message?: string;
  code?: string;
  status?: number;
} | null) {
  if (!error) return false;
  const message = String(error.message || '');
  const code = String(error.code || '');
  return (
    error.status === 401 ||
    /PGRST301|jwt|jws|decode the JWT|wrong key/i.test(`${code} ${message}`)
  );
}

/**
 * 公開イベント一覧。RLS は anon/authenticated とも SELECT 可。
 * Firebase JWT が壊れているときは anon キーで再試行する（閲覧を止めない）。
 */
export async function fetchRemoteEvents(): Promise<EventsRemoteResult<SportEvent[]>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: 'Supabase が未設定です' };
  }

  const runQuery = () =>
    client
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);

  try {
    let { data, error, status } = await runQuery();

    if (error && isJwtAuthError({ ...error, status })) {
      if (__DEV__) {
        console.warn('[events] fetchRemoteEvents JWT error; retry as anon', {
          status,
          message: error.message,
          code: error.code,
        });
      }
      // accessToken 付きクライアントが 401 のとき、anon だけでも公開 SELECT は可能
      const url = getSupabaseUrl();
      const key = getSupabaseAnonKey();
      if (url && key) {
        const anon = createClient(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        const retry = await anon
          .from('events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(2000);
        data = retry.data;
        error = retry.error;
        status = retry.status;
      }
    }

    if (error) {
      if (__DEV__) {
        console.warn('[events] fetchRemoteEvents error', {
          status,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
      }
      return {
        ok: false,
        error: error.message || 'イベント一覧の取得に失敗しました',
      };
    }

    const events = mapEventRows(data as EventRow[] | null);
    if (__DEV__) {
      const qa = events.filter(
        (event) =>
          String(event.title || '').startsWith('[QA]') ||
          String(event.hostId || '').startsWith('mock_qa_'),
      );
      console.log('[events] fetchRemoteEvents ok', {
        total: events.length,
        qaMock: qa.length,
        qaTitles: qa.slice(0, 8).map((event) => event.title),
      });
    }
    return { ok: true, data: events };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'イベント一覧の取得に失敗しました',
    };
  }
}

/** 詳細画面用。一覧に無い ID でも公開イベントを 1 件取得する */
export async function fetchRemoteEventById(
  eventId: string,
): Promise<EventsRemoteResult<SportEvent | null>> {
  const id = String(eventId || '').trim();
  if (!id) {
    return { ok: true, data: null };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: 'Supabase が未設定です' };
  }

  try {
    let { data, error, status } = await client
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error && isJwtAuthError({ ...error, status })) {
      const url = getSupabaseUrl();
      const key = getSupabaseAnonKey();
      if (url && key) {
        const anon = createClient(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        const retry = await anon
          .from('events')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) {
      return {
        ok: false,
        error: error.message || 'イベントの取得に失敗しました',
      };
    }
    if (!data) return { ok: true, data: null };
    return { ok: true, data: eventRowToSportEvent(data as EventRow) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'イベントの取得に失敗しました',
    };
  }
}

function formatEventsRemoteError(message: string | undefined, fallback: string) {
  const raw = String(message || '').trim() || fallback;
  if (/row level security|rls/i.test(raw)) {
    return (
      `${raw}\n\n` +
      'Firebase JWT の sub と host_id が一致しているか、' +
      'RLS が requesting_user_id()（auth.jwt()->>\'sub\'）を使っているか確認してください。' +
      ' SQL: supabase/apply_events_firebase_rls.sql'
    );
  }
  if (/permission denied|42501/i.test(raw)) {
    return (
      `${raw}\n\n` +
      'JWT に role: "authenticated" が無いと anon 扱いになります。' +
      ' ensure-claims と Third-party Auth（Firebase）を確認してください。'
    );
  }
  return raw;
}

/**
 * Supabase に載せる Firebase UID（JWT sub）。
 * RLS の requesting_user_id() と必ず一致させる。
 */
async function resolveFirebaseJwtSubject(): Promise<{
  uid: string | null;
  hasAuthenticatedRole: boolean;
  token: string | null;
}> {
  await ensureFirebaseAuthenticatedClaim();
  const token = await getFirebaseIdToken(false);
  if (!token) {
    return { uid: null, hasAuthenticatedRole: false, token: null };
  }
  const claims = peekFirebaseJwtClaims(token);
  const uid =
    typeof claims?.sub === 'string' && claims.sub.trim()
      ? claims.sub.trim()
      : null;
  return {
    uid,
    hasAuthenticatedRole: firebaseJwtHasAuthenticatedRole(token),
    token,
  };
}

export async function insertRemoteEvent(input: {
  hostId: string;
  payload: CreateEventPayload;
  organizer: OrganizerProfile;
}): Promise<EventsRemoteResult<SportEvent[]>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: 'Supabase が未設定です' };
  }

  const auth = await resolveFirebaseJwtSubject();
  if (!auth.uid) {
    return {
      ok: false,
      error:
        'Firebase のログインセッションがありません。再ログインしてから作成してください。',
    };
  }
  if (!auth.hasAuthenticatedRole) {
    return {
      ok: false,
      error:
        '認証トークンに role: "authenticated" がありません。API（ensure-claims）と Firebase Admin 設定を確認してください。',
    };
  }

  // RLS: host_id は JWT sub と一致必須（呼び出し側の hostId より JWT を優先）
  const hostId = auth.uid;
  if (__DEV__ && input.hostId && input.hostId !== hostId) {
    console.warn('[eventsRemote] hostId mismatch; using JWT sub', {
      passed: input.hostId,
      jwtSub: hostId,
    });
  }

  const photos = (
    input.payload.imageUris?.length
      ? input.payload.imageUris
      : input.payload.imageUri
        ? [input.payload.imageUri]
        : []
  )
    .map((uri) => String(uri || '').trim())
    .filter(Boolean);
  if (photos.length === 0) {
    return { ok: false, error: '写真を1枚以上追加してください。' };
  }

  const occurrences = occurrencesFromCreatePayload(input.payload);
  if (occurrences.length === 0) {
    return { ok: false, error: '開催日時を1件以上指定してください。' };
  }

  // 複数日程はそれぞれ独立したイベント行（参加・定員は id ごと）。
  // series_id で詳細の日付ピッカーから兄弟開催回へ遷移できるようにする。
  const seriesId =
    occurrences.length > 1
      ? (globalThis.crypto?.randomUUID?.() ??
        `series_${Date.now().toString(36)}`)
      : null;
  const rows = occurrences.map((occurrence) =>
    buildEventInsertRow({
      hostId,
      payload: input.payload,
      organizer: input.organizer,
      occurrence,
      seriesId,
    }),
  );

  if (__DEV__) {
    console.log('[eventsRemote] insert events', {
      host_id: hostId,
      count: rows.length,
      jwtSub: auth.uid,
      role: peekFirebaseJwtClaims(auth.token!)?.role ?? null,
    });
  }

  try {
    const { data, error } = await client
      .from('events')
      .insert(rows)
      .select('*');

    if (error || !data || data.length === 0) {
      return {
        ok: false,
        error: formatEventsRemoteError(
          error?.message,
          'イベントの保存に失敗しました',
        ),
      };
    }

    const events = (data as EventRow[]).map(eventRowToSportEvent);
    // 日付順に揃える
    events.sort(
      (a, b) =>
        `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
    );
    return { ok: true, data: events };
  } catch (error) {
    return {
      ok: false,
      error: formatEventsRemoteError(
        error instanceof Error ? error.message : undefined,
        'イベントの保存に失敗しました',
      ),
    };
  }
}

export async function cancelRemoteEvent(
  eventId: string,
  reason?: string,
): Promise<EventsRemoteResult<SportEvent>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: 'Supabase が未設定です' };
  }

  try {
    const { data, error } = await client
      .from('events')
      .update({
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .select('*')
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || 'イベントの中止に失敗しました',
      };
    }

    return { ok: true, data: eventRowToSportEvent(data as EventRow) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'イベントの中止に失敗しました',
    };
  }
}

export async function updateRemoteHostProfileFields(input: {
  hostId: string;
  hostName: string;
  hostImageUri?: string;
  hostSnsLinks: SnsLink[];
}): Promise<EventsRemoteResult<void>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase が未設定です' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: 'Supabase が未設定です' };
  }

  try {
    await ensureFirebaseAuthenticatedClaim();
  } catch (error) {
    if (__DEV__) console.warn('[events] ensure-claims before host update', error);
  }

  const { error } = await client
    .from('events')
    .update({
      host_name: input.hostName,
      host_image_uri: input.hostImageUri?.trim() || null,
      host_sns_links: sanitizeSnsLinks(input.hostSnsLinks),
      updated_at: new Date().toISOString(),
    })
    .eq('host_id', input.hostId);

  if (error) {
    if (__DEV__) {
      console.warn('[events] host profile update failed', error.message);
    }
    return { ok: false, error: error.message || '主催者情報の更新に失敗しました' };
  }
  return { ok: true, data: undefined };
}

/** ログイン中ユーザー ID（Firebase Auth = JWT sub） */
export async function resolveAuthUserId(): Promise<string | null> {
  const token = await getFirebaseIdToken(false);
  if (token) {
    const claims = peekFirebaseJwtClaims(token);
    if (typeof claims?.sub === 'string' && claims.sub.trim()) {
      return claims.sub.trim();
    }
  }
  const { getCurrentFirebaseUid } = await import('@/lib/currentUser');
  return getCurrentFirebaseUid();
}
