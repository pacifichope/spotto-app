'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { useAuth } from '@/lib/auth-context';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import {
  EMPTY_BANK,
  SUPPORTED_BANKS,
  fetchBankAccount,
  saveBankAccount,
  type OrganizerBankAccount,
} from '@/lib/organizerBank';

export function BankAccountScreen() {
  const { user, ready } = useAuth();
  const [account, setAccount] = useState<OrganizerBankAccount>(EMPTY_BANK);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setAccount(EMPTY_BANK);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    void fetchBankAccount({
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
    })
      .then((next) => {
        if (!cancelled) setAccount(next || EMPTY_BANK);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : '口座情報の取得に失敗しました');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const field =
    'mt-2 h-11 w-full rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-3.5 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35';

  if (!ready) {
    return (
      <main className="pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">振込口座</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl pt-4 md:pt-2">
      <Link href="/mypage" className="text-sm font-extrabold text-[#12B8D0]">
        ← マイページ
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">振込口座</h1>
      <p className="mt-1 text-sm font-bold leading-6 text-[#5B6B75]">
        売上振込先はご本人名義の口座のみ登録できます。
      </p>

      {!user ? (
        <LoginPromptCard title="ログインして口座を登録" />
      ) : loading ? (
        <p className="mt-6 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      ) : (
        <form
          className="card-shadow mt-5 space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!user || saving) return;
            setSaving(true);
            setMessage('');
            setError('');
            void saveBankAccount({
              userId: user.uid,
              account,
              getIdToken: async () => idTokenWithAuthenticatedRole(user),
            }).then((result) => {
              setSaving(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setMessage('口座情報を保存しました');
            });
          }}
        >
          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">銀行名</span>
            <select
              className={field}
              value={account.bankName}
              onChange={(e) => setAccount((prev) => ({ ...prev, bankName: e.target.value }))}
            >
              <option value="">選択してください</option>
              {SUPPORTED_BANKS.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">支店名</span>
              <input
                className={field}
                value={account.branchName}
                onChange={(e) => setAccount((prev) => ({ ...prev, branchName: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">支店番号</span>
              <input
                className={field}
                value={account.branchNumber}
                onChange={(e) => setAccount((prev) => ({ ...prev, branchNumber: e.target.value }))}
              />
            </label>
          </div>
          <fieldset>
            <legend className="text-xs font-extrabold text-[#5B6B75]">口座種別</legend>
            <div className="mt-2 flex gap-2">
              {(
                [
                  { id: 'ordinary' as const, label: '普通' },
                  { id: 'checking' as const, label: '当座' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAccount((prev) => ({ ...prev, accountType: item.id }))}
                  className={`h-10 flex-1 rounded-full text-sm font-extrabold ${
                    account.accountType === item.id
                      ? 'brand-gradient'
                      : 'bg-[#F4F7F8] text-[#5B6B75]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">口座番号</span>
            <input
              className={field}
              value={account.accountNumber}
              onChange={(e) => setAccount((prev) => ({ ...prev, accountNumber: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">口座名義（カナ）</span>
            <input
              className={field}
              value={account.accountHolderKana}
              onChange={(e) =>
                setAccount((prev) => ({ ...prev, accountHolderKana: e.target.value }))
              }
              placeholder="ヤマダ タロウ"
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">通知用メール（任意）</span>
            <input
              type="email"
              className={field}
              value={account.notifyEmail}
              onChange={(e) => setAccount((prev) => ({ ...prev, notifyEmail: e.target.value }))}
            />
          </label>

          {error ? <p className="text-sm font-bold text-[#EF4444]">{error}</p> : null}
          {message ? <p className="text-sm font-bold text-[#12B8D0]">{message}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="brand-gradient flex h-12 w-full items-center justify-center rounded-full text-sm font-extrabold disabled:opacity-60"
          >
            {saving ? '保存中…' : '保存する'}
          </button>
        </form>
      )}
    </main>
  );
}
