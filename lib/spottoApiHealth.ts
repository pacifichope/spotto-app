/**
 * spotto API のヘルス／認証ルート確認（実機 LINE 404 対策）
 */

export type SpottoApiHealth = {
  ok?: boolean;
  status?: string;
  service?: string;
  auth?: {
    lineFirebase?: string;
    firebaseAdmin?: boolean;
  };
};

function stripSlash(url: string) {
  return url.trim().replace(/\/$/, '');
}

/** health がこのリポジトリの server/index.mjs か判定 */
export function isSpottoApiHealth(data: unknown): data is SpottoApiHealth {
  if (!data || typeof data !== 'object') return false;
  const row = data as Record<string, unknown>;
  return row.service === 'spotto-api';
}

/**
 * API ベースが spotto-api か軽量に確認。
 * 別サービス（Nest 等の 404）を弾くために使う。
 */
export async function probeSpottoApiBase(
  apiBase: string,
  timeoutMs = 8000,
): Promise<{ ok: boolean; reason?: string; health?: SpottoApiHealth }> {
  const base = stripSlash(apiBase);
  if (!base || !/^https?:\/\//i.test(base)) {
    return { ok: false, reason: 'invalid-base' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return { ok: false, reason: `health-http-${response.status}` };
    }
    if (!isSpottoApiHealth(data)) {
      return {
        ok: false,
        reason: 'not-spotto-api',
        health: (data || {}) as SpottoApiHealth,
      };
    }
    return { ok: true, health: data };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'timeout'
          : 'network',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function lineFirebaseUrl(apiBase: string) {
  return `${stripSlash(apiBase)}/auth/line-firebase`;
}
