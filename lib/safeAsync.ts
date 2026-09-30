import { Alert, Platform } from 'react-native';

/**
 * ユーザー向けの短いエラー文言に正規化する（英語生エラーや Abort を隠す）。
 */
export function userFacingNetworkError(
  error: unknown,
  fallback = '通信に失敗しました。接続を確認して再度お試しください。',
): string {
  if (error == null) return fallback;
  if (typeof error === 'string' && error.trim()) {
    const msg = error.trim();
    if (/abort|timeout|network|failed to fetch|offline/i.test(msg)) {
      return '接続が不安定です。時間をおいて再度お試しください。';
    }
    // 日本語メッセージはそのまま
    if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(msg)) return msg;
    return fallback;
  }
  if (error instanceof Error) {
    const name = error.name || '';
    const msg = error.message || '';
    if (
      name === 'AbortError' ||
      /abort|timeout|network|failed to fetch|offline/i.test(msg)
    ) {
      return '接続が不安定です。時間をおいて再度お試しください。';
    }
    if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(msg)) return msg;
  }
  return fallback;
}

export function showNetworkErrorAlert(
  error: unknown,
  title = 'エラー',
  fallback?: string,
) {
  const message = userFacingNetworkError(error, fallback);
  // 英語の PostgREST / RLS 生エラーは userFacing で隠れるため、調査用に必ず残す
  console.error('[networkError]', {
    title,
    message,
    raw:
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
  });
  Alert.alert(title, message);
}

/**
 * 例外を飲み込んで結果を返す。UI クラッシュ防止用。
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<{ ok: true; data: T } | { ok: false; data: T; error: unknown }> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    if (__DEV__) {
      console.warn('[safeAsync]', error);
    }
    return { ok: false, data: fallback, error };
  }
}

/** fetch にタイムアウトを付ける */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 15_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...rest,
      signal: rest.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function isProbablyOffline(): boolean {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return navigator.onLine === false;
  }
  return false;
}
