import { createAuthedSupabase } from '@/lib/supabase';
import type { WebOrganizerProfile } from '@/lib/organizerProfile';
import { mapEventRow, type EventRow, type PublicEvent } from '@/lib/types';
import { uploadProfileAvatar } from '@/lib/profile';
import {
  buildEventInsertRow,
  occurrencesFromCreatePayload,
  type CreateEventPayload,
} from '@/lib/createEventModel';

export type { CreateEventPayload };
/** @deprecated CreateEventPayload を使う */
export type CreateEventInput = CreateEventPayload;

export async function uploadEventImage(input: {
  file: File;
  getIdToken: () => Promise<string | null>;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    if (!input.file.type.startsWith('image/')) {
      return { ok: false, error: '画像ファイルを選択してください' };
    }
    const client = createAuthedSupabase(input.getIdToken);
    const rand = Math.random().toString(36).slice(2, 10);
    const ext = input.file.type.includes('png') ? 'png' : 'jpg';
    const path = `events/${Date.now()}-${rand}.${ext}`;
    const { error } = await client.storage.from('event-images').upload(path, input.file, {
      contentType: input.file.type || 'image/jpeg',
      upsert: false,
      cacheControl: '3600',
    });
    if (error) return { ok: false, error: error.message || '画像のアップロードに失敗しました' };
    const { data } = client.storage.from('event-images').getPublicUrl(path);
    const url = data.publicUrl?.trim();
    if (!url) return { ok: false, error: '公開 URL を取得できませんでした' };
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '画像のアップロードに失敗しました',
    };
  }
}

/** プロフィール用アップロードを流用したい場合のエイリアス */
export { uploadProfileAvatar as uploadOrganizerAvatar };

function validateCreatePayload(payload: CreateEventPayload): string | null {
  const photos = (
    payload.imageUris?.length
      ? payload.imageUris
      : payload.imageUri
        ? [payload.imageUri]
        : []
  )
    .map((uri) => String(uri || '').trim())
    .filter(Boolean);
  if (photos.length === 0) return '写真を1枚以上追加してください。';
  if (!payload.title.trim()) return 'タイトルを入力してください';
  if (!payload.location.trim()) return '場所を入力してください';
  if (!payload.description.trim()) return '説明を入力してください';
  if (
    payload.scheduleType === 'recurring' &&
    (!payload.sessions || payload.sessions.length === 0)
  ) {
    return '開催日時を1件以上指定してください。';
  }
  if (payload.scheduleType === 'single' && (!payload.date || !payload.time)) {
    return '開催日時を入力してください';
  }
  if (payload.priceYen > 0 && !payload.cancelPolicy.trim()) {
    return 'キャンセルポリシーを選択してください';
  }
  if (payload.priceYen > 0 && payload.priceYen < 1) {
    return '有料の場合は参加費を入力してください';
  }
  return null;
}

export async function createWebEvent(input: {
  getIdToken: () => Promise<string | null>;
  hostId: string;
  organizer: WebOrganizerProfile;
  payload: CreateEventPayload;
  sourceLang?: 'ja' | 'en';
}): Promise<{ ok: true; event: PublicEvent; events: PublicEvent[] } | { ok: false; error: string }> {
  const validationError = validateCreatePayload(input.payload);
  if (validationError) return { ok: false, error: validationError };

  const occurrences = occurrencesFromCreatePayload(input.payload);
  if (occurrences.length === 0) {
    return { ok: false, error: '開催日時を1件以上指定してください。' };
  }

  const seriesId =
    occurrences.length > 1
      ? globalThis.crypto?.randomUUID?.() ?? `series_${Date.now().toString(36)}`
      : null;

  const rows = occurrences.map((occurrence) =>
    buildEventInsertRow({
      hostId: input.hostId,
      payload: input.payload,
      organizer: input.organizer,
      occurrence,
      seriesId,
      sourceLang: input.sourceLang,
    }),
  );

  const hostName = input.organizer.name.trim() || '主催者';

  try {
    const client = createAuthedSupabase(input.getIdToken);
    const { data, error } = await client.from('events').insert(rows).select('*');
    if (error || !data || data.length === 0) {
      return { ok: false, error: error?.message || 'イベントの作成に失敗しました' };
    }

    const events = (data as unknown as EventRow[])
      .map((row) => mapEventRow(row))
      .filter((event): event is PublicEvent => Boolean(event));
    if (events.length === 0) {
      return { ok: false, error: '作成結果の読み取りに失敗しました' };
    }

    events.sort((a, b) =>
      `${a.eventDate}T${a.eventTime}`.localeCompare(
        `${b.eventDate}T${b.eventTime}`,
      ),
    );

    // 主催者自身を参加者として登録（失敗してもイベント自体は成功）
    try {
      await Promise.all(
        events.map((event) =>
          client.from('event_participants').upsert(
            {
              event_id: event.id,
              user_id: input.hostId,
              status: 'joined',
              display_name: hostName,
              avatar_url: input.organizer.imageUri?.trim() || null,
            },
            { onConflict: 'event_id,user_id' },
          ),
        ),
      );
    } catch {
      // ignore
    }

    return { ok: true, event: events[0]!, events };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'イベントの作成に失敗しました',
    };
  }
}
