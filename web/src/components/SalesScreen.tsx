'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { useAuth } from '@/lib/auth-context';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import {
  fetchSalesSummary,
  formatYen,
  type SalesSummary,
} from '@/lib/organizerSales';

export function SalesScreen() {
  const { user, ready } = useAuth();
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    void fetchSalesSummary({
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
    })
      .then((next) => {
        if (!cancelled) setSummary(next);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : '売上の取得に失敗しました');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!ready) {
    return (
      <main className="pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">売上</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl pt-4 md:pt-2">
      <Link href="/mypage" className="text-sm font-extrabold text-[#12B8D0]">
        ← マイページ
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">売上</h1>
      <p className="mt-1 text-sm font-bold text-[#5B6B75]">
        当月のチケット売上と手数料内訳です。
      </p>

      {!user ? (
        <LoginPromptCard title="ログインして売上を確認" />
      ) : loading ? (
        <p className="mt-6 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      ) : error ? (
        <p className="mt-6 text-sm font-bold text-[#EF4444]">{error}</p>
      ) : summary ? (
        <>
          <section className="card-shadow mt-5 p-5">
            <p className="text-xs font-extrabold text-[#8A9199]">{summary.periodLabel}</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#12B8D0]">
              {formatYen(summary.netYen)}
            </p>
            <p className="mt-1 text-sm font-bold text-[#5B6B75]">振込見込み（手数料控除後）</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-[#F4F7F8] p-3">
                <dt className="text-xs font-extrabold text-[#8A9199]">売上合計</dt>
                <dd className="mt-1 font-extrabold">{formatYen(summary.grossYen)}</dd>
              </div>
              <div className="rounded-2xl bg-[#F4F7F8] p-3">
                <dt className="text-xs font-extrabold text-[#8A9199]">件数</dt>
                <dd className="mt-1 font-extrabold">{summary.ticketCount}件</dd>
              </div>
              <div className="rounded-2xl bg-[#F4F7F8] p-3">
                <dt className="text-xs font-extrabold text-[#8A9199]">決済手数料</dt>
                <dd className="mt-1 font-extrabold">{formatYen(summary.paymentFeeYen)}</dd>
              </div>
              <div className="rounded-2xl bg-[#F4F7F8] p-3">
                <dt className="text-xs font-extrabold text-[#8A9199]">利用料 10%</dt>
                <dd className="mt-1 font-extrabold">{formatYen(summary.platformFeeYen)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs font-bold text-[#8A9199]">
              振込手数料 {formatYen(summary.payoutFeeYen)}（売上がある月のみ）
            </p>
          </section>

          <section className="card-shadow mt-4 overflow-hidden">
            <h2 className="border-b border-[#E4EBEE] px-5 py-3 text-sm font-extrabold">明細</h2>
            {summary.rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm font-bold text-[#8A9199]">
                今月の売上はまだありません
              </p>
            ) : (
              <ul className="divide-y divide-[#E4EBEE]">
                {summary.rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold">{row.eventTitle}</p>
                      <p className="mt-0.5 text-xs font-bold text-[#8A9199]">
                        {row.paidAt ? new Date(row.paidAt).toLocaleString('ja-JP') : ''}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-extrabold">{formatYen(row.amountYen)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
