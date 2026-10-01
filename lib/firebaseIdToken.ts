/**
 * Firebase ID トークン取得（モジュラー API）
 */
import { Platform } from 'react-native';

import { getNativeFirebaseIdToken } from '@/lib/firebaseNativeAuth';

/** JWT payload をデコード（検証なし。クレーム確認用） */
export function peekFirebaseJwtClaims(
  token: string,
): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const raw = b64 + pad;
    let json: string;
    if (typeof globalThis.atob === 'function') {
      json = globalThis.atob(raw);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Buffer } = require('buffer') as typeof import('buffer');
      json = Buffer.from(raw, 'base64').toString('utf8');
    }
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function firebaseJwtHasAuthenticatedRole(token: string): boolean {
  const claims = peekFirebaseJwtClaims(token);
  return claims?.role === 'authenticated';
}

/** 現在の Firebase ユーザーの ID トークン。未ログイン時は null */
export async function getFirebaseIdToken(
  forceRefresh = false,
): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      const { getAuth } = await import('firebase/auth');
      const { getFirebaseJsApp, isFirebaseWebConfigured } = await import(
        '@/lib/firebaseApp'
      );
      if (!isFirebaseWebConfigured()) return null;
      // await 必須: return Promise.reject だと try/catch をすり抜ける
      const token = await getAuth(getFirebaseJsApp()).currentUser?.getIdToken(
        forceRefresh,
      );
      return token ?? null;
    }

    // 同様に await しないと auth/network-request-failed が外へ伝播する
    return (await getNativeFirebaseIdToken(forceRefresh)) ?? null;
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] getFirebaseIdToken', error);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (
      /user-token-expired|auth\/user-token-expired|auth\/invalid-user-token|auth\/user-disabled/i.test(
        message,
      )
    ) {
      void import('@/lib/sessionExpiry').then((m) =>
        m.notifySessionExpired(message),
      );
    }
    return null;
  }
}
