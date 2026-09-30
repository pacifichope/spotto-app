import { resolveAuthUserId } from '@/lib/eventsRemote';
import { ensureFirebaseAuthenticatedClaim } from '@/lib/firebaseEnsureClaims';
import {
  firebaseJwtHasAuthenticatedRole,
  getFirebaseIdToken,
  peekFirebaseJwtClaims,
} from '@/lib/firebaseIdToken';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type BankAccountType = 'ordinary' | 'checking';

/** 振込対応の主要銀行（選択式・メガバンク／ゆうちょを先頭） */
export const SUPPORTED_BANKS = [
  // メガバンク・ゆうちょ・りそな
  'ゆうちょ銀行',
  '三菱UFJ銀行',
  '三井住友銀行',
  'みずほ銀行',
  'りそな銀行',
  '埼玉りそな銀行',
  '関西みらい銀行',
  // ネット銀行
  '楽天銀行',
  '住信SBIネット銀行',
  'PayPay銀行',
  'auじぶん銀行',
  'セブン銀行',
  'イオン銀行',
  'ソニー銀行',
  'GMOあおぞらネット銀行',
  'UI銀行',
  // 地方銀行（主要）
  '横浜銀行',
  '千葉銀行',
  '静岡銀行',
  '福岡銀行',
  '北海道銀行',
  '北洋銀行',
  '常陽銀行',
  '群馬銀行',
  '武蔵野銀行',
  '八十二銀行',
  '十六銀行',
  '名古屋銀行',
  '京都銀行',
  '池田泉州銀行',
  '南都銀行',
  '紀陽銀行',
  '広島銀行',
  '中国銀行',
  '伊予銀行',
  '西日本シティ銀行',
  '肥後銀行',
  '鹿児島銀行',
  '沖縄銀行',
] as const;


export type SupportedBankName = (typeof SUPPORTED_BANKS)[number];

export type OrganizerBankAccount = {
  bankName: string;
  branchName: string;
  branchNumber: string;
  accountType: BankAccountType;
  accountNumber: string;
  accountHolderKana: string;
  /** 振込完了メール等の通知先 */
  notifyEmail: string;
  updatedAt?: string;
};

export const EMPTY_BANK_ACCOUNT: OrganizerBankAccount = {
  bankName: '',
  branchName: '',
  branchNumber: '',
  accountType: 'ordinary',
  accountNumber: '',
  accountHolderKana: '',
  notifyEmail: '',
};

export const BANK_ACCOUNT_TYPE_OPTIONS: {
  value: BankAccountType;
  label: string;
}[] = [
  { value: 'ordinary', label: '普通' },
  { value: 'checking', label: '当座' },
];

type RemoteRow = {
  user_id?: string | null;
  bank_name?: string | null;
  branch_name?: string | null;
  branch_number?: string | null;
  account_type?: string | null;
  account_number?: string | null;
  account_holder_kana?: string | null;
  notify_email?: string | null;
  updated_at?: string | null;
};

export type BankAccountResult =
  | { ok: true; account: OrganizerBankAccount | null }
  | { ok: false; error: string };

export type BankAccountSaveResult =
  | { ok: true; account: OrganizerBankAccount }
  | { ok: false; error: string };

export function isSupportedBankName(value: string): value is SupportedBankName {
  return (SUPPORTED_BANKS as readonly string[]).includes(value.trim());
}

/** 全角カナ・半角カナ・長音・中点・スペースのみ */
export function isAccountHolderKana(value: string) {
  return /^[\u30A0-\u30FF\uFF65-\uFF9F\u30FC\u30FB\s　]+$/.test(value.trim());
}

/** 半角数字のみ・最大7桁 */
export function normalizeAccountNumber(value: string) {
  return value.replace(/[^\d]/g, '').slice(0, 7);
}

/** 半角数字のみ・最大3桁（支店番号） */
export function normalizeBranchNumber(value: string) {
  return value.replace(/[^\d]/g, '').slice(0, 3);
}

export function normalizeHolderKana(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60),
    )
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function maskAccountNumber(accountNumber: string) {
  const digits = normalizeAccountNumber(accountNumber);
  if (digits.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function normalizeNotifyEmail(value: string) {
  return value.trim().toLowerCase();
}

/** 簡易メール形式チェック */
export function isValidNotifyEmail(value: string) {
  const email = normalizeNotifyEmail(value);
  if (!email || email.length > 254) return false;
  return /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email);
}

export function accountTypeLabel(type: BankAccountType) {
  return type === 'checking' ? '当座' : '普通';
}

export function validateOrganizerBankAccount(
  input: OrganizerBankAccount,
): { ok: true; account: OrganizerBankAccount } | { ok: false; error: string } {
  const bankName = input.bankName.trim();
  const branchName = input.branchName.trim();
  const branchNumber = normalizeBranchNumber(input.branchNumber);
  const accountNumber = normalizeAccountNumber(input.accountNumber);
  const accountHolderKana = normalizeHolderKana(input.accountHolderKana);
  const notifyEmail = normalizeNotifyEmail(input.notifyEmail || '');
  const accountType: BankAccountType =
    input.accountType === 'checking' ? 'checking' : 'ordinary';

  if (!bankName) {
    return { ok: false, error: '銀行をリストから選択してください。' };
  }
  if (!isSupportedBankName(bankName)) {
    return {
      ok: false,
      error: '対応銀行リストから銀行を選択してください。',
    };
  }
  if (!branchName) return { ok: false, error: '支店名を入力してください。' };
  if (branchName.length > 80) {
    return { ok: false, error: '支店名が長すぎます。' };
  }
  if (!/^[0-9]{3}$/.test(branchNumber)) {
    return {
      ok: false,
      error: '支店番号は半角数字3桁で入力してください。',
    };
  }
  if (!/^[0-9]{7}$/.test(accountNumber)) {
    return {
      ok: false,
      error: '口座番号は半角数字7桁で入力してください。',
    };
  }
  if (!accountHolderKana) {
    return { ok: false, error: '口座名義（カタカナ）を入力してください。' };
  }
  if (!isAccountHolderKana(accountHolderKana)) {
    return {
      ok: false,
      error: '口座名義はカタカナで入力してください。',
    };
  }
  if (accountHolderKana.length > 80) {
    return { ok: false, error: '口座名義が長すぎます。' };
  }
  if (!notifyEmail) {
    return {
      ok: false,
      error: '通知用メールアドレスを入力してください。',
    };
  }
  if (!isValidNotifyEmail(notifyEmail)) {
    return {
      ok: false,
      error: '通知用メールアドレスの形式が正しくありません。',
    };
  }

  return {
    ok: true,
    account: {
      bankName,
      branchName,
      branchNumber,
      accountType,
      accountNumber,
      accountHolderKana,
      notifyEmail,
    },
  };
}

function rowToAccount(row: RemoteRow): OrganizerBankAccount {
  return {
    bankName: String(row.bank_name || '').trim(),
    branchName: String(row.branch_name || '').trim(),
    branchNumber: normalizeBranchNumber(String(row.branch_number || '')),
    accountType: row.account_type === 'checking' ? 'checking' : 'ordinary',
    accountNumber: normalizeAccountNumber(String(row.account_number || '')),
    accountHolderKana: String(row.account_holder_kana || '').trim(),
    notifyEmail: normalizeNotifyEmail(String(row.notify_email || '')),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function formatBankRemoteError(message: string | undefined, fallback: string) {
  const raw = String(message || '').trim() || fallback;
  if (/not authenticated|P0001/i.test(raw)) {
    return (
      `${raw}\n\n` +
      '口座 owner トリガーが auth.uid() のままの可能性があります。' +
      ' SQL: supabase/apply_organizer_bank_firebase_rls.sql を適用してください。'
    );
  }
  if (/row level security|rls/i.test(raw)) {
    return (
      `${raw}\n\n` +
      'user_id が JWT sub と一致しているか、RLS が requesting_user_id() を使っているか確認してください。' +
      ' SQL: supabase/apply_organizer_bank_firebase_rls.sql'
    );
  }
  if (/permission denied|42501/i.test(raw)) {
    return (
      `${raw}\n\n` +
      'JWT に role: "authenticated" が必要です。ensure-claims を確認してください。'
    );
  }
  return raw;
}

async function requireSessionUserId(expectedAppUserId?: string): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'データベースが未設定です。' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'データベースに接続できません。' };

  await ensureFirebaseAuthenticatedClaim();
  const token = await getFirebaseIdToken(false);
  const claims = token ? peekFirebaseJwtClaims(token) : null;
  const jwtUid =
    typeof claims?.sub === 'string' && claims.sub.trim()
      ? claims.sub.trim()
      : null;
  const userId = jwtUid || (await resolveAuthUserId());

  if (!userId) {
    return {
      ok: false,
      error: 'ログインセッションを確認できません。再度ログインしてください。',
    };
  }
  if (!token || !firebaseJwtHasAuthenticatedRole(token)) {
    return {
      ok: false,
      error:
        '認証トークンに role: "authenticated" がありません。API（ensure-claims）を確認してください。',
    };
  }
  if (
    expectedAppUserId &&
    expectedAppUserId.trim() &&
    expectedAppUserId.trim() !== userId
  ) {
    return {
      ok: false,
      error:
        'アカウント情報が一致しません。ログアウト後、もう一度ログインしてからお試しください。',
    };
  }
  return { ok: true, userId };
}

const SELECT_COLUMNS =
  'user_id, bank_name, branch_name, branch_number, account_type, account_number, account_holder_kana, notify_email, updated_at';

export async function fetchOrganizerBankAccount(
  expectedAppUserId?: string,
): Promise<BankAccountResult> {
  const auth = await requireSessionUserId(expectedAppUserId);
  if (!auth.ok) return auth;

  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'データベースに接続できません。' };

  const { data, error } = await client
    .from('organizer_bank_accounts')
    .select(SELECT_COLUMNS)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error) {
    if (__DEV__) console.warn('[bank] fetch failed', error);
    if (
      error.message.includes('notify_email') ||
      error.message.includes('branch_number') ||
      error.code === '42703'
    ) {
      const legacySelect = error.message.includes('notify_email')
        ? 'user_id, bank_name, branch_name, branch_number, account_type, account_number, account_holder_kana, updated_at'
        : 'user_id, bank_name, branch_name, account_type, account_number, account_holder_kana, updated_at';
      const legacy = await client
        .from('organizer_bank_accounts')
        .select(legacySelect)
        .eq('user_id', auth.userId)
        .maybeSingle();
      if (legacy.error) {
        return {
          ok: false,
          error: legacy.error.message || '口座情報を取得できませんでした。',
        };
      }
      if (!legacy.data) return { ok: true, account: null };
      return {
        ok: true,
        account: rowToAccount({
          ...(legacy.data as RemoteRow),
          branch_number:
            (legacy.data as RemoteRow).branch_number ?? '',
          notify_email: '',
        }),
      };
    }
    return {
      ok: false,
      error:
        error.message.includes('schema cache') || error.code === 'PGRST205'
          ? '口座テーブルが未作成です。運営に連絡するか、マイグレーションを適用してください。'
          : error.message || '口座情報を取得できませんでした。',
    };
  }
  if (!data) return { ok: true, account: null };

  const row = data as RemoteRow;
  if (row.user_id && row.user_id !== auth.userId) {
    return { ok: false, error: '口座情報の所有者を確認できませんでした。' };
  }
  return { ok: true, account: rowToAccount(row) };
}

export async function saveOrganizerBankAccount(
  input: OrganizerBankAccount,
  expectedAppUserId?: string,
): Promise<BankAccountSaveResult> {
  const auth = await requireSessionUserId(expectedAppUserId);
  if (!auth.ok) return auth;

  const validated = validateOrganizerBankAccount(input);
  if (!validated.ok) return validated;

  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'データベースに接続できません。' };

  const now = new Date().toISOString();
  const payload = {
    user_id: auth.userId,
    bank_name: validated.account.bankName,
    branch_name: validated.account.branchName,
    branch_number: validated.account.branchNumber,
    account_type: validated.account.accountType,
    account_number: validated.account.accountNumber,
    account_holder_kana: validated.account.accountHolderKana,
    notify_email: validated.account.notifyEmail,
    updated_at: now,
  };

  const { data, error } = await client
    .from('organizer_bank_accounts')
    .upsert(payload, { onConflict: 'user_id' })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    if (__DEV__) {
      console.warn('[bank] save failed', {
        code: error?.code,
        message: error?.message,
        userId: auth.userId,
      });
    }
    if (
      error?.message.includes('notify_email') ||
      error?.code === '42703'
    ) {
      return {
        ok: false,
        error:
          '通知用メール列が未作成です。supabase/apply_organizer_bank_notify_email.sql を適用してください。',
      };
    }
    return {
      ok: false,
      error: formatBankRemoteError(
        error?.message.includes('schema cache') || error?.code === 'PGRST205'
          ? '口座テーブルが未作成です。運営に連絡するか、マイグレーションを適用してください。'
          : error?.message,
        '口座情報を保存できませんでした。',
      ),
    };
  }

  const row = data as RemoteRow;
  if (row.user_id && row.user_id !== auth.userId) {
    return { ok: false, error: '口座情報の所有者を確認できませんでした。' };
  }
  return { ok: true, account: rowToAccount(row) };
}

export async function deleteOrganizerBankAccount(
  expectedAppUserId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireSessionUserId(expectedAppUserId);
  if (!auth.ok) return auth;

  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'データベースに接続できません。' };

  const { error } = await client
    .from('organizer_bank_accounts')
    .delete()
    .eq('user_id', auth.userId);

  if (error) {
    return { ok: false, error: error.message || '削除に失敗しました。' };
  }
  return { ok: true };
}
