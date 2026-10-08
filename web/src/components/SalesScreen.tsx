'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { useAuth } from '@/lib/auth-context';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { useLocale } from '@/lib/i18n/locale-context';
import { mypageHref } from '@/lib/mypageNav';
import {
  PAYOUT_FEE_YEN,
  PLATFORM_FEE_RATE,
  currentSalesYearMonth,
  fetchOrganizerSalesSummary,
  formatYen,
  parseSalesYearMonth,
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
  const { locale, t } = useLocale();
  const [yearMonth, setYearMonth] = useState(currentSalesYearMonth);
  const [summary, setSummary] = useState<OrganizerSalesSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const latestYearMonth = currentSalesYearMonth();
  const canGoNext = yearMonth < latestYearMonth;
  const platformPct = Math.round(PLATFORM_FEE_RATE * 100);
  const feeLabel = formatYen(PAYOUT_FEE_YEN);

  const statusLabel = (status: MonthPayoutDisplayStatus) => {
    switch (status) {
      case 'paid':
        return t('sales.statusPaid');
      case 'awaiting_payout':
        return t('sales.statusAwaitingPayout');
      case 'awaiting_event':
        return t('sales.statusAwaitingEvent');
      default:
        return t('sales.statusNone');
    }
  };

  const statusHint = (status: MonthPayoutDisplayStatus) => {
    switch (status) {
      case 'paid':
        return t('sales.hintPaid');
      case 'awaiting_payout':
        return t('sales.hintAwaitingPayout');
      case 'awaiting_event':
        return t('sales.hintAwaitingEvent');
      default:
        return t('sales.hintNone');
    }
  };

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
      setError(
        caught instanceof Error ? caught.message : t('sales.fetchFailed'),
      );
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [user, yearMonth, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('sales.title')}</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">{t('common.loading')}</p>
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
        {t('sales.backMypage')}
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{t('sales.title')}</h1>
      <p className="mt-1 text-sm font-bold text-[#5B6B75]">{t('sales.subtitle')}</p>

      {!user ? (
        <LoginPromptCard title={t('sales.loginTitle')} />
      ) : (
        <>
          <div className="card-shadow mt-5 flex items-center px-1 py-1.5">
            <button
              type="button"
              aria-label={t('sales.prevMonth')}
              onClick={() => setYearMonth((ym) => shiftSalesYearMonth(ym, -1))}
              className="grid h-11 w-11 place-items-center text-2xl font-bold text-[#12B8D0]"
            >
              ‹
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-base font-extrabold tracking-tight">{monthLabel}</p>
              <p className="text-[11px] font-bold text-[#8A9199]">
                {t('sales.byEventDate')}
              </p>
            </div>
            <button
              type="button"
              aria-label={t('sales.nextMonth')}
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
            <p className="mt-6 text-sm font-bold text-[#8A9199]">{t('common.loading')}</p>
          ) : error ? (
            <section className="card-shadow mt-5 px-5 py-6 text-center">
              <p className="text-sm font-bold text-[#EF4444]">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 text-sm font-extrabold text-[#12B8D0]"
              >
                {t('common.reload')}
              </button>
            </section>
          ) : summary ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${statusChipClass(status)}`}
                >
                  {statusLabel(status)}
                </span>
              </div>
              <p className="mt-2 text-xs font-bold leading-5 text-[#5B6B75]">
                {status === 'paid' && summary.payoutPaidAt
                  ? t('sales.paidHint', {
                      date: new Date(summary.payoutPaidAt).toLocaleDateString(
                        locale === 'en' ? 'en-US' : 'ja-JP',
                      ),
                    })
                  : statusHint(status)}
              </p>

              <section className="card-shadow mt-4 p-5">
                <p className="text-xs font-extrabold text-[#8A9199]">
                  {status === 'paid' ? t('sales.netPaid') : t('sales.netExpected')}
                </p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#12B8D0]">
                  {formatYen(summary.netYen)}
                </p>

                <dl className="mt-5 space-y-2.5 border-t border-[#E4EBEE] pt-4">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <dt className="font-bold text-[#5B6B75]">{t('sales.eligible')}</dt>
                    <dd className="shrink-0 font-extrabold">
                      {formatYen(summary.confirmedGrossYen)}
                    </dd>
                  </div>
                  {summary.pendingGrossYen > 0 ? (
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <dt className="font-bold text-[#5B6B75]">{t('sales.pending')}</dt>
                      <dd className="shrink-0 font-extrabold text-[#8A9199]">
                        {formatYen(summary.pendingGrossYen)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <dt className="font-bold text-[#5B6B75]">
                      {t('sales.platformFee', { rate: platformPct })}
                    </dt>
                    <dd className="shrink-0 font-extrabold text-[#8A9199]">
                      −{formatYen(summary.platformFeeYen)}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <dt className="font-bold text-[#5B6B75]">
                      {t('sales.transferFee', { fee: feeLabel })}
                    </dt>
                    <dd className="shrink-0 font-extrabold text-[#8A9199]">
                      −{formatYen(summary.payoutFeeYen)}
                    </dd>
                  </div>
                </dl>

                <p className="mt-4 text-xs font-bold text-[#8A9199]">
                  {t('sales.ticketsMeta', {
                    count: summary.ticketCount,
                    confirmed: summary.confirmedTicketCount,
                    events: summary.events.length,
                  })}
                </p>
                <p className="mt-2 text-[11px] font-bold leading-5 text-[#8A9199]">
                  {t('sales.formula', { rate: platformPct, fee: feeLabel })}
                </p>
              </section>

              <div className="mt-6 px-0.5">
                <h2 className="text-base font-extrabold tracking-tight">
                  {t('sales.breakdownTitle')}
                </h2>
                <p className="mt-1 text-xs font-bold leading-5 text-[#5B6B75]">
                  {t('sales.breakdownHint')}
                </p>
              </div>

              {summary.events.length === 0 ? (
                <section className="card-shadow mt-3 px-5 py-8 text-center">
                  <p className="text-sm font-extrabold">
                    {t('sales.emptyTitle', { month: monthLabel })}
                  </p>
                  <p className="mt-2 text-xs font-bold leading-5 text-[#5B6B75]">
                    {t('sales.emptyBody')}
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
                              {item.eventDate || t('sales.dateUnset')} ·{' '}
                              {t('sales.tickets', { count: item.ticketCount })}
                              {item.unitPriceYen > 0
                                ? ` × ${formatYen(item.unitPriceYen)}`
                                : ''}
                              {' · '}
                              {item.confirmed
                                ? t('sales.awaitingPayout')
                                : t('sales.awaitingEvent')}
                            </p>
                            <p className="mt-1 text-[11px] font-bold leading-4 text-[#8A9199]">
                              {t('sales.eventFlow', {
                                gross: formatYen(item.grossYen),
                                platform: formatYen(item.platformFeeYen),
                                net: formatYen(item.netAfterPlatformYen),
                              })}
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
                      {t('sales.bankTitle')}
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
                      {t('sales.feesTitle')}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-[#8A9199]" />
                </Link>
              </section>

              {loading ? (
                <p className="mt-3 text-center text-xs font-bold text-[#8A9199]">
                  {t('common.updating')}
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
