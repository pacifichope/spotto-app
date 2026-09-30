import { requireOptionalNativeModule } from 'expo-modules-core';
import { Alert, Platform } from 'react-native';

import { openAppSettings } from '@/lib/openAppSettings';

type ImagePickerModule = typeof import('expo-image-picker');

export type PhotoLibraryAccess =
  | { ok: true; picker: ImagePickerModule }
  | { ok: false; reason: 'unavailable' | 'denied' };

/**
 * expo-image-picker は require した瞬間に requireNativeModule が走り、
 * 未リンクだと try/catch でも捕まえられない致命エラーになる。
 * 先に optional で存在確認してからだけ読み込む。
 */
export function isImagePickerAvailable(): boolean {
  return requireOptionalNativeModule('ExponentImagePicker') != null;
}

export function getImagePicker(): ImagePickerModule | null {
  if (!isImagePickerAvailable()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-image-picker') as ImagePickerModule;
}

function promptPhotoLibrarySettings() {
  const buttons: {
    text: string;
    style?: 'cancel' | 'default';
    onPress?: () => void;
  }[] = [{ text: '閉じる', style: 'cancel' }];

  if (Platform.OS !== 'web') {
    buttons.push({
      text: '設定を開く',
      onPress: () => {
        void openAppSettings();
      },
    });
  }

  Alert.alert(
    'フォトライブラリの許可が必要です',
    '「設定を開く」を押すと、このアプリの個別設定が開きます。フォトライブラリ（写真）へのアクセスを許可してください。',
    buttons,
  );
}

/**
 * 画像ピッカーを開く前にフォトライブラリ権限を確認・リクエストする。
 * - 未決定なら OS の許可ダイアログを出す
 * - 拒否済み（再質問不可）なら設定アプリへ誘導する
 */
export async function requestPhotoLibraryAccess(): Promise<PhotoLibraryAccess> {
  const picker = getImagePicker();
  if (!picker || !isImagePickerAvailable()) {
    return { ok: false, reason: 'unavailable' };
  }

  let permission = await picker.getMediaLibraryPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await picker.requestMediaLibraryPermissionsAsync();
  }

  if (permission.granted) {
    return { ok: true, picker };
  }

  promptPhotoLibrarySettings();
  return { ok: false, reason: 'denied' };
}

function pickWebImageFiles(limit: number): Promise<string[]> {
  if (typeof document === 'undefined') return Promise.resolve([]);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = limit > 1;
    let settled = false;
    const finish = (uris: string[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(uris);
    };
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []).slice(0, limit);
      finish(files.map((file) => URL.createObjectURL(file)));
    });
    input.addEventListener('cancel', () => finish([]));
    input.click();
  });
}

/** フォトライブラリ（Web はファイル選択）から画像 URI を返す。キャンセル時は空配列。 */
export async function pickLibraryImages(
  limit: number,
  quality = 0.85,
): Promise<string[]> {
  const max = Math.max(0, Math.floor(limit));
  if (max <= 0) return [];

  if (Platform.OS === 'web') {
    return pickWebImageFiles(max);
  }

  const access = await requestPhotoLibraryAccess();
  if (access.ok) {
    const result = await access.picker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: max > 1,
      selectionLimit: max,
      quality,
    });
    if (result.canceled || !result.assets?.length) return [];
    return result.assets
      .map((asset) => asset.uri)
      .filter((uri): uri is string => Boolean(uri))
      .slice(0, max);
  }

  if (access.reason === 'unavailable') {
    Alert.alert(
      '画像を選べません',
      'この環境ではフォトライブラリを開けません。実機または対応ビルドでスクリーンショットを添付できます。',
    );
  }
  return [];
}

/**
 * アバター／アイコン用: 1:1 クロップ付きで1枚選ぶ。
 * - Android: `shape: 'oval'` で円形クロップ UI
 * - iOS: OS 標準の正方形クロップ（表示側で円形マスク）
 * キャンセル時は null。
 */
export async function pickAvatarImage(
  quality = 0.85,
): Promise<string | null> {
  if (Platform.OS === 'web') {
    const uris = await pickWebImageFiles(1);
    return uris[0] ?? null;
  }

  const access = await requestPhotoLibraryAccess();
  if (!access.ok) {
    if (access.reason === 'unavailable') {
      Alert.alert(
        '画像を選べません',
        'この環境ではフォトライブラリを開けません。実機または対応ビルドでアイコンを設定できます。',
      );
    }
    return null;
  }

  const result = await access.picker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    // Android のみ。既定の rectangle だと四角クロップ UI になる
    shape: 'oval',
    quality,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

/**
 * カバー写真用: 横長（16:9）クロップ付きで1枚選ぶ。
 * キャンセル時は null。
 */
export async function pickCoverImage(
  quality = 0.85,
): Promise<string | null> {
  if (Platform.OS === 'web') {
    const uris = await pickWebImageFiles(1);
    return uris[0] ?? null;
  }

  const access = await requestPhotoLibraryAccess();
  if (!access.ok) {
    if (access.reason === 'unavailable') {
      Alert.alert(
        '画像を選べません',
        'この環境ではフォトライブラリを開けません。実機または対応ビルドでカバー写真を設定できます。',
      );
    }
    return null;
  }

  const result = await access.picker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [16, 9],
    quality,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}
