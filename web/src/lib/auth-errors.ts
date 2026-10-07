/** Firebase / LINE 認証エラーを、設定ミスが分かる日本語に変換する */

export function currentPageHostname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname;
}

export function currentPageOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin.replace(/\/+$/, '');
}

/**
 * 127.0.0.1 や LAN IP だと Firebase 承認済みドメイン / LINE Callback とずれやすい。
 */
export function assertAuthFriendlyOrigin(): void {
  if (typeof window === 'undefined') return;
  const { hostname, port, protocol } = window.location;
  if (hostname === '127.0.0.1') {
    const local = `${protocol}//localhost${port ? `:${port}` : ''}`;
    throw new Error(
      `認証は 127.0.0.1 ではなく ${local} で開いてください。Firebase の承認済みドメインは通常 localhost のみ登録されています。`,
    );
  }
}

export function formatAuthError(error: unknown, fallback = 'ログインに失敗しました'): string {
  const raw =
    error && typeof error === 'object' && 'code' in error && 'message' in error
      ? `${String((error as { code: unknown }).code)} ${(error as { message: unknown }).message}`
      : error instanceof Error
        ? error.message
        : String(error || fallback);

  const host = currentPageHostname();
  const origin = currentPageOrigin();

  if (/auth\/unauthorized-domain/i.test(raw) || /unauthorized-domain/i.test(raw)) {
    return [
      `このドメイン（${host || 'unknown'}）は Firebase の承認済みドメインに含まれていません。`,
      'Firebase Console → Authentication → Settings → Authorized domains に、',
      `ホスト名だけを追加してください（例: ${host || 'your-app.vercel.app'}）。`,
      'https:// やパスは付けないでください。',
      'ローカルなら localhost（127.0.0.1 や LAN IP ではない）でアクセスしてください。',
    ].join('');
  }

  if (/invalid redirect_uri|redirect_uri/i.test(raw)) {
    return [
      'LINE の redirect_uri が LINE Developers の Callback URL と一致しません。',
      `現在のオリジン: ${origin || '(unknown)'}。`,
      '登録する URL は Supabase の /auth/v1/callback ではなく、',
      `${origin || 'https://あなたのドメイン'}/auth/line/callback です。`,
      'NEXT_PUBLIC_LINE_REDIRECT_URI または NEXT_PUBLIC_SITE_URL も確認してください。',
    ].join('');
  }

  if (/popup-closed-by-user|cancelled|canceled/i.test(raw)) {
    return 'ログインがキャンセルされました';
  }

  return raw || fallback;
}
