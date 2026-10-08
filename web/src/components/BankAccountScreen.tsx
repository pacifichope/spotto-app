'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DashboardSkeleton } from '@/components/skeletons';
import { useAuth } from '@/lib/auth-context';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { useT } from '@/lib/i18n/locale-context';
import { mypageHref } from '@/lib/mypageNav';
import {
  EMPTY_BANK,
  SUPPORTED_BANKS,
  fetchBankAccount,
  saveBankAccount,
  validateBank,
  type OrganizerBankAccount,
} from '@/lib/organizerBank';

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#E4EBEE] py-2.5 last:border-b-0">
      <dt className="shrink-0 text-xs font-extrabold text-[#8A9199]">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-extrabold text-[#12202A] break-all">
        {value || '—'}
      </dd>
    </div>
  );
}

export function BankAccountScreen() {
  const { user, ready } = useAuth();
  const t = useT();
  const [account, setAccount] = useState<OrganizerBankAccount>(EMPTY_BANK);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

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
          setError(caught instanceof Error ? caught.message : t('bank.fetchFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, t]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const field =
    'mt-2 h-11 w-full rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-3.5 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35';

  function accountTypeLabel(type: OrganizerBankAccount['accountType']) {
    return type === 'checking' ? t('bank.typeChecking') : t('bank.typeOrdinary');
  }

  function openConfirm() {
    setMessage('');
    setError('');
    const invalid = validateBank(account);
    if (invalid) {
      setError(t(invalid));
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmSave() {
    if (!user || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await saveBankAccount({
        userId: user.uid,
        account,
        getIdToken: async () => idTokenWithAuthenticatedRole(user),
      });
      if (!result.ok) {
        setError(result.error);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      setMessage(t('bank.saved'));
      setToast(t('bank.saved'));
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('bank.title')}</h1>
        <DashboardSkeleton />
      </main>
    );
  }

  return (
    <main className="page-main relative pt-4 md:pt-2">
      {toast ? (
        <div
          role="status"
          className="fixed left-1/2 top-20 z-[90] w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-center text-sm font-extrabold text-[#12B8D0] shadow-[0_16px_40px_rgba(11,26,34,0.18)] backdrop-blur-md"
        >
          {toast}
        </div>
      ) : null}

      <Link
        href={mypageHref({ mode: 'organizer' })}
        className="text-sm font-extrabold text-[#12B8D0]"
      >
        {t('bank.backMypage')}
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{t('bank.title')}</h1>
      <p className="mt-1 text-sm font-bold leading-6 text-[#5B6B75]">{t('bank.subtitle')}</p>

      {!user ? (
        <LoginPromptCard title={t('bank.loginTitle')} />
      ) : loading ? (
        <DashboardSkeleton />
      ) : (
        <form
          className="card-shadow content-fade-in mt-5 space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            openConfirm();
          }}
        >
          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">{t('bank.bankName')}</span>
            <select
              className={field}
              value={account.bankName}
              onChange={(e) => setAccount((prev) => ({ ...prev, bankName: e.target.value }))}
            >
              <option value="">{t('bank.selectPlaceholder')}</option>
              {SUPPORTED_BANKS.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">{t('bank.branchName')}</span>
              <input
                className={field}
                value={account.branchName}
                onChange={(e) => setAccount((prev) => ({ ...prev, branchName: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">{t('bank.branchCode')}</span>
              <input
                className={field}
                value={account.branchNumber}
                onChange={(e) => setAccount((prev) => ({ ...prev, branchNumber: e.target.value }))}
              />
            </label>
          </div>
          <fieldset>
            <legend className="text-xs font-extrabold text-[#5B6B75]">{t('bank.accountType')}</legend>
            <div className="mt-2 flex gap-2">
              {(
                [
                  { id: 'ordinary' as const, label: t('bank.typeOrdinary') },
                  { id: 'checking' as const, label: t('bank.typeChecking') },
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
            <span className="text-xs font-extrabold text-[#5B6B75]">{t('bank.accountNumber')}</span>
            <input
              className={field}
              value={account.accountNumber}
              onChange={(e) => setAccount((prev) => ({ ...prev, accountNumber: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">{t('bank.holderKana')}</span>
            <input
              className={field}
              value={account.accountHolderKana}
              onChange={(e) =>
                setAccount((prev) => ({ ...prev, accountHolderKana: e.target.value }))
              }
              placeholder={t('bank.holderKanaPlaceholder')}
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">{t('bank.notifyEmail')}</span>
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
            {t('bank.save')}
          </button>
        </form>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={t('bank.confirmTitle')}
        description={
          <>
            <p className="mb-3">{t('bank.confirmBody')}</p>
            <dl className="rounded-2xl bg-[#F4F7F8] px-3.5 py-1">
              <SummaryRow label={t('bank.bankName')} value={account.bankName} />
              <SummaryRow label={t('bank.branchName')} value={account.branchName} />
              <SummaryRow label={t('bank.branchCode')} value={account.branchNumber} />
              <SummaryRow
                label={t('bank.accountType')}
                value={accountTypeLabel(account.accountType)}
              />
              <SummaryRow label={t('bank.accountNumber')} value={account.accountNumber} />
              <SummaryRow label={t('bank.holderName')} value={account.accountHolderKana} />
              {account.notifyEmail.trim() ? (
                <SummaryRow label={t('bank.notifyMail')} value={account.notifyEmail} />
              ) : null}
            </dl>
          </>
        }
        cancelLabel={t('common.cancel')}
        confirmLabel={saving ? t('bank.registering') : t('bank.confirm')}
        busy={saving}
        onCancel={() => {
          if (!saving) setConfirmOpen(false);
        }}
        onConfirm={() => void confirmSave()}
      />
    </main>
  );
}
