import {
  authenticateSocial,
  isSocialConfigured,
} from '@/lib/socialAuth';
import {
  deleteSecureItem,
  getSecureItem,
  setSecureItem,
} from '@/lib/secureStorage';
import { deleteRemoteSupabaseAccount } from '@/lib/supabaseAccountDeletion';

export type SocialProvider = 'line' | 'google' | 'apple';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  imageUri?: string;
  provider?: SocialProvider | 'email';
};

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; cancelled?: boolean; banned?: boolean };

export type AuthReason =
  | 'join-event'
  | 'send-chat'
  | 'join-club'
  | 'create-event'
  | 'favorite-event'
  | 'watchlist-event'
  | 'mypage';

type StoredAccount = AuthUser & {
  password: string;
};

/** SecureStore 用（`/` `@` 不可）。旧 AsyncStorage キーは移行時に読む */
const SESSION_KEY = 'spotto.auth-session';
const SESSION_LEGACY_KEYS = ['@spotto/auth-session'];
const ACCOUNTS_KEY = 'spotto.auth-accounts';
const ACCOUNTS_LEGACY_KEYS = ['@spotto/auth-accounts'];

export const AUTH_REASON_COPY: Record<
  AuthReason,
  { title: string; body: string }
> = {
  'join-event': {
    title: '参加するにはログイン',
    body: 'イベントへの参加は、ログイン後にそのまま続けられます。',
  },
  'send-chat': {
    title: '送信するにはログイン',
    body: 'チャットの閲覧はゲストでもできます。メッセージを送るにはログインしてください。',
  },
  'join-club': {
    title: 'クラブに参加するにはログイン',
    body: 'ログイン後、このクラブの参加処理を続けます。',
  },
  'create-event': {
    title: '主催するにはログイン',
    body: 'LINE・Google・Apple でログイン後、電話番号認証を経てイベントを作成できます。',
  },
  'favorite-event': {
    title: '保存するにはログイン',
    body: 'お気に入りへの追加は、ログイン後にそのまま続けられます。',
  },
  'watchlist-event': {
    title: '空き通知にはログイン',
    body: '空きが出たときの通知は、ログイン後に設定できます。',
  },
  mypage: {
    title: 'マイページを開くにはログイン',
    body: '参加履歴やお気に入りなど、会員向けの内容を見るにはログインしてください。',
  },
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function readAccounts(): Promise<StoredAccount[]> {
  try {
    const raw = await getSecureItem(ACCOUNTS_KEY, ACCOUNTS_LEGACY_KEYS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredAccount =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as StoredAccount).id === 'string' &&
        typeof (item as StoredAccount).email === 'string' &&
        typeof (item as StoredAccount).name === 'string' &&
        typeof (item as StoredAccount).password === 'string',
    );
  } catch {
    return [];
  }
}

async function writeAccounts(accounts: StoredAccount[]) {
  await setSecureItem(
    ACCOUNTS_KEY,
    JSON.stringify(accounts),
    ACCOUNTS_LEGACY_KEYS,
  );
}

export function toPublicUser(account: StoredAccount): AuthUser {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    imageUri: account.imageUri,
    provider: account.provider,
  };
}

export async function loadAuthSession(): Promise<AuthUser | null> {
  try {
    const raw = await getSecureItem(SESSION_KEY, SESSION_LEGACY_KEYS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.name !== 'string'
    ) {
      return null;
    }
    return {
      id: parsed.id,
      email: parsed.email,
      name: parsed.name,
      imageUri:
        typeof parsed.imageUri === 'string' ? parsed.imageUri : undefined,
      provider:
        parsed.provider === 'line' ||
        parsed.provider === 'google' ||
        parsed.provider === 'apple' ||
        parsed.provider === 'email'
          ? parsed.provider
          : undefined,
    };
  } catch {
    return null;
  }
}

export async function saveAuthSession(user: AuthUser | null) {
  if (!user) {
    await deleteSecureItem(SESSION_KEY, SESSION_LEGACY_KEYS);
    return;
  }
  await setSecureItem(SESSION_KEY, JSON.stringify(user), SESSION_LEGACY_KEYS);
}

export function loginMethodLabel(provider?: AuthUser['provider']) {
  if (provider === 'apple') return 'Apple';
  if (provider === 'google') return 'Google';
  if (provider === 'line') return 'LINE';
  if (provider === 'email') return 'メール（旧）';
  return 'ソーシャルログイン';
}

export async function deleteUserAccount(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = userId.trim();
  if (!id) {
    return { ok: false, error: 'アカウントを確認できませんでした。' };
  }

  // Firebase Auth + DB（profiles / blocks）を削除
  const remote = await deleteRemoteSupabaseAccount();
  if (!remote.ok) return remote;

  // ローカル（デモ用アカウントストア）も掃除
  const accounts = await readAccounts();
  await writeAccounts(accounts.filter((item) => item.id !== id));
  await saveAuthSession(null);
  return { ok: true };
}

export const SOCIAL_PROVIDER_COPY: Record<
  SocialProvider,
  { label: string; name: string; email: string }
> = {
  line: {
    label: 'LINEでログイン',
    name: 'みお',
    email: 'line.user@example.com',
  },
  google: {
    label: 'Googleでログイン',
    name: 'ひかり',
    email: 'google.user@example.com',
  },
  apple: {
    label: 'Appleでサインイン',
    name: 'れん',
    email: 'apple.user@example.com',
  },
};

async function upsertSocialAccount(
  provider: SocialProvider,
  profile: {
    id: string;
    name: string;
    email: string;
    imageUri?: string;
  },
): Promise<{ ok: true; user: AuthUser }> {
  const email = normalizeEmail(profile.email) || `${provider}-${profile.id}@users.spotto.local`;
  const accounts = await readAccounts();
  const socialId = `social-${provider}-${profile.id}`;
  const existing = accounts.find(
    (item) =>
      item.id === socialId ||
      item.email === email ||
      (item.provider === provider && item.id === `social-${provider}`),
  );

  if (existing) {
    const next: StoredAccount = {
      ...existing,
      name: profile.name || existing.name,
      email,
      imageUri: profile.imageUri ?? existing.imageUri,
      provider,
    };
    await writeAccounts(
      accounts.map((item) => (item.id === existing.id ? next : item)),
    );
    return { ok: true, user: toPublicUser(next) };
  }

  const account: StoredAccount = {
    id: socialId,
    email,
    name: profile.name || SOCIAL_PROVIDER_COPY[provider].name,
    imageUri: profile.imageUri,
    password: `social:${provider}:${profile.id}`,
    provider,
  };
  await writeAccounts([...accounts, account]);
  return { ok: true, user: toPublicUser(account) };
}

async function signInWithMockSocial(provider: SocialProvider) {
  const copy = SOCIAL_PROVIDER_COPY[provider];
  return upsertSocialAccount(provider, {
    id: provider,
    name: copy.name,
    email: copy.email,
  });
}

export async function signInWithSocial(
  provider: SocialProvider,
): Promise<AuthResult> {
  if (provider === 'apple') {
    return signInWithMockSocial(provider);
  }

  if (!isSocialConfigured(provider)) {
    if (__DEV__) {
      return signInWithMockSocial(provider);
    }
    return {
      ok: false,
      error:
        provider === 'line'
          ? 'LINE ログインが未設定です。チャネル ID を確認してください。'
          : 'Google ログインが未設定です。クライアント ID を確認してください。',
    };
  }

  const result = await authenticateSocial(provider);
  if (!result.ok) return result;
  return upsertSocialAccount(provider, result.profile);
}
