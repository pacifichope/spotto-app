/**
 * クライアント向けの短命メモリキャッシュ（タブ切替・戻るで即時表示）。
 * stale-while-revalidate: TTL 内はキャッシュを返しつつ裏で再取得可能。
 */

type CacheEntry = {
  data: unknown;
  at: number;
};

const store = new Map<string, CacheEntry>();

/** デフォルト: 新鮮とみなす時間 */
export const QUERY_FRESH_MS = 45_000;
/** デフォルト: 表示に使える最大古さ（これより古いと無視） */
export const QUERY_STALE_MS = 5 * 60_000;

export function peekQueryCache<T>(
  key: string,
  maxAgeMs: number = QUERY_STALE_MS,
): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > maxAgeMs) return null;
  return entry.data as T;
}

export function isQueryCacheFresh(
  key: string,
  freshMs: number = QUERY_FRESH_MS,
): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  return Date.now() - entry.at <= freshMs;
}

export function setQueryCache<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() });
}

export function invalidateQueryCache(prefixOrKey: string): void {
  if (store.has(prefixOrKey)) {
    store.delete(prefixOrKey);
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefixOrKey)) store.delete(key);
  }
}

/**
 * キャッシュがあれば即返し、古ければ裏で再取得。
 * 初回（キャッシュなし）は fetcher 完了まで待つ。
 */
export async function cachedQuery<T>(options: {
  key: string;
  fetcher: () => Promise<T>;
  freshMs?: number;
  staleMs?: number;
  /** 裏更新完了時（UI に反映したいとき） */
  onUpdate?: (data: T) => void;
}): Promise<{ data: T; fromCache: boolean }> {
  const freshMs = options.freshMs ?? QUERY_FRESH_MS;
  const staleMs = options.staleMs ?? QUERY_STALE_MS;
  const cached = peekQueryCache<T>(options.key, staleMs);

  if (cached != null) {
    if (!isQueryCacheFresh(options.key, freshMs)) {
      void options
        .fetcher()
        .then((next) => {
          setQueryCache(options.key, next);
          options.onUpdate?.(next);
        })
        .catch(() => {
          /* 裏更新失敗は表示中キャッシュを維持 */
        });
    }
    return { data: cached, fromCache: true };
  }

  const data = await options.fetcher();
  setQueryCache(options.key, data);
  return { data, fromCache: false };
}

export function inboxCacheKey(userId: string) {
  return `inbox:${userId}`;
}

export function clubsCacheKey(userId: string) {
  return `clubs:${userId}`;
}

export function clubDetailCacheKey(clubId: string) {
  return `club:${clubId}`;
}

export function chatRoomCacheKey(
  eventId: string,
  mode: string,
  dmUserId?: string | null,
) {
  return `chat:${eventId}:${mode}:${dmUserId?.trim() || ''}`;
}
