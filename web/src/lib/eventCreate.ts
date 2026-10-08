import { createAuthedSupabase } from '@/lib/supabase';
import type { WebOrganizerProfile } from '@/lib/organizerProfile';
import { mapEventRow, type EventRow, type PublicEvent } from '@/lib/types';
import { uploadProfileAvatar } from '@/lib/profile';

const SPORT_EMOJI: Record<string, string> = {
  サッカー: '⚽',
  フットサル: '⚽',
  バスケットボール: '🏀',
  テニス: '🎾',
  ランニング: '🏃',
  バドミントン: '🏸',
  バレーボール: '🏐',
  野球: '⚾',
  その他: '🏅',
};

export type CreateEventInput = {
  title: string;
  sport: string;
  level: string;
  date: string;
  time: string;
  endDate: string;
  endTime: string;
  location: string;
  locationNote?: string;
  latitude: number;
  longitude: number;
  description: string;
  capacity: number;
  priceYen: number;
  imageUri: string;
};

export async function uploadEventImage(input: {
  file: File;
  getIdToken: () => Promise<string | null>;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // 同じ Storage バケット。フォルダだけ events にする
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

export async function createWebEvent(input: {
  getIdToken: () => Promise<string | null>;
  hostId: string;
  organizer: WebOrganizerProfile;
  payload: CreateEventInput;
}): Promise<{ ok: true; event: PublicEvent } | { ok: false; error: string }> {
  const title = input.payload.title.trim().slice(0, 80);
  const location = input.payload.location.trim();
  const imageUri = input.payload.imageUri.trim();
  if (!title) return { ok: false, error: 'タイトルを入力してください' };
  if (!location) return { ok: false, error: '場所を入力してください' };
  if (!imageUri) return { ok: false, error: '写真を1枚以上追加してください' };
  if (!input.payload.date || !input.payload.time) {
    return { ok: false, error: '開催日時を入力してください' };
  }

  const capacity = Math.max(1, Math.floor(input.payload.capacity) || 1);
  const priceYen = Math.max(0, Math.floor(input.payload.priceYen) || 0);
  const sport = input.payload.sport.trim() || 'その他';
  const hostName = input.organizer.name.trim() || '主催者';

  const row = {
    host_id: input.hostId,
    title,
    sport,
    emoji: SPORT_EMOJI[sport] || '🏅',
    location,
    location_note: input.payload.locationNote?.trim() || null,
    event_date: input.payload.date,
    event_time: input.payload.time,
    end_date: input.payload.endDate || input.payload.date,
    end_time: input.payload.endTime || null,
    schedule_type: 'single',
    sessions: null,
    series_id: null,
    level: input.payload.level.trim() || '初心者歓迎',
    latitude: input.payload.latitude,
    longitude: input.payload.longitude,
    capacity,
    joined_count: 1,
    host_name: hostName,
    host_image_uri: input.organizer.imageUri?.trim() || null,
    host_bio: input.organizer.bio.trim() || null,
    description: input.payload.description.trim() || null,
    image_uri: imageUri,
    image_uris: [imageUri],
    price_yen: priceYen,
    waitlist_enabled: false,
    waitlist_count: 0,
    enable_pre_questions: false,
    pre_questions: null,
  };

  try {
    const client = createAuthedSupabase(input.getIdToken);
    const { data, error } = await client.from('events').insert(row).select('*').single();
    if (error || !data) {
      return { ok: false, error: error?.message || 'イベントの作成に失敗しました' };
    }
    const event = mapEventRow(data as unknown as EventRow);
    if (!event) return { ok: false, error: '作成結果の読み取りに失敗しました' };

    // 主催者自身を参加者として登録（失敗してもイベント自体は成功）
    try {
      await client.from('event_participants').upsert(
        {
          event_id: event.id,
          user_id: input.hostId,
          status: 'joined',
          display_name: hostName,
          avatar_url: input.organizer.imageUri?.trim() || null,
        },
        { onConflict: 'event_id,user_id' },
      );
    } catch {
      // ignore
    }

    return { ok: true, event };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'イベントの作成に失敗しました',
    };
  }
}
