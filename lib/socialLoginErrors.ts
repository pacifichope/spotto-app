import type { SocialProvider } from '@/lib/auth';

/** ユーザー向けログインエラー文言（開発者向け文言はここに置かない） */
export const SOCIAL_LOGIN_USER_ERRORS = {
  apple:
    'Appleサインインに失敗しました。通信状況をご確認のうえ、もう一度お試しください。',
  google:
    'Googleログインに失敗しました。時間をおいてもう一度お試しください。',
  googleConfig:
    'Googleログイン設定エラーです。アプリの署名(SHA-1)とWebクライアントIDを確認してください。',
  line: 'LINEログインに失敗しました。時間をおいてもう一度お試しください。',
  lineApiMissing:
    'LINE認証APIが見つかりません。サーバーの再デプロイが必要です。',
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
  raw?: string | null,
): string {
  const text = String(raw || '');
  if (/キャンセル|cancelled/i.test(text)) {
    return SOCIAL_LOGIN_USER_ERRORS.cancelled;
  }
  if (provider === 'google') {
    if (
      text === SOCIAL_LOGIN_USER_ERRORS.googleConfig ||
      /SHA-1|webクライアント|DEVELOPER_ERROR|設定エラー/i.test(text)
    ) {
      return SOCIAL_LOGIN_USER_ERRORS.googleConfig;
    }
    return SOCIAL_LOGIN_USER_ERRORS.google;
  }
  if (provider === 'line') {
    if (
      text === SOCIAL_LOGIN_USER_ERRORS.lineApiMissing ||
      /再デプロイ|line-firebase|認証APIが見つかりません/i.test(text)
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
