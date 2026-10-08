'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { useAuth } from '@/lib/auth-context';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { mypageHref } from '@/lib/mypageNav';
import {
  PAYMENT_FEE_RATE,
  PAYOUT_FEE_YEN,
  PLATFORM_FEE_RATE,
  currentSalesYearMonth,
  fetchOrganizerSalesSummary,
  formatYen,
  parseSalesYearMonth,
  payoutStatusHint,
  payoutStatusLabel,
  shiftSalesYearMonth,
  type MonthPayoutDisplayStatus,
  type OrganizerSalesSummary,
} from '@/lib/organizerSales';

function monthDisplayLabel(yearMonth: string) {
  const parsed = parseSalesYearMonth(yearMonth);
  return parsed ? `${parsed.year}/${parsed.month}` : yearMonth;
}

function statusChipClass(status: MonthPayoutDisplayStatus) {
  switch (status) {
    case 'paid':
      return 'bg-[#DCFCE7] text-[#15803D]';
    case 'awaiting_payout':
      return 'bg-[#E0F2FE] text-[#0369A1]';
    case 'awaiting_event':
      return 'bg-[#FEF3C7] text-[#B45309]';
    default:
      return 'bg-[#F1F5F9] text-[#64748B]';
  }
}

export function SalesScreen() {
  const { user, ready } = useAuth();
  const [yearMonth, setYearMonth] = useState(currentSalesYearMonth);
  const [summary, setSummary] = useState<OrganizerSalesSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const latestYearMonth = currentSalesYearMonth();
  const canGoNext = yearMonth < latestYearMonth;

  const load = useCallback(async () => {
    if (!user) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const next = await fetchOrganizerSalesSummary({
        userId: user.uid,
        yearMonth,
        getIdToken: async () => idTokenWithAuthenticatedRole(user),
      });
      setSummary(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '売上の取得に失敗しました');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [user, yearMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">売上</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  const status = summary?.payoutStatus ?? 'none';
  const monthLabel = summary?.periodLabel || monthDisplayLabel(yearMonth);

  return (
    <main className="page-main pt-4 md:pt-2">
      <Link
        href={mypageHref({ mode: 'organizer' })}
        className="text-sm font-extrabold text-[#12B8D0]"
      >
        ← マイページ
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">売上</h1>
      <p className="mt-1 text-sm font-bold text-[#5B6B75]">
        開催日ベースの月次売上と振込見込みです。
      </p>

      {!user ? (
        <LoginPromptCard title="ログインして売上を確認" />
      ) : (
        <>
          <div className="card-shadow mt-5 flex items-center px-1 py-1.5">
            <button
              type="button"
              aria-label="前の月"
              onClick={() => setYearMonth((ym) => shiftSalesYearMonth(ym, -1))}
              className="grid h-11 w-11 place-items-center text-2xl font-bold text-[#12B8D0]"
            >
              ‹
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-base font-extrabold tracking-tight">{monthLabel}</p>
              <p className="text-[11px] font-bold text-[#8A9199]">開催日で集計</p>
            </div>
            <button
              type="button"
              aria-label="次の月"
              disabled={!canGoNext}
              onClick={() => {
                if (!canGoNext) return;
                setYearMonth((ym) => shiftSalesYearMonth(ym, 1));
              }}
              className="grid h-11 w-11 place-items-center text-2xl font-bold text-[#12B8D0] disabled:opacity-35"
            >
              ›
            </button>
          </div>

          {loading && !summary ? (
            <p className="mt-6 text-sm font-bold text-[#8A9199]">読み込み中…</p>
          ) : error ? (
            <section className="card-shadow mt-5 px-5 py-6 text-center">
              <p className="text-sm font-bold text-[#EF4444]">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 text-sm font-extrabold text-[#12B8D0]"
              >
                再読み込み
              </button>
            </section>
          ) : summary ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${statusChipClass(status)}`}
                >
                  {payoutStatusLabel(status)}
                </span>
              </div>
              <p className="mt-2 text-xs font-bold leading-5 text-[#5B6B75]">
                {status === 'paid' && summary.payoutPaidAt
                  ? `登録口座への振込が完了しています（${new Date(summary.payoutPaidAt).toLocaleDateString('ja-JP')}）。`
                  : payoutStatusHint(status)}
              </p>

              <section className="card-shadow mt-4 p-5">
                <p className="text-xs font-extrabold text-[#8A9199]">
                  {status === 'paid' ? '振込額（Net）' : 'Expected amount (net)'}
                </p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#12B8D0]">
                  {formatYen(summary.netYen)}
                </p>

                <dl className="mt-5 space-y-2.5 border-t border-[#E4EBEE] pt-4">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <dt className="font-bold text-[#5B6B75]">
                      Sales eligible for payout (finished)
                      <span className="mt-0.5 block text-[11px] font-bold text-[#8A9199]">
                        対象売上（終了済み）
                      </span>
                    </dt>
                    <dd className="shrink-0 font-extrabold">
                      {formatYen(summary.confirmedGrossYen)}
                    </dd>
                  </div>
                  {summary.pendingGrossYen > 0 ? (
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <dt className="font-bold text-[#5B6B75]">
                        Sales awaiting events
                        <span className="mt-0.5 block text-[11px] font-bold text-[#8A9199]">
                          開催待ち（未確定）
                        </span>
                      </dt>
                      <dd className="shrink-0 font-extrabold text-[#8A9199]">
                        {formatYen(summary.pendingGrossYen)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <dt className="font-bold text-[#5B6B75]">
                      Payment processing fee (approx.{' '}
                      {Math.round(PAYMENT_FEE_RATE * 1000) / 10}%)
                      <span className="mt-0.5 block text-[11px] font-bold text-[#8A9199]">
                        決済手数料
                      </span>
                    </dt>
                    <dd className="shrink-0 font-extrabold text-[#8A9199]">
                      −{formatYen(summary.paymentFeeYen)}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <dt className="font-bold text-[#5B6B75]">
                      Platform fee ({Math.round(PLATFORM_FEE_RATE * 100)}%)
                      <span className="mt-0.5 block text-[11px] font-bold text-[#8A9199]">
                        プラットフォーム利用料
                      </span>
                    </dt>
                    <dd className="shrink-0 font-extrabold text-[#8A9199]">
                      −{formatYen(summary.platformFeeYen)}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <dt className="font-bold text-[#5B6B75]">
                      Transfer fee (flat {formatYen(PAYOUT_FEE_YEN)})
                      <span className="mt-0.5 block text-[11px] font-bold text-[#8A9199]">
                        振込手数料
                      </span>
                    </dt>
                    <dd className="shrink-0 font-extrabold text-[#8A9199]">
                      −{formatYen(summary.payoutFeeYen)}
                    </dd>
                  </div>
                </dl>

                <p className="mt-4 text-xs font-bold text-[#8A9199]">
                  {summary.ticketCount}枚販売（確定 {summary.confirmedTicketCount}枚） ·{' '}
                  {summary.events.length}イベント
                </p>
                <p className="mt-2 text-[11px] font-bold leading-5 text-[#8A9199]">
                  Net = confirmed sales − payment fee −{' '}
                  {Math.round(PLATFORM_FEE_RATE * 100)}% platform fee −{' '}
                  {formatYen(PAYOUT_FEE_YEN)} transfer fee（月1回）
                </p>
              </section>

              <div className="mt-6 px-0.5">
                <h2 className="text-base font-extrabold tracking-tight">
                  Breakdown by event
                </h2>
                <p className="mt-1 text-xs font-bold leading-5 text-[#5B6B75]">
                  イベント単位の明細です。決済・利用料はイベントごと、振込手数料は月次合計から控除します。
                </p>
              </div>

              {summary.events.length === 0 ? (
                <section className="card-shadow mt-3 px-5 py-8 text-center">
                  <p className="text-sm font-extrabold">
                    {monthLabel} の売上はまだありません
                  </p>
                  <p className="mt-2 text-xs font-bold leading-5 text-[#5B6B75]">
                    参加者がチケットを支払うと、ここに内訳が表示されます。キャンセル・返金は自動で相殺されます。
                  </p>
                </section>
              ) : (
                <section className="card-shadow mt-3 overflow-hidden">
                  <ul className="divide-y divide-[#E4EBEE]">
                    {summary.events.map((item) => (
                      <li key={item.eventId}>
                        <Link
                          href={`/event/${item.eventId}`}
                          className="flex items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-[#F7FBFC]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-extrabold leading-5">
                              {item.eventTitle}
                            </p>
                            <p className="mt-1 text-[11px] font-bold text-[#8A9199]">
                              {item.eventDate || '日付未設定'} · {item.ticketCount}枚
                              {item.unitPriceYen > 0
                                ? ` × ${formatYen(item.unitPriceYen)}`
                                : ''}
                              {' · '}
                              {item.confirmed ? '振込待ち（確定）' : '開催待ち'}
                            </p>
                            <p className="mt-1 text-[11px] font-bold leading-4 text-[#8A9199]">
                              売上 {formatYen(item.grossYen)} → 決済 −
                              {formatYen(item.paymentFeeYen)} → 利用料 −
                              {formatYen(item.platformFeeYen)} → 主催者分{' '}
                              {formatYen(item.netAfterPlatformYen)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-extrabold">
                              {formatYen(item.grossYen)}
                            </p>
                            <p className="mt-0.5 text-[11px] font-bold text-[#8A9199]">
                              Net {formatYen(item.netAfterPlatformYen)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="card-shadow mt-4 overflow-hidden">
                <Link
                  href="/settings/bank-account"
                  className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-[#F7FBFC]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold">
                      View or register payout account
                    </span>
                    <span className="mt-0.5 block text-[11px] font-bold text-[#8A9199]">
                      振込口座の確認・登録
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-[#8A9199]" />
                </Link>
                <Link
                  href="/settings/organizer-guidelines"
                  className="flex items-center gap-3 border-t border-[#E4EBEE] px-5 py-4 transition-colors hover:bg-[#F7FBFC]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold">
                      About fees and payouts
                    </span>
                    <span className="mt-0.5 block text-[11px] font-bold text-[#8A9199]">
                      手数料と振込について
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-[#8A9199]" />
                </Link>
              </section>

              {loading ? (
                <p className="mt-3 text-center text-xs font-bold text-[#8A9199]">
                  更新中…
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
