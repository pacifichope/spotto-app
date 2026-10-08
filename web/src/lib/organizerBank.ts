import { createAuthedSupabase } from '@/lib/supabase';

export type BankAccountType = 'ordinary' | 'checking';

export type OrganizerBankAccount = {
  bankName: string;
  branchName: string;
  branchNumber: string;
  accountType: BankAccountType;
  accountNumber: string;
  accountHolderKana: string;
  notifyEmail: string;
};

export const EMPTY_BANK: OrganizerBankAccount = {
  bankName: '',
  branchName: '',
  branchNumber: '',
  accountType: 'ordinary',
  accountNumber: '',
  accountHolderKana: '',
  notifyEmail: '',
};

export const SUPPORTED_BANKS = [
  'ゆうちょ銀行',
  '三菱UFJ銀行',
  '三井住友銀行',
  'みずほ銀行',
  'りそな銀行',
  '楽天銀行',
  '住信SBIネット銀行',
  'PayPay銀行',
  'auじぶん銀行',
  '横浜銀行',
  '千葉銀行',
  '静岡銀行',
  '福岡銀行',
] as const;

export function validateBank(account: OrganizerBankAccount): string | null {
  if (!account.bankName.trim()) return '銀行名を選択してください';
  if (!account.branchName.trim()) return '支店名を入力してください';
  if (!/^\d{3}$/.test(account.branchNumber.trim()) && account.bankName !== 'ゆうちょ銀行') {
    // ゆうちょは形式が異なることがあるので支店番号は緩く
    if (!account.branchNumber.trim()) return '支店番号を入力してください';
  }
  if (!/^\d{4,8}$/.test(account.accountNumber.trim())) {
    return '口座番号を正しく入力してください';
  }
  if (!account.accountHolderKana.trim()) return '口座名義（カナ）を入力してください';
  if (account.notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.notifyEmail)) {
    return '通知用メールの形式が正しくありません';
  }
  return null;
}

export async function fetchBankAccount(input: {
  getIdToken: () => Promise<string | null>;
  userId: string;
}): Promise<OrganizerBankAccount | null> {
  const supabase = createAuthedSupabase(input.getIdToken);
  const { data, error } = await supabase
    .from('organizer_bank_accounts')
    .select(
      'bank_name, branch_name, branch_number, account_type, account_number, account_holder_kana, notify_email',
    )
    .eq('user_id', input.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    bankName: String((data as { bank_name?: string }).bank_name ?? ''),
    branchName: String((data as { branch_name?: string }).branch_name ?? ''),
    branchNumber: String((data as { branch_number?: string }).branch_number ?? ''),
    accountType:
      (data as { account_type?: string }).account_type === 'checking'
        ? 'checking'
        : 'ordinary',
    accountNumber: String((data as { account_number?: string }).account_number ?? ''),
    accountHolderKana: String(
      (data as { account_holder_kana?: string }).account_holder_kana ?? '',
    ),
    notifyEmail: String((data as { notify_email?: string }).notify_email ?? ''),
  };
}

export async function saveBankAccount(input: {
  getIdToken: () => Promise<string | null>;
  userId: string;
  account: OrganizerBankAccount;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const invalid = validateBank(input.account);
  if (invalid) return { ok: false, error: invalid };
  const supabase = createAuthedSupabase(input.getIdToken);
  const { error } = await supabase.from('organizer_bank_accounts').upsert(
    {
      user_id: input.userId,
      bank_name: input.account.bankName.trim(),
      branch_name: input.account.branchName.trim(),
      branch_number: input.account.branchNumber.trim(),
      account_type: input.account.accountType,
      account_number: input.account.accountNumber.trim(),
      account_holder_kana: input.account.accountHolderKana.trim(),
      notify_email: input.account.notifyEmail.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
