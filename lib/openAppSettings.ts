import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const FALLBACK_APP_ID = 'com.spotto.app';

/** ビルドに埋め込まれた iOS bundle ID / Android package name */
export function getNativeAppId(): string {
  if (Platform.OS === 'ios') {
    return Constants.expoConfig?.ios?.bundleIdentifier ?? FALLBACK_APP_ID;
  }
  if (Platform.OS === 'android') {
    return Constants.expoConfig?.android?.package ?? FALLBACK_APP_ID;
  }
  return FALLBACK_APP_ID;
}

/**
 * 端末の「このアプリ専用」の設定画面を開く。
 * iOS: アプリの個別設定（権限・通知など）
 * Android: アプリ情報（権限を含む APPLICATION_DETAILS_SETTINGS）
 */
export async function openAppSettings(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const appId = getNativeAppId();
  if (!appId) return false;

  try {
    await Linking.openSettings();
    return true;
  } catch {
    if (Platform.OS === 'ios') {
      try {
        await Linking.openURL('app-settings:');
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
