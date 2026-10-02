import type { SocialProvider } from '@/lib/auth';
import i18n from '@/lib/i18n';

const SOCIAL_LOGIN_ERROR_KEYS = [
  'apple',
  'google',
  'googleConfig',
  'line',
  'lineApiMissing',
  'generic',
  'timeout',
  'cancelled',
] as const;

type SocialLoginErrorKey = (typeof SOCIAL_LOGIN_ERROR_KEYS)[number];

/**
 * ユーザー向けログインエラー文言（開発者向け文言はここに置かない）。
 * 各プロパティは参照時に現在の言語で解決される。
 */
export const SOCIAL_LOGIN_USER_ERRORS = Object.defineProperties(
  {} as Readonly<Record<SocialLoginErrorKey, string>>,
  Object.fromEntries(
    SOCIAL_LOGIN_ERROR_KEYS.map((key) => [
      key,
      {
        enumerable: true,
        get: () => i18n.t(`errors.social.${key}`),
      },
    ]),
  ),
);

/**
 * 生エラー（英語・設定ミス案内など）を UI に出さない。
 * 常にプロバイダー別の自然な文言（現在の表示言語）を返す。
 */
export function userFacingSocialLoginError(
  provider: SocialProvider,
  raw?: string | null,
): string {
  const text = String(raw || '');
  if (/キャンセル|cancel/i.test(text)) {
    return SOCIAL_LOGIN_USER_ERRORS.cancelled;
  }
  if (provider === 'google') {
    if (
      text === SOCIAL_LOGIN_USER_ERRORS.googleConfig ||
      /SHA-1|webクライアント|web client|DEVELOPER_ERROR|設定エラー|configuration error/i.test(text)
    ) {
      return SOCIAL_LOGIN_USER_ERRORS.googleConfig;
    }
    return SOCIAL_LOGIN_USER_ERRORS.google;
  }
  if (provider === 'line') {
    if (
      text === SOCIAL_LOGIN_USER_ERRORS.lineApiMissing ||
      /再デプロイ|line-firebase|認証APIが見つかりません|redeploy|auth api not found/i.test(text)
    ) {
      return SOCIAL_LOGIN_USER_ERRORS.lineApiMissing;
    }
    return SOCIAL_LOGIN_USER_ERRORS.line;
  }
  if (provider === 'apple') return SOCIAL_LOGIN_USER_ERRORS.apple;
  return SOCIAL_LOGIN_USER_ERRORS.generic;
}

export function userFacingErrorForIdTokenProvider(
  provider: string,
): string {
  if (provider === 'apple') return SOCIAL_LOGIN_USER_ERRORS.apple;
  if (provider === 'google') return SOCIAL_LOGIN_USER_ERRORS.google;
  if (provider === 'line' || provider.startsWith('custom:')) {
    return SOCIAL_LOGIN_USER_ERRORS.line;
  }
  return SOCIAL_LOGIN_USER_ERRORS.generic;
}

export function isCancelledLoginMessage(message: string): boolean {
  return /cancel|キャンセル/i.test(message);
}
