import i18n from '@/lib/i18n';
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

const AUTH_REASON_KEYS: Record<AuthReason, string> = {
  'join-event': 'joinEvent',
  'send-chat': 'sendChat',
  'join-club': 'joinClub',
  'create-event': 'createEvent',
  'favorite-event': 'favoriteEvent',
  'watchlist-event': 'watchlistEvent',
  mypage: 'mypage',
};

/** ログイン促しの文言（呼び出し時に現在の言語で解決） */
export function getAuthReasonCopy(reason: AuthReason): {
  title: string;
  body: string;
} {
  const key = AUTH_REASON_KEYS[reason];
  return {
    title: i18n.t(`auth.reason.${key}.title`),
    body: i18n.t(`auth.reason.${key}.body`),
  };
}

function authReasonEntry(reason: AuthReason) {
  return {
    get title() {
      return getAuthReasonCopy(reason).title;
    },
    get body() {
      return getAuthReasonCopy(reason).body;
    },
  };
}

/** 互換用: アクセス時に現在の言語で解決されるゲッター付きオブジェクト */
export const AUTH_REASON_COPY: Record<
  AuthReason,
  { title: string; body: string }
> = {
  'join-event': authReasonEntry('join-event'),
  'send-chat': authReasonEntry('send-chat'),
  'join-club': authReasonEntry('join-club'),
  'create-event': authReasonEntry('create-event'),
  'favorite-event': authReasonEntry('favorite-event'),
  'watchlist-event': authReasonEntry('watchlist-event'),
  mypage: authReasonEntry('mypage'),
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
  if (provider === 'apple') return i18n.t('auth.loginMethod.apple');
  if (provider === 'google') return i18n.t('auth.loginMethod.google');
  if (provider === 'line') return i18n.t('auth.loginMethod.line');
  if (provider === 'email') return i18n.t('auth.loginMethod.email');
  return i18n.t('auth.loginMethod.social');
}

export async function deleteUserAccount(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = userId.trim();
  if (!id) {
    return { ok: false, error: i18n.t('errors.accountNotVerified') };
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

/**
 * `label` は参照時に現在の言語で解決されるゲッター。
 * `name` / `email` は開発用モックアカウントの値（翻訳対象外）。
 */
export const SOCIAL_PROVIDER_COPY: Record<
  SocialProvider,
  { readonly label: string; name: string; email: string }
> = {
  line: {
    get label() {
      return i18n.t('auth.social.line');
    },
    name: 'みお',
    email: 'line.user@example.com',
  },
  google: {
    get label() {
      return i18n.t('auth.social.google');
    },
    name: 'ひかり',
    email: 'google.user@example.com',
  },
  apple: {
    get label() {
      return i18n.t('auth.social.apple');
    },
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
          ? i18n.t('errors.lineNotConfigured')
          : i18n.t('errors.googleNotConfigured'),
    };
  }

  const result = await authenticateSocial(provider);
  if (!result.ok) return result;
  return upsertSocialAccount(provider, result.profile);
}
