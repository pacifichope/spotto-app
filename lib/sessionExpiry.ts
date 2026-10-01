/**
 * セッション切れ（401 / JWT 失効）時の共通ハンドリング。
 * AuthProvider がハンドラを登録し、API 層から notify する。
 */
type SessionExpiredHandler = (reason?: string) => void;

let handler: SessionExpiredHandler | null = null;
let lastNotifiedAt = 0;
const DEBOUNCE_MS = 4_000;

export function setSessionExpiredHandler(next: SessionExpiredHandler | null) {
  handler = next;
}

export function isHttpUnauthorized(status: number | undefined | null) {
  return status === 401;
}

export function isAuthFailureMessage(message: string) {
  return /jwt expired|invalid.?jwt|not authenticated|user-token-expired|auth\/user-token-expired|auth\/invalid-user-token|UNAUTHENTICATED|PGRST301/i.test(
    message,
  );
}

/** API / Auth 層から呼ぶ。短時間の連続通知は間引く。 */
export function notifySessionExpired(reason?: string) {
  const now = Date.now();
  if (now - lastNotifiedAt < DEBOUNCE_MS) return;
  lastNotifiedAt = now;
  if (__DEV__) {
    console.warn('[auth] session expired', reason ?? '');
  }
  handler?.(reason);
}
