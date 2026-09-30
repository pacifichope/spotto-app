/**
 * Firebase Admin SDK（サーバー専用）
 * FIREBASE_SERVICE_ACCOUNT_JSON = サービスアカウント JSON 文字列
 * または GOOGLE_APPLICATION_CREDENTIALS = JSON ファイルパス
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let adminApp = null;
let initError = null;

function env(name) {
  return (process.env[name] || '').trim();
}

export function getFirebaseAdmin() {
  if (adminApp) return adminApp;
  if (initError) return null;

  try {
    const admin = require('firebase-admin');
    if (admin.apps?.length) {
      adminApp = admin.app();
      return adminApp;
    }

    const jsonRaw = env('FIREBASE_SERVICE_ACCOUNT_JSON');
    const credPath = env('GOOGLE_APPLICATION_CREDENTIALS');
    let credential;

    if (jsonRaw) {
      const parsed = JSON.parse(jsonRaw);
      credential = admin.credential.cert(parsed);
      adminApp = admin.initializeApp({
        credential,
        projectId: parsed.project_id,
      });
    } else if (credPath) {
      const resolved = path.isAbsolute(credPath)
        ? credPath
        : path.resolve(process.cwd(), credPath);
      const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
      credential = admin.credential.cert(parsed);
      adminApp = admin.initializeApp({
        credential,
        projectId: parsed.project_id,
      });
    } else {
      initError = new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS is required',
      );
      return null;
    }

    console.log('[firebase-admin] initialized', {
      projectId: adminApp.options?.projectId || null,
    });
    return adminApp;
  } catch (error) {
    initError = error instanceof Error ? error : new Error(String(error));
    console.warn('[firebase-admin] init failed', initError.message);
    return null;
  }
}

export function getFirebaseAdminInitError() {
  if (getFirebaseAdmin()) return null;
  return initError?.message || 'Firebase Admin is not configured';
}

export function getFirebaseAuth() {
  const app = getFirebaseAdmin();
  if (!app) return null;
  const admin = require('firebase-admin');
  return admin.auth(app);
}

/** Bearer Firebase ID トークンを検証して uid / email / claims を返す */
export async function verifyFirebaseIdToken(bearerToken, options = {}) {
  const auth = getFirebaseAuth();
  if (!auth || !bearerToken) {
    return { ok: false, error: 'missing_token', status: 401 };
  }

  const raw = String(bearerToken).trim();
  // "Bearer xxx" が二重に渡ってきた場合を吸収
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token || token.split('.').length !== 3) {
    return {
      ok: false,
      error: 'invalid_token_format',
      status: 401,
      detail: `expected JWT, got length=${token.length}`,
    };
  }

  const checkRevoked = Boolean(options.checkRevoked);
  try {
    const decoded = await auth.verifyIdToken(token, checkRevoked);
    return {
      ok: true,
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : '',
      role: decoded.role,
      claims: decoded,
    };
  } catch (error) {
    const message = error?.message || String(error);
    const code = error?.code || error?.errorInfo?.code || '';
    console.warn('[firebase-admin] verifyIdToken failed', {
      code,
      message,
      tokenLen: token.length,
      tokenPrefix: `${token.slice(0, 12)}…`,
    });

    // Google JWKS / Auth API 到達不可 → 認証失敗ではなくサーバー障害
    if (
      /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network|fetch failed|getting metadata/i.test(
        message,
      )
    ) {
      return {
        ok: false,
        error: 'verify_network_error',
        status: 503,
        detail: message,
      };
    }

    return {
      ok: false,
      error: 'unauthorized',
      status: 401,
      detail: message,
      code,
    };
  }
}

/**
 * Supabase Third-Party Auth 用に role: authenticated を付与。
 * @returns {{ ok: boolean, needsRefresh: boolean, error?: string }}
 */
export async function ensureAuthenticatedRole(uid) {
  const auth = getFirebaseAuth();
  if (!auth || !uid) {
    return {
      ok: false,
      needsRefresh: false,
      error: getFirebaseAdminInitError() || 'Firebase Auth admin unavailable',
    };
  }

  try {
    const user = await auth.getUser(uid);
    const existing = user.customClaims || {};
    if (existing.role === 'authenticated') {
      return { ok: true, needsRefresh: false };
    }
    await auth.setCustomUserClaims(uid, {
      ...existing,
      role: 'authenticated',
    });
    return { ok: true, needsRefresh: true };
  } catch (error) {
    const message = error?.message || String(error);
    console.warn('[firebase-admin] setCustomUserClaims', message);
    return { ok: false, needsRefresh: false, error: message };
  }
}

/** LINE ユーザー用 Custom Token（uid = line_<LINE userId>） */
export async function createLineCustomToken(
  lineUserId,
  profile = {},
  extraClaims = {},
) {
  const auth = getFirebaseAuth();
  if (!auth) {
    const err = new Error('Firebase Admin is not configured');
    err.status = 503;
    throw err;
  }
  const uid = `line_${String(lineUserId).trim()}`.slice(0, 128);
  const displayName =
    typeof profile.displayName === 'string' && profile.displayName.trim()
      ? profile.displayName.trim().slice(0, 128)
      : undefined;
  const photoURL =
    typeof profile.pictureUrl === 'string' && profile.pictureUrl.trim()
      ? profile.pictureUrl.trim()
      : undefined;
  const email =
    typeof profile.email === 'string' && profile.email.trim()
      ? profile.email.trim()
      : undefined;

  // 既存ユーザー取得 or 新規作成（紐付け）
  try {
    await auth.getUser(uid);
    const updates = {};
    if (displayName) updates.displayName = displayName;
    if (photoURL) updates.photoURL = photoURL;
    if (email) updates.email = email;
    if (Object.keys(updates).length > 0) {
      try {
        await auth.updateUser(uid, updates);
      } catch (error) {
        console.warn(
          '[firebase-admin] LINE updateUser',
          error?.message || error,
        );
      }
    }
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      await auth.createUser({
        uid,
        displayName: displayName || 'LINEユーザー',
        photoURL: photoURL || undefined,
        email: email || undefined,
        emailVerified: Boolean(email),
      });
    } else {
      throw error;
    }
  }

  const claims = {
    role: 'authenticated',
    provider: 'line',
    ...extraClaims,
  };

  // 永続クレーム（ID トークンに載る）
  await auth.setCustomUserClaims(uid, claims);

  // Custom Token（クライアントが signInWithCustomToken → ID トークン取得）
  const customToken = await auth.createCustomToken(uid, claims);

  return { uid, customToken };
}

export async function deleteFirebaseUser(uid) {
  const auth = getFirebaseAuth();
  if (!auth || !uid) return false;
  try {
    await auth.deleteUser(uid);
    return true;
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return true;
    console.warn('[firebase-admin] deleteUser', error?.message || error);
    return false;
  }
}
