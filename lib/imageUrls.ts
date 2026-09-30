import { readPublicEnv } from '@/lib/env';

const DEFAULT_BUCKET = 'event-images';

function storageBucket() {
  return readPublicEnv('EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET') || DEFAULT_BUCKET;
}

/** supabase.ts を import せず URL だけ組み立てる（循環依存回避） */
function supabaseUrlBase() {
  let url = readPublicEnv('EXPO_PUBLIC_SUPABASE_URL');
  if (!url) return '';
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/auth\/v1$/i, '');
  return url;
}

/** 端末ローカル URI（他端末・チャット相手には表示できない） */
export function isLocalImageUri(uri: string | null | undefined): boolean {
  const raw = String(uri || '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return (
    lower.startsWith('file:') ||
    lower.startsWith('content:') ||
    lower.startsWith('ph:') ||
    lower.startsWith('assets-library:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('/var/') ||
    lower.startsWith('/private/') ||
    lower.startsWith('/data/') ||
    /^[a-z]:\\/i.test(raw)
  );
}

function isRemoteHttpUri(uri: string) {
  return /^https?:\/\//i.test(uri.trim());
}

/** Storage オブジェクトパス（例: profiles/xxx.jpg）か */
function isStorageObjectPath(uri: string) {
  return /^(events|profiles|contact|clubs)\/[^\s]+$/i.test(uri.trim());
}

/**
 * Supabase Storage の公開 URL を組み立てる。
 * 相対パス・authenticated 経路・不完全な URL を public 経路へ正規化する。
 * ※ supabase クライアントに依存しない（循環依存で undefined になるのを防ぐ）
 */
export function resolvePublicImageUrl(
  uri: string | null | undefined,
): string | undefined {
  const raw = String(uri || '').trim();
  if (!raw) return undefined;
  if (isLocalImageUri(raw)) return undefined;

  const base = supabaseUrlBase();
  const bucket = storageBucket();

  if (isRemoteHttpUri(raw)) {
    return raw.replace(
      /\/storage\/v1\/object\/authenticated\//i,
      '/storage/v1/object/public/',
    );
  }

  if (isStorageObjectPath(raw)) {
    const path = raw.replace(/^\/+/, '');
    if (!base) return undefined;
    return `${base}/storage/v1/object/public/${bucket}/${path}`;
  }

  if (raw.startsWith('/storage/v1/') && base) {
    return `${base}${raw}`;
  }

  return undefined;
}

/**
 * UI 表示用。リモート公開 URL を優先し、同一端末のローカル URI はプレビュー用に許可。
 */
export function resolveDisplayImageUrl(
  uri: string | null | undefined,
): string | undefined {
  const raw = String(uri || '').trim();
  if (!raw) return undefined;
  const remote = resolvePublicImageUrl(raw);
  if (remote) return remote;
  if (isLocalImageUri(raw)) return raw;
  return undefined;
}

/** 呼び出し側がクラッシュしないよう、未定義・例外時は元 URI を返す */
export function safeResolveDisplayImageUrl(
  uri: string | null | undefined,
): string | undefined {
  try {
    if (typeof resolveDisplayImageUrl !== 'function') {
      const raw = String(uri || '').trim();
      return raw || undefined;
    }
    return resolveDisplayImageUrl(uri);
  } catch (error) {
    if (__DEV__) {
      console.warn('[imageUrls] resolveDisplayImageUrl failed', error);
    }
    const raw = String(uri || '').trim();
    return raw || undefined;
  }
}
