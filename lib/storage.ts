import { decode as decodeBase64 } from 'base64-arraybuffer';
import { Platform } from 'react-native';

import { isLocalImageUri, resolvePublicImageUrl } from '@/lib/imageUrls';
import {
  getSupabaseClient,
  getSupabaseUrl,
  isSupabaseConfigured,
  resolveFirebaseAccessToken,
} from '@/lib/supabase';
import { readPublicEnv } from '@/lib/env';
import {
  firebaseJwtHasAuthenticatedRole,
} from '@/lib/firebaseIdToken';

export type UploadFolder = 'events' | 'profiles' | 'contact' | 'clubs';

/** Storage ポリシーと一致させる許可フォルダ */
const ALLOWED_FOLDERS: readonly UploadFolder[] = [
  'events',
  'profiles',
  'contact',
  'clubs',
] as const;

/** プロフィールアイコン想定の長辺 */
const PROFILE_MAX_EDGE = 1024;
/** イベント／カバー等の長辺 */
const DEFAULT_MAX_EDGE = 1600;
/** JPEG 圧縮率（0–1） */
const JPEG_QUALITY = 0.72;
/** 絶対上限（バケット file_size_limit 10MB より低く） */
const HARD_MAX_BYTES = 8_000_000;

// 既存 import 互換: URL 解決は imageUrls に集約（循環依存回避）
export {
  isLocalImageUri,
  resolveDisplayImageUrl,
  resolvePublicImageUrl,
  safeResolveDisplayImageUrl,
} from '@/lib/imageUrls';

const DEFAULT_BUCKET = 'event-images';

function storageBucket() {
  return readPublicEnv('EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET') || DEFAULT_BUCKET;
}

export function getStorageBucketName() {
  return storageBucket();
}

export function isRemoteStorageConfigured() {
  return isSupabaseConfigured();
}

function isRemoteHttpUri(uri: string) {
  return /^https?:\/\//i.test(uri.trim());
}

function guessExt(uri: string, mime?: string) {
  const fromMime = mime?.toLowerCase() || '';
  if (fromMime.includes('png')) return 'png';
  if (fromMime.includes('webp')) return 'webp';
  if (fromMime.includes('gif')) return 'gif';
  if (fromMime.includes('heic') || fromMime.includes('heif')) return 'heic';
  const clean = uri.split('?')[0]?.toLowerCase() ?? '';
  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.webp')) return 'webp';
  if (clean.endsWith('.heic') || clean.endsWith('.heif')) return 'heic';
  if (clean.endsWith('.gif')) return 'gif';
  return 'jpg';
}

function contentTypeForExt(ext: string) {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function objectPath(folder: UploadFolder, ext: string) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${folder}/${Date.now()}-${rand}.${ext}`;
}

function maxEdgeForFolder(folder: UploadFolder) {
  return folder === 'profiles' ? PROFILE_MAX_EDGE : DEFAULT_MAX_EDGE;
}

type ImageBytes = {
  bytes: ArrayBuffer;
  contentType: string;
  ext: string;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return String(error ?? '');
}

/** ユーザー向けにネットワーク／認証エラーを日本語化する */
export function formatStorageUploadError(error: unknown): string {
  const raw = errorMessage(error);
  const lower = raw.toLowerCase();

  if (
    /auth\/network-request-failed|network.?request.?failed|network error|failed to fetch|timed?\s*out|timeout|econnreset|enotfound|unreachable|interrupted connection/i.test(
      raw,
    ) ||
    lower.includes('ネットワーク')
  ) {
    return 'ネットワークに接続できませんでした。通信環境を確認して、もう一度お試しください。';
  }
  if (/auth\/|firebase|id.?token|ログインが必要/i.test(raw)) {
    return '認証の有効期限が切れたか、接続に失敗しました。いったんログアウトして再ログイン後にお試しください。';
  }
  if (/bucket|not found|nosuchbucket/i.test(raw)) {
    return `Storage バケット「${storageBucket()}」が見つかりません。設定を確認してください。`;
  }
  if (/row-level security|policy|unauthorized|jwt|42501|403/i.test(raw)) {
    return '画像のアップロード権限がありません。ログイン状態を確認してください。';
  }
  if (/mime|content.?type|not allowed/i.test(raw)) {
    return '非対応の画像形式です。JPEG / PNG などでお試しください。';
  }
  if (/too large|payload|file.?size|entity too large/i.test(raw)) {
    return '画像サイズが大きすぎます。別の写真を選ぶか、もう少し小さい画像でお試しください。';
  }
  if (raw.trim()) {
    // 生の Firebase / 英語メッセージは出さない
    if (/\[auth\//i.test(raw) || /^[A-Za-z].{0,40}error/i.test(raw)) {
      return '画像のアップロードに失敗しました。通信環境を確認して再度お試しください。';
    }
    return raw;
  }
  return '画像のアップロードに失敗しました。もう一度お試しください。';
}

async function readNativeBase64(uri: string): Promise<string> {
  // Expo SDK 57: readAsStringAsync は legacy 経由
  const FileSystem = await import('expo-file-system/legacy');
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * 端末 URI → ArrayBuffer。
 * React Native では Blob/FormData アップロードが壊れるため base64 → ArrayBuffer を使う。
 */
async function uriToImageBytes(uri: string): Promise<ImageBytes> {
  if (Platform.OS !== 'web' && !uri.startsWith('blob:')) {
    try {
      const base64 = await readNativeBase64(uri);
      const ext = guessExt(uri);
      return {
        bytes: decodeBase64(base64),
        contentType: contentTypeForExt(ext),
        ext,
      };
    } catch (error) {
      if (__DEV__) {
        console.warn(
          '[storage] native base64 read failed, falling back to fetch',
          error,
        );
      }
    }
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('画像ファイルを読み込めませんでした。');
  }
  const headerType = (response.headers.get('Content-Type') || '')
    .split(';')[0]
    .trim();
  const bytes = await response.arrayBuffer();
  const ext = guessExt(uri, headerType);
  const contentType = headerType.startsWith('image/')
    ? headerType
    : contentTypeForExt(ext);
  return { bytes, contentType, ext };
}

/**
 * アップロード前にリサイズ＋JPEG 圧縮（タイムアウト・容量対策）。
 * manipulator が無い環境では元 URI を返す。
 */
async function prepareImageUriForUpload(
  uri: string,
  folder: UploadFolder,
): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImageManipulator = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const maxEdge = maxEdgeForFolder(folder);
    const actions = [{ resize: { width: maxEdge } }];

    // 新 API（SDK 57）優先、なければ manipulateAsync
    if (typeof ImageManipulator.manipulate === 'function') {
      const context = ImageManipulator.manipulate(uri);
      context.resize({ width: maxEdge });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      if (saved?.uri) return saved.uri;
    }

    if (typeof ImageManipulator.manipulateAsync === 'function') {
      const result = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      if (result?.uri) return result.uri;
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[storage] image prepare skipped', error);
    }
  }
  return uri;
}

async function ensureUploadAuth(folder: UploadFolder): Promise<void> {
  if (folder === 'contact') return;

  const { getCurrentFirebaseUid } = await import('@/lib/currentUser');
  const uid = await getCurrentFirebaseUid();
  if (!uid) {
    throw new Error('画像のアップロードにはログインが必要です。');
  }

  let token: string | null = null;
  try {
    token = await resolveFirebaseAccessToken();
  } catch (error) {
    throw new Error(formatStorageUploadError(error));
  }

  if (!token) {
    throw new Error(
      '認証トークンを取得できませんでした。通信環境を確認するか、再ログインしてお試しください。',
    );
  }
  if (!firebaseJwtHasAuthenticatedRole(token)) {
    throw new Error(
      '認証の準備が完了していません。しばらく待ってから再度お試しください。',
    );
  }
}

async function uploadBytesOnce(
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase が未設定です。EXPO_PUBLIC_SUPABASE_URL / ANON_KEY を確認してください。',
    );
  }
  const bucket = storageBucket();
  const { error } = await client.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: false,
    cacheControl: '3600',
  });
  if (error) {
    throw error;
  }
}

/**
 * 端末の画像 URI を Supabase Storage に上げ、公開 URL を返す。
 * 未設定時・すでに https の場合はそのまま返す。
 */
export async function uploadPublicImage(
  localUri: string,
  folder: UploadFolder,
): Promise<string> {
  const uri = localUri.trim();
  if (!uri) return uri;

  if (!ALLOWED_FOLDERS.includes(folder)) {
    throw new Error(`非対応のアップロード先です（${folder}）。`);
  }

  const alreadyPublic = resolvePublicImageUrl(uri);
  if (alreadyPublic) return alreadyPublic;
  if (isRemoteHttpUri(uri) && !isLocalImageUri(uri)) return uri;

  if (!getSupabaseClient()) {
    throw new Error(
      'Supabase が未設定です。EXPO_PUBLIC_SUPABASE_URL / ANON_KEY を確認してください。',
    );
  }

  await ensureUploadAuth(folder);

  const preparedUri = await prepareImageUriForUpload(uri, folder);
  const prepared = preparedUri !== uri;
  let { bytes, contentType, ext } = await uriToImageBytes(preparedUri);

  if (!bytes.byteLength) {
    throw new Error('画像データが空です。別の画像を選んでください。');
  }
  if (bytes.byteLength > HARD_MAX_BYTES) {
    throw new Error(
      '画像サイズが大きすぎます。別の写真を選ぶか、もう少し小さい画像でお試しください。',
    );
  }

  // 圧縮に成功した場合は JPEG として扱う
  if (prepared) {
    contentType = 'image/jpeg';
    ext = 'jpg';
  }

  const path = objectPath(folder, ext === 'jpg' ? 'jpg' : ext);
  const bucket = storageBucket();

  try {
    await uploadBytesOnce(path, bytes, contentType);
  } catch (firstError) {
    const firstMsg = errorMessage(firstError);
    const retryable =
      /network|timeout|timed?\s*out|fetch|auth\/network|interrupted|unreachable|econnreset/i.test(
        firstMsg,
      );
    if (retryable) {
      if (__DEV__) {
        console.warn('[storage] upload retry after network error', firstMsg);
      }
      await new Promise((r) => setTimeout(r, 600));
      try {
        await ensureUploadAuth(folder);
        await uploadBytesOnce(path, bytes, contentType);
      } catch (secondError) {
        console.error('[storage] upload failed', {
          bucket,
          path,
          folder,
          contentType,
          bytes: bytes.byteLength,
          message: errorMessage(secondError),
        });
        throw new Error(formatStorageUploadError(secondError));
      }
    } else {
      console.error('[storage] upload failed', {
        bucket,
        path,
        folder,
        contentType,
        bytes: bytes.byteLength,
        message: firstMsg,
      });
      throw new Error(formatStorageUploadError(firstError));
    }
  }

  const client = getSupabaseClient()!;
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  const publicUrl =
    resolvePublicImageUrl(data.publicUrl) || data.publicUrl?.trim();
  if (!publicUrl || !isRemoteHttpUri(publicUrl)) {
    const base = getSupabaseUrl().replace(/\/+$/, '');
    if (base) {
      return `${base}/storage/v1/object/public/${bucket}/${path}`;
    }
    throw new Error('公開 URL の取得に失敗しました。');
  }
  if (__DEV__) {
    console.log('[storage] uploaded', {
      bucket,
      path,
      publicUrl,
      bytes: bytes.byteLength,
    });
  }
  return publicUrl;
}

export async function uploadPublicImages(
  uris: string[],
  folder: UploadFolder,
): Promise<string[]> {
  const next: string[] = [];
  for (const uri of uris) {
    next.push(await uploadPublicImage(uri, folder));
  }
  return next;
}

/** アップロードを試し、失敗時はローカル URI のまま返す */
export async function uploadPublicImageOrLocal(
  localUri: string,
  folder: UploadFolder,
): Promise<{ uri: string; uploaded: boolean; error?: string }> {
  const uri = localUri.trim();
  if (!uri) return { uri, uploaded: false };
  const existing = resolvePublicImageUrl(uri);
  if (existing) {
    return { uri: existing, uploaded: true };
  }
  if (isRemoteHttpUri(uri) && !isLocalImageUri(uri)) {
    return { uri, uploaded: true };
  }
  if (!isRemoteStorageConfigured()) {
    return {
      uri,
      uploaded: false,
      error: 'Supabase Storage が未設定です。',
    };
  }
  try {
    const next = await uploadPublicImage(uri, folder);
    return { uri: next, uploaded: isRemoteHttpUri(next) };
  } catch (error) {
    const message = formatStorageUploadError(error);
    console.warn('[storage] upload failed', { folder, error: message });
    return {
      uri,
      uploaded: false,
      error: message,
    };
  }
}
