/**
 * LINE Login → API（/auth/line-firebase）→ Firebase Custom Token → Auth セッション
 *
 * ネイティブ: @xmartlabs/react-native-line + @react-native-firebase/auth
 * Web: 同 LINE SDK（web）+ firebase/auth
 *
 * --- LINE Developers / SDK 注意点 ---
 * 1. 同意画面が毎回出る主な原因
 *    - 毎回 `Line.login()` を呼んでいる（キャッシュトークンを使っていない）
 *    - `scope` に前回未許可の権限（特に `email`）を追加している
 *    - Login チャネルに公式アカウントをリンクし、`bot_prompt=normal|aggressive` を付けている
 *    - ユーザーが LINE アプリ設定 → アカウント → 連携済みアプリ で解除した
 * 2. 推奨設定
 *    - スコープは必要最小限（`profile` + `openid`）。`email` は審査・再同意の原因になりやすい
 *    - 友だち追加プロンプトが不要なら、チャネルの「友だち追加オプション」をオフ／コードで botPrompt を渡さない
 *    - iOS Bundle ID / Android パッケージ: com.taiki.spotto
 *    - iOS / Android URL scheme: line3rdp.com.taiki.spotto
 *    - Web の Callback URL は origin と一致させる
 * 3. セッション
 *    - アプリのログイン状態は Firebase Auth 永続化が本体。起動時は Firebase 復元で自動ログイン
 *    - LINE アクセストークンは SDK（ネイティブ Keychain/SharedPrefs）＋ Web は localStorage バックアップ
 *    - 有効な LINE トークンがあれば `login()` せず Firebase Custom Token 交換のみ行う
 */
import '@/lib/firebaseNativeInit';

import { Platform } from 'react-native';

import type { AuthUser } from '@/lib/auth';
import {
  getApiBaseUrl,
  isApiConnectionError,
  listApiBaseUrlCandidates,
  publicApiUrl,
  readPublicEnv,
} from '@/lib/env';
import {
  authUserFromFirebaseUser,
  loadFirebaseAuthUser,
} from '@/lib/firebaseAuthSession';
import { ensureFirebaseAuthenticatedClaim } from '@/lib/firebaseEnsureClaims';
import { getFirebaseIdToken } from '@/lib/firebaseIdToken';
import {
  ensureNativeFirebaseApp,
  isNativeFirebaseLinked,
} from '@/lib/firebaseNativeInit';
import { SOCIAL_LOGIN_USER_ERRORS } from '@/lib/socialLoginErrors';
import { probeSpottoApiBase } from '@/lib/spottoApiHealth';

export type FirebaseLineSignInResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; cancelled?: boolean };

type FirebaseUserLike = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  providerData?: Array<{ providerId?: string | null }>;
};

type LineAccessTokenLike = {
  accessToken: string;
  expiresIn?: number;
  idToken?: string | null;
};

/** Web SDK が sessionStorage に書くキー。タブを閉じると消えるため localStorage へ複製する */
const WEB_LINE_SESSION_KEY = '@line_sdk/session';
const WEB_LINE_SESSION_BACKUP_KEY = '@spotto/line_sdk_session';

let lineSetupPromise: Promise<void> | null = null;

function lineChannelId() {
  return readPublicEnv('EXPO_PUBLIC_LINE_CHANNEL_ID');
}

function authApiBaseUrl() {
  // AUTH 専用 → API ベース（開発時は LAN 置換、本番はそのまま）
  return (
    publicApiUrl('', 'EXPO_PUBLIC_AUTH_API_URL') || getApiBaseUrl()
  ).replace(/\/$/, '');
}

async function postLineFirebaseExchange(
  apiBase: string,
  params: { accessToken: string; idToken?: string | null },
): Promise<
  | {
      ok: true;
      customToken: string;
      uid: string;
      profile: { name?: string; email?: string; imageUri?: string };
    }
  | { ok: false; error: string; retryable?: boolean }
> {
  const endpoint = `${apiBase.replace(/\/$/, '')}/auth/line-firebase`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accessToken: params.accessToken,
        idToken: params.idToken || undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      customToken?: string;
      uid?: string;
      profile?: { name?: string; email?: string; imageUri?: string };
      error?: string;
      message?: string;
    };
    if (!response.ok || !data.customToken) {
      const isNotFound = response.status === 404;
      console.error('[auth] /auth/line-firebase failed', {
        status: response.status,
        error: data.error || data.message,
        apiBase,
        endpoint,
        hint: isNotFound
          ? 'Render 上の API が古い／別サービスです。server/ を再デプロイし GET /health の service が spotto-api か確認してください。'
          : undefined,
      });
      return {
        ok: false,
        error:
          response.status === 503
            ? '認証サーバーの Firebase Admin 設定を確認してください。'
            : isNotFound
              ? SOCIAL_LOGIN_USER_ERRORS.lineApiMissing
              : SOCIAL_LOGIN_USER_ERRORS.line,
        // 404=別ホスト／未デプロイの可能性 → 他 base を試す / 5xx も再試行
        retryable:
          isNotFound || response.status >= 500 || response.status === 0,
      };
    }
    return {
      ok: true,
      customToken: data.customToken,
      uid: data.uid || '',
      profile: data.profile || {},
    };
  } catch (error) {
    console.error('[auth] /auth/line-firebase network', {
      apiBase,
      endpoint,
      error,
    });
    return {
      ok: false,
      error: SOCIAL_LOGIN_USER_ERRORS.line,
      retryable: isApiConnectionError(error),
    };
  }
}

async function exchangeLineForFirebaseCustomToken(params: {
  accessToken: string;
  idToken?: string | null;
}): Promise<
  | {
      ok: true;
      customToken: string;
      uid: string;
      profile: { name?: string; email?: string; imageUri?: string };
    }
  | { ok: false; error: string }
> {
  const candidates = listApiBaseUrlCandidates(authApiBaseUrl());
  if (candidates.length === 0) {
    if (__DEV__) {
      console.warn(
        '[auth] LINE: 公開 API URL がありません。EXPO_PUBLIC_API_BASE_URL_REMOTE を設定してください。',
      );
    }
    return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.line };
  }

  let lastError = SOCIAL_LOGIN_USER_ERRORS.line;
  for (let i = 0; i < candidates.length; i += 1) {
    const apiBase = candidates[i]!;
    if (__DEV__) {
      console.log('[auth] LINE → Firebase exchange', {
        apiBase,
        attempt: i + 1,
        of: candidates.length,
      });
    }

    // 別サービスの 404 を避けるため、可能なら health で spotto-api を確認
    const probe = await probeSpottoApiBase(apiBase);
    if (!probe.ok) {
      console.warn('[auth] LINE API probe skipped / failed', {
        apiBase,
        reason: probe.reason,
        service: probe.health?.service,
      });
      // probe 失敗でも POST を試し、404 なら次候補へ
      if (probe.reason === 'not-spotto-api') {
        lastError = SOCIAL_LOGIN_USER_ERRORS.lineApiMissing;
        continue;
      }
    }

    const result = await postLineFirebaseExchange(apiBase, params);
    if (result.ok) return result;
    lastError = result.error;
    // 接続失敗・404 のみ次の候補へ（その他 4xx は打ち切り）
    if (!result.retryable) break;
  }

  return { ok: false, error: lastError };
}

function loadLineSdk() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@xmartlabs/react-native-line') as typeof import('@xmartlabs/react-native-line');
}

function loadNativeAuthModular(): {
  getAuth: () => unknown;
  signInWithCustomToken: (
    auth: unknown,
    token: string,
  ) => Promise<{ user: FirebaseUserLike }>;
  updateProfile: (
    user: FirebaseUserLike,
    profile: { displayName?: string; photoURL?: string },
  ) => Promise<void>;
} | null {
  if (Platform.OS === 'web') return null;
  if (!isNativeFirebaseLinked()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-firebase/auth');
  } catch {
    return null;
  }
}

/** Web: sessionStorage ← localStorage から復元（タブ再オープンでもトークン再利用） */
function restoreWebLineSessionFromBackup() {
  if (Platform.OS !== 'web') return;
  try {
    const storage = globalThis.sessionStorage;
    const local = globalThis.localStorage;
    if (!storage || !local) return;
    if (storage.getItem(WEB_LINE_SESSION_KEY)) return;
    const backup = local.getItem(WEB_LINE_SESSION_BACKUP_KEY);
    if (backup) storage.setItem(WEB_LINE_SESSION_KEY, backup);
  } catch {
    // ignore
  }
}

/** Web: SDK セッションを localStorage にバックアップ */
function persistWebLineSessionBackup() {
  if (Platform.OS !== 'web') return;
  try {
    const storage = globalThis.sessionStorage;
    const local = globalThis.localStorage;
    if (!storage || !local) return;
    const raw = storage.getItem(WEB_LINE_SESSION_KEY);
    if (raw) local.setItem(WEB_LINE_SESSION_BACKUP_KEY, raw);
  } catch {
    // ignore
  }
}

function clearWebLineSessionBackup() {
  if (Platform.OS !== 'web') return;
  try {
    globalThis.localStorage?.removeItem(WEB_LINE_SESSION_BACKUP_KEY);
  } catch {
    // ignore
  }
}

/**
 * LineSDK の LoginManager.setup が終わるまで true を返さない。
 * 未設定・失敗時は false。ログアウトやトークン操作はこの後にだけ行う。
 */
export async function ensureLineSdkReady(): Promise<boolean> {
  const channelId = lineChannelId();
  if (!channelId) {
    if (__DEV__) {
      console.warn(
        '[auth] EXPO_PUBLIC_LINE_CHANNEL_ID が未設定です（LINE → Firebase）',
      );
    }
    return false;
  }

  if (!lineSetupPromise) {
    lineSetupPromise = (async () => {
      const Line = loadLineSdk().default;
      await Line.setup({ channelId });
    })().catch((error) => {
      lineSetupPromise = null;
      throw error;
    });
  }

  try {
    await lineSetupPromise;
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] LINE SDK setup', error);
    }
    return false;
  }
}

async function ensureLineSetup(): Promise<FirebaseLineSignInResult | null> {
  const ready = await ensureLineSdkReady();
  if (ready) return null;
  return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.line };
}

function mapLineError(error: unknown): FirebaseLineSignInResult {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error &&
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
        ? String((error as { message: string }).message)
        : String(error || '');
  if (/cancel|キャンセル|user.?cancel/i.test(message)) {
    return {
      ok: false,
      error: SOCIAL_LOGIN_USER_ERRORS.cancelled,
      cancelled: true,
    };
  }
  return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.line };
}

/**
 * 既に SDK が保持しているアクセストークンを検証／リフレッシュして返す。
 * 有効なら認可画面（authorized permissions）を出さずに済む。
 */
async function resolveCachedLineAccessToken(
  Line: typeof import('@xmartlabs/react-native-line').default,
): Promise<LineAccessTokenLike | null> {
  restoreWebLineSessionFromBackup();

  const tryVerifyOrRefresh = async (
    token: LineAccessTokenLike | null,
  ): Promise<LineAccessTokenLike | null> => {
    const access = token?.accessToken?.trim();
    if (!access) return null;
    try {
      await Line.verifyAccessToken();
      persistWebLineSessionBackup();
      return {
        accessToken: access,
        expiresIn: token?.expiresIn,
        idToken: token?.idToken,
      };
    } catch {
      try {
        const refreshed = await Line.refreshAccessToken();
        const next = refreshed?.accessToken?.trim();
        if (!next) return null;
        persistWebLineSessionBackup();
        return {
          accessToken: next,
          expiresIn: refreshed.expiresIn,
          idToken: refreshed.idToken,
        };
      } catch {
        return null;
      }
    }
  };

  try {
    const current = await Line.getCurrentAccessToken();
    const ok = await tryVerifyOrRefresh(current);
    if (ok) {
      if (__DEV__) {
        console.log('[auth] LINE: reused cached access token (no consent UI)');
      }
      return ok;
    }
  } catch {
    // 未ログイン or トークンなし
  }
  return null;
}

async function signInWithCustomTokenCrossPlatform(
  customToken: string,
): Promise<FirebaseUserLike> {
  if (Platform.OS === 'web') {
    const { getAuth, signInWithCustomToken } = await import('firebase/auth');
    const { getFirebaseJsApp, isFirebaseWebConfigured } = await import(
      '@/lib/firebaseApp'
    );
    if (!isFirebaseWebConfigured()) {
      throw new Error('Firebase Web が未設定です');
    }
    const cred = await signInWithCustomToken(
      getAuth(getFirebaseJsApp()),
      customToken,
    );
    return cred.user;
  }

  const ready = await ensureNativeFirebaseApp();
  if (!ready) {
    throw new Error(
      '@react-native-firebase/app の初期化に失敗しました。google-services.json と Dev Client を確認してください。',
    );
  }

  const authMod = loadNativeAuthModular();
  if (!authMod) {
    throw new Error(
      '@react-native-firebase/auth が未リンクです。Dev Client を再ビルドしてください。',
    );
  }
  const cred = await authMod.signInWithCustomToken(
    authMod.getAuth(),
    customToken,
  );
  return cred.user;
}

async function applyLineProfile(
  user: FirebaseUserLike,
  profile: { name?: string; email?: string; imageUri?: string },
) {
  const displayName = profile.name?.trim();
  const photoURL = profile.imageUri?.trim();
  if (!displayName && !photoURL) return user;

  try {
    if (Platform.OS === 'web') {
      const { updateProfile } = await import('firebase/auth');
      await updateProfile(user as never, {
        ...(displayName ? { displayName } : {}),
        ...(photoURL ? { photoURL } : {}),
      });
    } else {
      const authMod = loadNativeAuthModular();
      if (authMod) {
        await authMod.updateProfile(user, {
          ...(displayName ? { displayName } : {}),
          ...(photoURL ? { photoURL } : {}),
        });
      }
    }
    if (displayName) user.displayName = displayName;
    if (photoURL) user.photoURL = photoURL;
  } catch (error) {
    if (__DEV__) console.warn('[auth] LINE updateProfile', error);
  }
  return user;
}

async function completeFirebaseSignInWithLineToken(
  token: LineAccessTokenLike,
): Promise<FirebaseLineSignInResult> {
  const exchanged = await exchangeLineForFirebaseCustomToken({
    accessToken: token.accessToken,
    idToken: token.idToken,
  });
  if (!exchanged.ok) return exchanged;

  const user = await signInWithCustomTokenCrossPlatform(exchanged.customToken);
  await applyLineProfile(user, exchanged.profile);

  await getFirebaseIdToken(true);
  const claimsOk = await ensureFirebaseAuthenticatedClaim();
  if (!claimsOk && __DEV__) {
    console.warn(
      '[auth] LINE: role=authenticated の付与に失敗。ensure-claims / API を確認',
    );
  }
  await getFirebaseIdToken(true);

  if (__DEV__) {
    console.log('[auth] LINE Firebase sign-in ok', {
      uid: user.uid,
      claimsOk,
    });
  }

  return {
    ok: true,
    user: authUserFromFirebaseUser(user, 'line'),
  };
}

/**
 * LINE SDK ログイン → サーバー Custom Token → Firebase Auth → role=authenticated
 *
 * 2回目以降: 有効な LINE アクセストークンがあれば認可 UI を出さず silent に Firebase へ通す。
 */
export async function signInWithLineFirebase(): Promise<FirebaseLineSignInResult> {
  try {
    const setupError = await ensureLineSetup();
    if (setupError) return setupError;

    if (Platform.OS !== 'web' && !loadNativeAuthModular()) {
      if (__DEV__) {
        console.warn(
          '[auth] @react-native-firebase/auth が未リンクです。Dev Client を再ビルドしてください。',
        );
      }
      return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.line };
    }

    // 既に Firebase で LINE ログイン済みなら再認可不要
    const existing = await loadFirebaseAuthUser();
    if (existing?.provider === 'line') {
      if (__DEV__) {
        console.log('[auth] LINE: Firebase session already active');
      }
      return { ok: true, user: existing };
    }

    const lineMod = loadLineSdk();
    const Line = lineMod.default;
    const { Scope } = lineMod;

    const cached = await resolveCachedLineAccessToken(Line);
    if (cached) {
      return completeFirebaseSignInWithLineToken(cached);
    }

    // 初回（またはトークン失効／ユーザー解除後）のみ同意画面へ
    // botPrompt は渡さない（Android 旧 SDK デフォルト normal が毎回許可 UI の原因だった）
    // scopes は初回と同じ最小セットを維持（増やすと再同意が出る）
    //
    // iPad 審査端末には LINE アプリが無いことが多く、アプリ切替ログインが失敗しやすい。
    // iPad は最初から Web ログイン。それ以外はアプリ優先 → 失敗時に Web へフォールバック。
    let loginResult: {
      accessToken: LineAccessTokenLike;
    };
    // iPad 審査端末・LINE 未インストール端末向け: Web ログイン優先。
    // iPhone でもアプリ切替失敗時は Web へフォールバックする。
    const preferWebLogin = Platform.OS === 'ios' && Platform.isPad;
    const login = (onlyWebLogin: boolean) =>
      Line.login({
        scopes: [Scope.Profile, Scope.OpenId],
        onlyWebLogin,
      });
    try {
      loginResult = await login(preferWebLogin);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error || '');
      if (/cancel|キャンセル|user.?cancel|ERR_CANCEL/i.test(message)) {
        console.error('[auth] Line.login', error);
        return mapLineError(error);
      }
      // 既に Web で失敗した場合は同じ手段の再試行を避け、エラーを返す
      if (preferWebLogin) {
        console.error('[auth] Line.login (web)', error);
        return mapLineError(error);
      }
      try {
        await new Promise((resolve) => setTimeout(resolve, 450));
        // ネイティブ失敗時は Web ログインで再試行（LINE 未インストール対策）
        loginResult = await login(true);
      } catch (retryError) {
        console.error('[auth] Line.login', retryError);
        return mapLineError(retryError);
      }
    }

    const accessToken = loginResult.accessToken?.accessToken?.trim();
    if (!accessToken) {
      console.error('[auth] LINE accessToken missing', loginResult);
      return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.line };
    }

    persistWebLineSessionBackup();

    return completeFirebaseSignInWithLineToken({
      accessToken,
      expiresIn: loginResult.accessToken.expiresIn,
      idToken: loginResult.accessToken.idToken,
    });
  } catch (error) {
    console.error('[auth] signInWithLineFirebase', error);
    return mapLineError(error);
  }
}

export function isFirebaseLineAuthReady(): boolean {
  if (!lineChannelId()) return false;
  if (Platform.OS === 'web') return true;
  return Boolean(loadNativeAuthModular());
}

/** ログアウト時に Web バックアップも消す（firebaseAuthSession から呼ぶ） */
export function clearPersistedLineWebSession() {
  clearWebLineSessionBackup();
  if (Platform.OS !== 'web') return;
  try {
    globalThis.sessionStorage?.removeItem(WEB_LINE_SESSION_KEY);
  } catch {
    // ignore
  }
}
