import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

const PLACEHOLDER_PREFIX = 'YOUR_';
const DEFAULT_API_PORT = 8787;

/** EXPO_PUBLIC_* を読み、未設定・プレースホルダは空文字にする */
export function readPublicEnv(name: string) {
  const value = process.env[name];
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith(PLACEHOLDER_PREFIX)) return '';
  return trimmed;
}

export function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

/**
 * Expo / Metro が配布している開発マシンのホスト名（LAN IP など）。
 * 実機では localhost の代わりにこれを使う。
 */
function hostFromUriLike(raw: string) {
  let host = raw.trim();
  // exp://192.168.1.2:8081 や http://... を吸収
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  host = host.split('/')[0] || '';
  host = host.split('?')[0] || '';
  // host:port → host（IPv4 / ホスト名）。IPv6 は [addr]:port
  if (/^\[[^\]]+\]/.test(host)) {
    const match = host.match(/^\[([^\]]+)\]/);
    return match?.[1] || '';
  }
  if (host.includes(':')) {
    host = host.split(':')[0] || '';
  }
  return host;
}

function hostFromScriptURL() {
  try {
    const scriptURL = NativeModules.SourceCode?.scriptURL as
      | string
      | undefined;
    if (typeof scriptURL === 'string' && scriptURL.trim()) {
      return hostFromUriLike(scriptURL);
    }
  } catch {
    // ignore
  }
  return '';
}

export function getDevMachineHost() {
  const legacy = Constants as {
    manifest?: { debuggerHost?: string | null };
    platform?: { hostUri?: string | null };
  };
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.experienceUrl,
    Constants.expoGoConfig?.debuggerHost,
    Constants.manifest2?.extra?.expoClient?.hostUri,
    legacy.manifest?.debuggerHost,
    legacy.platform?.hostUri,
    hostFromScriptURL(),
  ];

  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const host = hostFromUriLike(raw);
    // Expo トンネル（*.exp.direct 等）はローカル API のホストに使えない
    if (!host || isLoopbackHost(host)) continue;
    if (/\.exp\.direct$/i.test(host) || /\.expo\.dev$/i.test(host)) continue;
    return host;
  }
  return '';
}

/**
 * ネイティブ実機では localhost が端末自身を指すため、
 * EXPO_PUBLIC_API_BASE_URL の loopback を開発マシンの LAN IP に書き換える。
 * Web / iOS シミュレータ（host が取れない場合）はそのまま。
 * Android 実機で LAN が取れないときは localhost を維持（adb reverse 用）。
 * 10.0.2.2 はエミュレータ専用。
 */
export function resolveDevApiBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/$/, '');
  if (!trimmed || !isHttpUrl(trimmed)) return '';
  if (Platform.OS === 'web') return trimmed;

  try {
    const url = new URL(trimmed);
    if (!isLoopbackHost(url.hostname)) return trimmed.replace(/\/$/, '');

    const lanHost = getDevMachineHost();
    if (lanHost) {
      url.hostname = lanHost;
      return url.toString().replace(/\/$/, '');
    }

    // Android エミュレータのみ 10.0.2.2（実機では adb reverse 前提で localhost のまま）
    if (Platform.OS === 'android' && Constants.isDevice === false) {
      url.hostname = '10.0.2.2';
      return url.toString().replace(/\/$/, '');
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

/**
 * 決済・通知などで使う API ベース URL。
 * 未設定時は開発中のみ Expo の LAN IP + :8787 を推定する。
 */
export function getApiBaseUrl() {
  const configured = readPublicEnv('EXPO_PUBLIC_API_BASE_URL');
  if (configured && isHttpUrl(configured)) {
    return resolveDevApiBaseUrl(configured);
  }

  if (!__DEV__) return '';

  const lanHost = getDevMachineHost();
  if (lanHost) {
    return `http://${lanHost}:${DEFAULT_API_PORT}`;
  }
  if (Platform.OS === 'android' && Constants.isDevice === false) {
    return `http://10.0.2.2:${DEFAULT_API_PORT}`;
  }
  if (Platform.OS === 'web' || Platform.OS === 'ios' || Platform.OS === 'android') {
    // iOS シミュレータ / Web / Android 実機（adb reverse）
    return `http://localhost:${DEFAULT_API_PORT}`;
  }
  return '';
}

/** 個別 URL が無ければ API ベース + path を使う */
export function publicApiUrl(path: string, specificEnvName?: string) {
  if (specificEnvName) {
    const specific = readPublicEnv(specificEnvName);
    if (specific && isHttpUrl(specific)) {
      return resolveDevApiBaseUrl(specific);
    }
  }
  const base = getApiBaseUrl();
  if (!base || !isHttpUrl(base)) return '';
  if (!path) return base;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** fetch 失敗時のユーザー向けメッセージ */
export function apiConnectionErrorMessage(url: string, error: unknown) {
  const detail =
    error instanceof Error && error.message ? error.message : String(error);
  if (__DEV__) {
    return (
      `決済サーバーに接続できませんでした。` +
      `URL=${url} / error=${detail}。` +
      `「npm run api」起動・同じ Wi‑Fi・実機なら LAN IP 向けか確認してください。`
    );
  }
  return '決済サーバーに接続できませんでした。時間をおいて再度お試しください。';
}
