import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { publicApiUrl, readPublicEnv } from '@/lib/env';
import i18n from '@/lib/i18n';
import { SOCIAL_LOGIN_USER_ERRORS } from '@/lib/socialLoginErrors';

WebBrowser.maybeCompleteAuthSession();

export type SocialProfile = {
  id: string;
  name: string;
  email: string;
  imageUri?: string;
};

export type SocialAuthResult =
  | { ok: true; profile: SocialProfile }
  | { ok: false; error: string; cancelled?: boolean };

const APP_SCHEME = 'spotto';
const NATIVE_APP_ID = 'com.taiki.spotto';

const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
};

const LINE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://access.line.me/oauth2/v2.1/authorize',
  tokenEndpoint: 'https://api.line.me/oauth2/v2.1/token',
};

export function googleClientId() {
  if (Platform.OS === 'ios') {
    return (
      readPublicEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID') ||
      readPublicEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID')
    );
  }
  if (Platform.OS === 'android') {
    return (
      readPublicEnv('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID') ||
      readPublicEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID')
    );
  }
  return readPublicEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
}

export function lineChannelId() {
  return readPublicEnv('EXPO_PUBLIC_LINE_CHANNEL_ID');
}

export function authApiBaseUrl() {
  return publicApiUrl('', 'EXPO_PUBLIC_AUTH_API_URL') || publicApiUrl('');
}

export function oauthRedirectUri(nativeOverride?: string) {
  // ネイティブでは makeRedirectUri（localhost / exp://127.0.0.1）を使わない
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return nativeOverride || `${APP_SCHEME}://oauth`;
  }
  return AuthSession.makeRedirectUri({
    scheme: APP_SCHEME,
    path: 'oauth',
    native: nativeOverride,
  });
}

export function googleRedirectUri() {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    // Google iOS クライアントはバンドル ID スキームを要求することがある
    return `${NATIVE_APP_ID}:/oauthredirect`;
  }
  return oauthRedirectUri(`${NATIVE_APP_ID}:/oauthredirect`);
}

export function lineRedirectUri() {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return `${APP_SCHEME}://oauth`;
  }
  return oauthRedirectUri();
}

export function isSocialConfigured(provider: 'line' | 'google' | 'apple') {
  if (provider === 'google') return Boolean(googleClientId());
  if (provider === 'line') return Boolean(lineChannelId());
  return false;
}

function cancelledResult(): SocialAuthResult {
  return { ok: false, error: SOCIAL_LOGIN_USER_ERRORS.cancelled, cancelled: true };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const filler = '='.repeat((4 - (padded.length % 4)) % 4);
    const json =
      typeof globalThis.atob === 'function'
        ? globalThis.atob(padded + filler)
        : '';
    if (!json) return null;
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function googleUserInfo(accessToken: string, idToken?: string) {
  if (idToken) {
    const claims = decodeJwtPayload(idToken);
    const sub = typeof claims?.sub === 'string' ? claims.sub : '';
    const email = typeof claims?.email === 'string' ? claims.email : '';
    const name =
      (typeof claims?.name === 'string' && claims.name) ||
      (typeof claims?.email === 'string' && claims.email) ||
      'Googleユーザー';
    const picture =
      typeof claims?.picture === 'string' ? claims.picture : undefined;
    if (sub) {
      return {
        id: sub,
        name,
        email: email || `google-${sub}@users.spotto.local`,
        imageUri: picture,
      } satisfies SocialProfile;
    }
  }

  const response = await fetch(
    'https://openidconnect.googleapis.com/v1/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(SOCIAL_LOGIN_USER_ERRORS.google);
  }
  const data = (await response.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  const id = data.sub?.trim();
  if (!id) throw new Error(i18n.t('errors.accountNotVerified'));
  return {
    id,
    name: data.name?.trim() || data.email?.trim() || 'Googleユーザー',
    email: data.email?.trim() || `google-${id}@users.spotto.local`,
    imageUri: data.picture?.trim() || undefined,
  } satisfies SocialProfile;
}

async function authenticateGoogle(): Promise<SocialAuthResult> {
  const clientId = googleClientId();
  if (!clientId) {
    return {
      ok: false,
      error: i18n.t('errors.googleNotConfigured'),
    };
  }

  const redirectUri = googleRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { include_granted_scopes: 'true' },
    prompt: AuthSession.Prompt.SelectAccount,
  });

  const result = await request.promptAsync(GOOGLE_DISCOVERY);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return cancelledResult();
  }
  if (result.type !== 'success' || !result.params.code) {
    return {
      ok: false,
      error: SOCIAL_LOGIN_USER_ERRORS.google,
    };
  }

  const tokens = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    GOOGLE_DISCOVERY,
  );

  const profile = await googleUserInfo(
    tokens.accessToken,
    tokens.idToken ?? undefined,
  );
  return { ok: true, profile };
}

async function authenticateLine(): Promise<SocialAuthResult> {
  const channelId = lineChannelId();
  if (!channelId) {
    return {
      ok: false,
      error: i18n.t('errors.lineNotConfigured'),
    };
  }

  const apiBase = authApiBaseUrl();
  if (!apiBase) {
    return {
      ok: false,
      error: SOCIAL_LOGIN_USER_ERRORS.lineApiMissing,
    };
  }

  const redirectUri = lineRedirectUri();
  // email は再同意の原因になりやすいので要求しない（profile + openid のみ）
  // LINE Developers で OpenID を有効にし、Callback URL を登録すること
  const request = new AuthSession.AuthRequest({
    clientId: channelId,
    redirectUri,
    scopes: ['profile', 'openid'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });

  const result = await request.promptAsync(LINE_DISCOVERY);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return cancelledResult();
  }
  if (result.type !== 'success' || !result.params.code) {
    return {
      ok: false,
      error: SOCIAL_LOGIN_USER_ERRORS.line,
    };
  }

  const response = await fetch(`${apiBase.replace(/\/$/, '')}/auth/line-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: result.params.code,
      redirectUri,
      codeVerifier: request.codeVerifier ?? '',
    }),
  });
  if (!response.ok) {
    return {
      ok: false,
      error: SOCIAL_LOGIN_USER_ERRORS.line,
    };
  }
  const data = (await response.json()) as {
    profile?: Partial<SocialProfile>;
  };
  const id = data.profile?.id?.trim();
  const name = data.profile?.name?.trim();
  if (!id || !name) {
    return { ok: false, error: i18n.t('errors.accountNotVerified') };
  }
  return {
    ok: true,
    profile: {
      id,
      name,
      email:
        data.profile?.email?.trim() || `line-${id}@users.spotto.local`,
      imageUri: data.profile?.imageUri?.trim() || undefined,
    },
  };
}

export async function authenticateSocial(
  provider: 'line' | 'google',
): Promise<SocialAuthResult> {
  try {
    if (provider === 'google') return await authenticateGoogle();
    return await authenticateLine();
  } catch (error) {
    if (__DEV__) {
      console.warn('[socialAuth]', provider, error);
    }
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : SOCIAL_LOGIN_USER_ERRORS.generic,
    };
  }
}
