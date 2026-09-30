import { Linking, Platform, Share } from 'react-native';

import type { AuthUser } from '@/lib/auth';
import { publicApiUrl, readPublicEnv } from '@/lib/env';
import { APP_DISPLAY_NAME, getAppVersion } from '@/lib/settings';

export const CONTACT_CATEGORIES = [
  '不具合の報告',
  'アカウントについて',
  'イベント・決済について',
  'その他',
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const MAX_CONTACT_IMAGES = 4;

/** mailto URL が端末で拒否されないよう本文を抑える（バイト換算の目安） */
const MAX_MAILTO_BODY_CHARS = 1800;

export type ContactPayload = {
  name: string;
  /** 運営からの返信用メール（ユーザー入力。ログイン時も編集可） */
  email: string;
  category: ContactCategory;
  message: string;
  userId?: string;
  /** ログイン済みなら true（サーバーでも JWT で再検証） */
  authenticated?: boolean;
  imageUris?: string[];
};

/**
 * ログイン中はユーザーIDを紐付け。返信用メールは入力値をそのまま使う。
 */
export function bindContactIdentity(
  user: AuthUser | null | undefined,
  draft: { name: string; email: string },
): Pick<ContactPayload, 'name' | 'email' | 'userId' | 'authenticated'> {
  if (user?.id) {
    return {
      name: draft.name.trim() || user.name.trim() || '未入力',
      email: draft.email.trim(),
      userId: user.id,
      authenticated: true,
    };
  }
  return {
    name: draft.name.trim(),
    email: draft.email.trim(),
    userId: undefined,
    authenticated: false,
  };
}

export function sanitizeContactImageUris(uris: unknown): string[] {
  if (!Array.isArray(uris)) return [];
  const next: string[] = [];
  for (const item of uris) {
    if (typeof item !== 'string') continue;
    const uri = item.trim();
    if (!uri || uri.length > 2000) continue;
    if (next.includes(uri)) continue;
    next.push(uri);
    if (next.length >= MAX_CONTACT_IMAGES) break;
  }
  return next;
}

export function supportEmail() {
  return readPublicEnv('EXPO_PUBLIC_SUPPORT_EMAIL') || 'support@spotto.fun';
}

export function contactApiUrl() {
  return publicApiUrl('/contact', 'EXPO_PUBLIC_CONTACT_API_URL');
}

export function isValidContactEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

function isHttpImageUri(uri: string) {
  return /^https?:\/\//i.test(uri.trim());
}

function imageLines(uris: string[] | undefined) {
  const images = sanitizeContactImageUris(uris);
  if (images.length === 0) return [];
  const links = images.filter(isHttpImageUri);
  if (links.length === 0) {
    return [
      '添付画像: メールアプリ経由では画像を送れません。フォーム送信をご利用ください。',
      '',
    ];
  }
  return ['添付画像:', ...links, ''];
}

function identityLines(payload: ContactPayload) {
  const authenticated = Boolean(payload.authenticated && payload.userId);
  return [
    `お名前: ${payload.name.trim() || '未入力'}`,
    `返信用メール: ${payload.email.trim() || '未入力'}`,
    `ユーザーID: ${payload.userId || 'guest'}`,
    `本人確認: ${authenticated ? 'ログイン済み' : 'ゲスト'}`,
  ];
}

function contactPlainBody(payload: ContactPayload) {
  return [
    payload.message.trim(),
    '',
    ...imageLines(payload.imageUris),
    '---',
    ...identityLines(payload),
    `端末: ${Platform.OS}`,
    `アプリ: ${APP_DISPLAY_NAME} v${getAppVersion()}`,
  ].join('\n');
}

function mailtoHref(payload: ContactPayload) {
  const subject = encodeURIComponent(
    `【${APP_DISPLAY_NAME}】${payload.category}`,
  );
  let bodyText = contactPlainBody(payload);
  if (bodyText.length > MAX_MAILTO_BODY_CHARS) {
    bodyText = `${bodyText.slice(0, MAX_MAILTO_BODY_CHARS)}\n\n…(以下省略)`;
  }
  const body = encodeURIComponent(bodyText);
  return `mailto:${supportEmail()}?subject=${subject}&body=${body}`;
}

async function openMailto(href: string) {
  // Android 11+ では canOpenURL('mailto:...') が false になりやすいので判定しない
  await Linking.openURL(href);
}

async function shareContactFallback(payload: ContactPayload) {
  const subject = `【${APP_DISPLAY_NAME}】${payload.category}`;
  const message = [
    `宛先: ${supportEmail()}`,
    `件名: ${subject}`,
    '',
    contactPlainBody(payload),
  ].join('\n');
  const result = await Share.share(
    Platform.OS === 'ios'
      ? { subject, message }
      : { title: subject, message },
  );
  if (result.action === Share.dismissedAction) {
    throw new Error('share_dismissed');
  }
}

export async function openSupportMail(payload: ContactPayload) {
  const href = mailtoHref(payload);
  try {
    await openMailto(href);
    return;
  } catch (mailtoError) {
    if (__DEV__) {
      console.warn('[spotto contact] mailto failed, trying Share', mailtoError);
    }
  }

  try {
    await shareContactFallback(payload);
  } catch (shareError) {
    if (
      shareError instanceof Error &&
      shareError.message === 'share_dismissed'
    ) {
      throw new Error(
        `共有がキャンセルされました。${supportEmail()} 宛に直接ご連絡ください。`,
      );
    }
    throw new Error(
      `メールアプリを開けませんでした。${supportEmail()} 宛に直接ご連絡ください。`,
    );
  }
}

async function currentAccessToken() {
  try {
    const { getCurrentFirebaseAccessToken } = await import('@/lib/currentUser');
    return (await getCurrentFirebaseAccessToken(false))?.trim() || '';
  } catch {
    return '';
  }
}

export async function submitContact(
  payload: ContactPayload,
): Promise<{ ok: true; channel: 'api' | 'mailto' } | { ok: false; error: string }> {
  const name = payload.name.trim();
  const email = payload.email.trim();
  const message = payload.message.trim();
  const authenticated = Boolean(payload.authenticated && payload.userId);
  if (!email) {
    return { ok: false, error: '返信用メールアドレスを入力してください。' };
  }
  if (!isValidContactEmail(email)) {
    return { ok: false, error: 'メールアドレスの形式が正しくありません。' };
  }
  if (!message) {
    return { ok: false, error: 'お問い合わせ内容を入力してください。' };
  }
  if (message.length < 10) {
    return {
      ok: false,
      error: '内容は10文字以上で入力してください。',
    };
  }

  const imageUris = sanitizeContactImageUris(payload.imageUris);
  const normalized: ContactPayload = {
    ...payload,
    name,
    email,
    message,
    imageUris,
    authenticated,
    userId: authenticated ? payload.userId : undefined,
  };

  const url = contactApiUrl();
  let apiErrorDetail = '';
  if (url) {
    try {
      const accessToken = await currentAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...normalized,
          platform: Platform.OS,
          appVersion: getAppVersion(),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return { ok: true, channel: 'api' };
    } catch (error) {
      apiErrorDetail =
        error instanceof Error ? error.message : 'network error';
      if (__DEV__) {
        console.warn('[spotto contact] API failed, falling back to mailto', {
          url,
          error,
        });
      }
    }
  }

  try {
    await openSupportMail(normalized);
    return { ok: true, channel: 'mailto' };
  } catch (mailError) {
    const mailMsg =
      mailError instanceof Error ? mailError.message : '';
    const hint =
      mailMsg ||
      `送信できませんでした。通信環境を確認するか、${supportEmail()} へ直接メールしてください。`;
    return {
      ok: false,
      error:
        hint +
        (apiErrorDetail && __DEV__ ? `（API: ${apiErrorDetail}）` : ''),
    };
  }
}
