/**
 * Supabase Third-Party Auth 用: Firebase JWT に role=authenticated を付与。
 * サインイン直後・起動時・DB アクセス前に呼び、成功後は ID トークンを force refresh する。
 */
import { getApiBaseUrl, listApiBaseUrlCandidates } from '@/lib/env';
import {
  firebaseJwtHasAuthenticatedRole,
  getFirebaseIdToken,
  peekFirebaseJwtClaims,
} from '@/lib/firebaseIdToken';

let inFlight: Promise<boolean> | null = null;
let lastOkAt = 0;

function candidateApiBases(primary: string): string[] {
  return listApiBaseUrlCandidates(primary);
}

function isConnectionError(error: unknown): boolean {
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

/** Authorization 用に正規化した Firebase ID Token（JWT）を返す */
function normalizeIdToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let token = String(raw).trim();
  // 誤って "Bearer xxx" が入っていた場合
  token = token.replace(/^Bearer\s+/i, '').trim();
  // 改行・引用符を除去
  token = token.replace(/^["']|["']$/g, '').replace(/\s+/g, '');
  if (!token || token.split('.').length !== 3) return null;
  return token;
}

async function postEnsureClaims(
  apiBase: string,
  idToken: string,
): Promise<{
  ok: boolean;
  status: number;
  error?: string;
  data: { ok?: boolean; error?: string; role?: string };
}> {
  const response = await fetch(`${apiBase}/auth/firebase-ensure-claims`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    needsRefresh?: boolean;
    error?: string;
    role?: string;
  };
  return {
    ok: response.ok && data.ok !== false,
    status: response.status,
    error: data.error || response.statusText,
    data,
  };
}

/**
 * @returns true if token now has role=authenticated
 */
export async function ensureFirebaseAuthenticatedClaim(): Promise<boolean> {
  // 直近成功していれば短時間は再ヒットしない（起動直後の連打対策）
  if (Date.now() - lastOkAt < 15_000) {
    const token = normalizeIdToken(await getFirebaseIdToken(false));
    if (token && firebaseJwtHasAuthenticatedRole(token)) return true;
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // 送信直前に force refresh し、最新の ID トークンを Bearer に載せる
      let idToken = normalizeIdToken(await getFirebaseIdToken(true));
      if (!idToken) {
        idToken = normalizeIdToken(await getFirebaseIdToken(false));
      }
      if (!idToken) {
        if (__DEV__) {
          console.warn('[auth] ensureClaims: Firebase ID token なし / JWT 形式不正');
        }
        return false;
      }

      if (firebaseJwtHasAuthenticatedRole(idToken)) {
        lastOkAt = Date.now();
        if (__DEV__) {
          console.log('[supabase] firebase jwt', {
            role: 'authenticated',
            sub: peekFirebaseJwtClaims(idToken)?.sub ?? null,
            source: 'already-present',
          });
        }
        return true;
      }

      const primary = getApiBaseUrl().replace(/\/$/, '');
      if (!primary) {
        if (__DEV__) {
          console.warn(
            '[auth] ensureClaims: EXPO_PUBLIC_API_BASE_URL 未設定。role=authenticated を付与できません',
          );
        }
        return false;
      }

      const bases = candidateApiBases(primary);
      if (__DEV__) {
        const claims = peekFirebaseJwtClaims(idToken);
        console.log('[auth] ensureClaims: role 不足 → サーバーへ要求', {
          apiBases: bases,
          sub: claims?.sub ?? null,
          role: claims?.role ?? null,
          tokenLen: idToken.length,
          hasBearerHeader: true,
        });
      }

      let lastError = '';
      let succeeded = false;

      for (const apiBase of bases) {
        try {
          const result = await postEnsureClaims(apiBase, idToken);
          if (!result.ok) {
            lastError = result.error || `HTTP ${result.status}`;
            if (__DEV__) {
              console.warn('[auth] ensureClaims failed', {
                apiBase,
                status: result.status,
                error: lastError,
                hint:
                  result.status === 503
                    ? 'API の Google 到達性 / FIREBASE_SERVICE_ACCOUNT を確認'
                    : result.status === 401
                      ? 'Bearer に載せる Firebase ID Token が無効、またはプロジェクト不一致'
                      : undefined,
              });
            }
            // 503 = Admin/ネットワーク → 他 base でも同じことが多いが LAN↔localhost は試す
            if (result.status === 401) break;
            continue;
          }
          succeeded = true;
          if (__DEV__ && apiBase !== primary) {
            console.log('[auth] ensureClaims: fallback API 成功', { apiBase });
          }
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          if (__DEV__) {
            console.warn('[auth] ensureClaims connect', {
              apiBase,
              error: lastError,
              willRetryLocalhost:
                isConnectionError(error) &&
                bases.indexOf(apiBase) < bases.length - 1,
            });
          }
          if (!isConnectionError(error)) break;
        }
      }

      if (!succeeded) {
        if (__DEV__) {
          console.warn(
            '[auth] ensureClaims: 付与失敗。npm run api 起動と FIREBASE_SERVICE_ACCOUNT を確認',
            { lastError },
          );
        }
        return false;
      }

      // カスタムクレーム反映には必ず force refresh
      idToken = normalizeIdToken(await getFirebaseIdToken(true));
      if (!idToken) return false;

      // 反映遅延に備え、まだ無ければもう一度 force refresh
      if (!firebaseJwtHasAuthenticatedRole(idToken)) {
        await new Promise((r) => setTimeout(r, 400));
        idToken = normalizeIdToken(await getFirebaseIdToken(true));
      }

      const ok = Boolean(idToken && firebaseJwtHasAuthenticatedRole(idToken));
      if (ok) lastOkAt = Date.now();

      if (__DEV__) {
        const claims = idToken ? peekFirebaseJwtClaims(idToken) : null;
        console.log('[supabase] firebase jwt', {
          role: claims?.role ?? null,
          sub: claims?.sub ?? null,
          hasAuthenticatedRole: ok,
          source: 'after-ensure-claims',
        });
      }
      return ok;
    } catch (error) {
      if (__DEV__) {
        console.warn('[auth] ensureFirebaseAuthenticatedClaim', error);
      }
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
