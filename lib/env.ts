import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import i18n from '@/lib/i18n';

const PLACEHOLDER_PREFIX = 'YOUR_';
const DEFAULT_API_PORT = 8787;

/**
 * 実機 / EAS / 本番向けのデフォルト API。
 * EXPO_PUBLIC_API_BASE_URL_REMOTE 未設定時のフォールバック（localhost は使わない）。
 */
export const DEFAULT_REMOTE_API_BASE_URL =
  'https://spotto-api-rupy.onrender.com';

type ExtraApiConfig = {
  apiBaseUrl?: string;
  apiBaseUrlRemote?: string;
  authApiUrl?: string;
  useLocalApi?: boolean | string;
};

let warnedMissingRemoteOnce = false;

function readExtra(): ExtraApiConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as ExtraApiConfig;
  return extra && typeof extra === 'object' ? extra : {};
}

/** EXPO_PUBLIC_* を読み、未設定・プレースホルダは空文字にする（extra フォールバック付き） */
export function readPublicEnv(name: string) {
  const value = process.env[name];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && !trimmed.startsWith(PLACEHOLDER_PREFIX)) {
      return trimmed;
    }
  }

  // EAS / スタンドアロンでは process.env が空でも app.config extra に焼かれている
  const extra = readExtra();
  if (name === 'EXPO_PUBLIC_API_BASE_URL' && extra.apiBaseUrl) {
    return String(extra.apiBaseUrl).trim();
  }
  if (name === 'EXPO_PUBLIC_API_BASE_URL_REMOTE' && extra.apiBaseUrlRemote) {
    return String(extra.apiBaseUrlRemote).trim();
  }
  if (name === 'EXPO_PUBLIC_AUTH_API_URL' && extra.authApiUrl) {
    return String(extra.authApiUrl).trim();
  }
  if (name === 'EXPO_PUBLIC_USE_LOCAL_API' && extra.useLocalApi != null) {
    return String(extra.useLocalApi).trim();
  }
  return '';
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

function isPrivateLanHost(hostname: string) {
  if (isLoopbackHost(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }
  if (hostname === '10.0.2.2') return true;
  return false;
}

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/$/, '');
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isUsablePublicApiUrl(url: string) {
  if (!url || !isHttpUrl(url)) return false;
  return !isPrivateLanHost(safeHostname(url));
}

/**
 * Expo / Metro が配布している開発マシンのホスト名（LAN IP など）。
 */
function hostFromUriLike(raw: string) {
  let host = raw.trim();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  host = host.split('/')[0] || '';
  host = host.split('?')[0] || '';
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
    if (!host || isLoopbackHost(host)) continue;
    if (/\.exp\.direct$/i.test(host) || /\.expo\.dev$/i.test(host)) continue;
    return host;
  }
  return '';
}

/**
 * ローカル API（localhost → LAN 置換）を使ってよいか。
 * EAS 実機ビルド・スタンドアロン・物理デバイスでは原則不可。
 * 明示的に EXPO_PUBLIC_USE_LOCAL_API=1 のときのみ許可。
 */
export function allowLocalDevApiRewrite() {
  if (readPublicEnv('EXPO_PUBLIC_USE_LOCAL_API') === '1') {
    return true;
  }
  if (!__DEV__) return false;

  if (Constants.appOwnership === 'standalone') return false;
  const execution = String(
    (Constants as { executionEnvironment?: string }).executionEnvironment || '',
  );
  if (execution === 'standalone') return false;

  // 物理実機は LAN 依存を避ける（シミュレータ／エミュレータのみ許可）
  if (Platform.OS !== 'web' && Constants.isDevice !== false) {
    return false;
  }

  return true;
}

/**
 * ネイティブ実機では localhost が端末自身を指すため、
 * loopback を開発マシンの LAN IP に書き換える（ローカル開発専用）。
 */
export function resolveDevApiBaseUrl(baseUrl: string) {
  const trimmed = normalizeBaseUrl(baseUrl);
  if (!trimmed || !isHttpUrl(trimmed)) return '';
  if (Platform.OS === 'web') return trimmed;
  if (!allowLocalDevApiRewrite()) return trimmed;

  try {
    const url = new URL(trimmed);
    if (!isLoopbackHost(url.hostname)) return trimmed;

    const lanHost = getDevMachineHost();
    if (lanHost) {
      url.hostname = lanHost;
      return normalizeBaseUrl(url.toString());
    }

    if (Platform.OS === 'android' && Constants.isDevice === false) {
      url.hostname = '10.0.2.2';
      return normalizeBaseUrl(url.toString());
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

/**
 * 実機 / EAS / 本番向けリモート API。
 * 優先順: API_BASE_URL_REMOTE → AUTH_API_URL → 公開 HTTPS の API_BASE_URL → デフォルト本番 URL
 * localhost / LAN は絶対に返さない。
 */
export function getRemoteApiBaseUrl() {
  const remote = readPublicEnv('EXPO_PUBLIC_API_BASE_URL_REMOTE');
  if (remote && isUsablePublicApiUrl(remote)) {
    return normalizeBaseUrl(remote);
  }

  const authSpecific = readPublicEnv('EXPO_PUBLIC_AUTH_API_URL');
  if (authSpecific && isUsablePublicApiUrl(authSpecific)) {
    return normalizeBaseUrl(authSpecific);
  }

  const configured = readPublicEnv('EXPO_PUBLIC_API_BASE_URL');
  if (configured && isUsablePublicApiUrl(configured)) {
    return normalizeBaseUrl(configured);
  }

  // extra に焼かれた remote / apiBaseUrl（localhost 以外）
  const extra = readExtra();
  const fromExtraRemote = String(extra.apiBaseUrlRemote || '').trim();
  if (fromExtraRemote && isUsablePublicApiUrl(fromExtraRemote)) {
    return normalizeBaseUrl(fromExtraRemote);
  }
  const fromExtraBase = String(extra.apiBaseUrl || '').trim();
  if (fromExtraBase && isUsablePublicApiUrl(fromExtraBase)) {
    return normalizeBaseUrl(fromExtraBase);
  }

  if (isUsablePublicApiUrl(DEFAULT_REMOTE_API_BASE_URL)) {
    return normalizeBaseUrl(DEFAULT_REMOTE_API_BASE_URL);
  }

  return '';
}

/**
 * 決済・通知・認証などで使う API ベース URL。
 * - 実機 / EAS / 本番: REMOTE（なければデフォルト本番 HTTPS）。localhost は使わない。
 * - シミュレータ等 + USE_LOCAL_API: ローカル API
 */
export function getApiBaseUrl() {
  // 実機・スタンドアロン・本番: 常にリモート優先（localhost フォールバック禁止）
  if (!allowLocalDevApiRewrite()) {
    const remote = getRemoteApiBaseUrl();
    if (remote) return remote;

    if (__DEV__ && !warnedMissingRemoteOnce) {
      warnedMissingRemoteOnce = true;
      console.warn(
        '[env] 公開 API URL を解決できませんでした。' +
          'EXPO_PUBLIC_API_BASE_URL_REMOTE に HTTPS を設定してください。',
      );
    }
    return '';
  }

  // シミュレータ等のローカル開発: 明示的にローカルを使う。リモートも併用可
  const configured = readPublicEnv('EXPO_PUBLIC_API_BASE_URL');
  if (configured && isHttpUrl(configured)) {
    // ローカル向けなら LAN 置換、すでに HTTPS 公開 URL ならそのまま
    if (isUsablePublicApiUrl(configured)) {
      return normalizeBaseUrl(configured);
    }
    return resolveDevApiBaseUrl(configured);
  }

  // ローカル未設定ならリモートへ（警告なし）
  const remote = getRemoteApiBaseUrl();
  if (remote) return remote;

  const lanHost = getDevMachineHost();
  if (lanHost) {
    return `http://${lanHost}:${DEFAULT_API_PORT}`;
  }
  if (Platform.OS === 'android' && Constants.isDevice === false) {
    return `http://10.0.2.2:${DEFAULT_API_PORT}`;
  }
  if (Platform.OS === 'web' || Platform.OS === 'ios' || Platform.OS === 'android') {
    return `http://localhost:${DEFAULT_API_PORT}`;
  }
  return '';
}

/**
 * 接続失敗時に順に試す API ベース URL 一覧。
 * 実機では localhost / LAN を候補に入れない。
 */
export function listApiBaseUrlCandidates(preferred?: string): string[] {
  const ordered: string[] = [];
  const push = (url: string) => {
    const next = normalizeBaseUrl(url);
    if (!next || !isHttpUrl(next)) return;
    if (!ordered.includes(next)) ordered.push(next);
  };

  const localOk = allowLocalDevApiRewrite();
  const remote = getRemoteApiBaseUrl();
  const authSpecific = readPublicEnv('EXPO_PUBLIC_AUTH_API_URL');

  // 1) REMOTE / 公開 HTTPS を最優先
  if (remote) push(remote);

  if (authSpecific && isUsablePublicApiUrl(authSpecific)) {
    push(authSpecific);
  }

  // 2) 呼び出し元 preferred（公開 URL のみ。localhost は実機で捨てる）
  if (preferred) {
    const pref = normalizeBaseUrl(preferred);
    if (pref && (localOk || isUsablePublicApiUrl(pref))) {
      if (localOk && isPrivateLanHost(safeHostname(pref))) {
        push(resolveDevApiBaseUrl(pref) || pref);
      } else if (isUsablePublicApiUrl(pref)) {
        push(pref);
      }
    }
  }

  // 3) getApiBaseUrl の結果
  const primary = getApiBaseUrl();
  if (primary && (localOk || isUsablePublicApiUrl(primary))) {
    push(primary);
  }

  // 4) ローカル開発時のみ localhost / LAN / エミュレータ
  if (localOk) {
    const configured = readPublicEnv('EXPO_PUBLIC_API_BASE_URL');
    if (configured && isHttpUrl(configured)) {
      push(resolveDevApiBaseUrl(configured) || configured);
    }
    if (Platform.OS === 'android') {
      push(`http://localhost:${DEFAULT_API_PORT}`);
    }
    const lanHost = getDevMachineHost();
    if (lanHost) {
      push(`http://${lanHost}:${DEFAULT_API_PORT}`);
    }
    if (Platform.OS === 'android' && Constants.isDevice === false) {
      push(`http://10.0.2.2:${DEFAULT_API_PORT}`);
    }
  }

  return ordered;
}

/** 接続エラーらしいか（候補フォールバック判定用） */
export function isApiConnectionError(error: unknown) {
  const msg = String(
    error instanceof Error ? error.message : error ?? '',
  ).toLowerCase();
  return (
    msg.includes('connect') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('unreachable')
  );
}

/** 個別 URL が無ければ API ベース + path を使う */
export function publicApiUrl(path: string, specificEnvName?: string) {
  if (specificEnvName) {
    const specific = readPublicEnv(specificEnvName);
    if (specific && isHttpUrl(specific)) {
      if (!allowLocalDevApiRewrite()) {
        // 実機: localhost 指定は無視してリモートへ
        if (isUsablePublicApiUrl(specific)) {
          return normalizeBaseUrl(specific);
        }
        return getRemoteApiBaseUrl();
      }
      if (isUsablePublicApiUrl(specific)) {
        return normalizeBaseUrl(specific);
      }
      return resolveDevApiBaseUrl(specific) || normalizeBaseUrl(specific);
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
      `${i18n.t('payment.errorServerUnreachable')} ` +
      `URL=${url} / error=${detail}. ` +
      `Set EXPO_PUBLIC_API_BASE_URL_REMOTE (production HTTPS) for device/EAS builds.`
    );
  }
  return i18n.t('payment.errorServerUnreachable');
}
