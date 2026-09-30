import type { SocialProvider } from '@/lib/auth';

/** ユーザー向けログインエラー文言（開発者向け文言はここに置かない） */
export const SOCIAL_LOGIN_USER_ERRORS = {
  apple:
    'Appleサインインに失敗しました。通信状況をご確認のうえ、もう一度お試しください。',
  google:
    'Googleログインに失敗しました。時間をおいてもう一度お試しください。',
  line: 'LINEログインに失敗しました。時間をおいてもう一度お試しください。',
  generic: 'ログインに失敗しました。時間をおいてもう一度お試しください。',
  timeout: '認証がタイムアウトしました。時間をおいてもう一度お試しください。',
  cancelled: 'ログインがキャンセルされました。',
} as const;

/**
 * 生エラー（英語・設定ミス案内など）を UI に出さない。
 * 常にプロバイダー別の自然な日本語を返す。
 */
export function userFacingSocialLoginError(
  provider: SocialProvider,
  _raw?: string | null,
): string {
  if (provider === 'apple') return SOCIAL_LOGIN_USER_ERRORS.apple;
  if (provider === 'google') return SOCIAL_LOGIN_USER_ERRORS.google;
  if (provider === 'line') return SOCIAL_LOGIN_USER_ERRORS.line;
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
