'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  coordsOrFallback,
  requestPermissionAndGetCoordinates,
  type GeolocationFailureReason,
  type LatLng,
} from '@/lib/userLocation';

export type UserLocationStatus =
  | 'idle'
  | 'locating'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'unsupported';

function statusFromReason(
  reason: GeolocationFailureReason | null,
): UserLocationStatus {
  if (!reason) return 'ready';
  if (reason === 'permission_denied') return 'denied';
  if (reason === 'unsupported') return 'unsupported';
  return 'unavailable';
}

/**
 * アプリ版 HomeBrowseProvider の位置情報ステートに相当する Web フック。
 * - マウント時に一度 getCurrentPosition
 * - 失敗時もクラッシュせず coords=null（呼び出し側でフォールバック）
 * - refresh で「現在地へ戻る」相当
 */
export function useUserLocation(options?: { requestOnMount?: boolean }) {
  const requestOnMount = options?.requestOnMount !== false;
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<UserLocationStatus>('idle');
  const [failureReason, setFailureReason] =
    useState<GeolocationFailureReason | null>(null);

  const mountedRef = useRef(false);
  const initialDoneRef = useRef(false);
  const genRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      genRef.current += 1;
    };
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    const gen = ++genRef.current;
    if (!mountedRef.current) return false;
    setStatus('locating');
    try {
      const { coords: next, reason } = await requestPermissionAndGetCoordinates();
      if (!mountedRef.current || gen !== genRef.current) return false;
      if (!next) {
        setCoords(null);
        setFailureReason(reason);
        setStatus(statusFromReason(reason));
        return false;
      }
      setCoords(next);
      setFailureReason(null);
      setStatus('ready');
      return true;
    } catch {
      if (!mountedRef.current || gen !== genRef.current) return false;
      setCoords(null);
      setFailureReason('unknown');
      setStatus('unavailable');
      return false;
    }
  }, []);

  useEffect(() => {
    if (!requestOnMount || initialDoneRef.current) return;
    initialDoneRef.current = true;
    void refresh();
  }, [requestOnMount, refresh]);

  return {
    /** GPS で取れた座標。拒否・失敗時は null */
    coords,
    /** マップ center 用。常に有効な座標 */
    center: coordsOrFallback(coords),
    locating: status === 'locating',
    status,
    failureReason,
    refresh,
  };
}
