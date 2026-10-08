import { createAuthedSupabase } from '@/lib/supabase';

/** ガイドライン: プラットフォーム利用料 一律 10% */
export const PLATFORM_FEE_RATE = 0.1;
/** 振込手数料 一律 500円（税込）/ 振込回 */
export const PAYOUT_FEE_YEN = 500;

export type MonthPayoutDisplayStatus =
  | 'none'
  | 'awaiting_event'
  | 'awaiting_payout'
  | 'paid';

export type EventSalesBreakdown = {
  eventId: string;
  eventTitle: string;
  eventDate?: string;
  ticketCount: number;
  grossYen: number;
  unitPriceYen: number;
  confirmed: boolean;
  confirmedGrossYen: number;
  pendingGrossYen: number;
  platformFeeYen: number;
  netAfterPlatformYen: number;
};

export type OrganizerSalesSummary = {
  periodLabel: string;
  year: number;
  month: number;
  yearMonth: string;
  grossYen: number;
  confirmedGrossYen: number;
  pendingGrossYen: number;
  platformFeeYen: number;
  payoutFeeYen: number;
  netYen: number;
  ticketCount: number;
  confirmedTicketCount: number;
  events: EventSalesBreakdown[];
  payoutStatus: MonthPayoutDisplayStatus;
  payoutPaidAt?: string;
};

type TicketSaleRow = {
  id: string;
  eventId: string;
  amountYen: number;
  ticketQuantity: number;
  paidAt: string;
  eventTitle: string;
  eventDate?: string;
  eventEndsAt?: string;
};

function yen(n: number) {
  return Math.max(0, Math.floor(n));
}

function monthBoundsFromParts(year: number, month: number) {
  const y = Math.floor(year);
  const m = Math.floor(month);
  if (!y || m < 1 || m > 12) {
    const now = new Date();
    return monthBoundsFromParts(now.getFullYear(), now.getMonth() + 1);
  }
  const end = new Date(y, m, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yearMonth = `${y}-${pad(m)}`;
  return {
    year: y,
    month: m,
    yearMonth,
    startDate: `${y}-${pad(m)}-01`,
    endDate: `${y}-${pad(m)}-${pad(end.getDate())}`,
    periodLabel: `${y}/${m}`,
  };
}

export function formatSalesYearMonth(year: number, month: number) {
  return monthBoundsFromParts(year, month).yearMonth;
}

export function parseSalesYearMonth(yearMonth: string) {
  const m = String(yearMonth || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
}

export function shiftSalesYearMonth(yearMonth: string, delta: number) {
  const parsed = parseSalesYearMonth(yearMonth);
  if (!parsed) {
    const now = new Date();
    return formatSalesYearMonth(now.getFullYear(), now.getMonth() + 1);
  }
  const d = new Date(parsed.year, parsed.month - 1 + delta, 1);
  return formatSalesYearMonth(d.getFullYear(), d.getMonth() + 1);
}

export function currentSalesYearMonth() {
  const now = new Date();
  return formatSalesYearMonth(now.getFullYear(), now.getMonth() + 1);
}

/** Net = confirmed sales − platform fee − transfer fee（月1回） */
export function calcPayoutBreakdown(grossYen: number) {
  const gross = yen(grossYen);
  const platformFeeYen = yen(gross * PLATFORM_FEE_RATE);
  const afterPlatform = Math.max(0, gross - platformFeeYen);
  const payoutFeeYen = afterPlatform > 0 ? PAYOUT_FEE_YEN : 0;
  const netYen = Math.max(0, afterPlatform - payoutFeeYen);
  return { grossYen: gross, platformFeeYen, payoutFeeYen, netYen };
}

export function calcEventPlatformFee(grossYen: number) {
  const gross = yen(grossYen);
  const platformFeeYen = yen(gross * PLATFORM_FEE_RATE);
  return {
    grossYen: gross,
    platformFeeYen,
    netAfterPlatformYen: Math.max(0, gross - platformFeeYen),
  };
}

export function isSaleConfirmed(
  sale: Pick<TicketSaleRow, 'eventEndsAt' | 'eventDate' | 'paidAt'>,
  now = new Date(),
) {
  if (sale.eventEndsAt) {
    const t = Date.parse(sale.eventEndsAt);
    if (Number.isFinite(t)) return t <= now.getTime();
  }
  const dateKey = (sale.eventDate || sale.paidAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const end = Date.parse(`${dateKey}T23:59:59+09:00`);
  return Number.isFinite(end) && end <= now.getTime();
}

function inMonth(dateStr: string | undefined, startDate: string, endDate: string) {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= startDate && d <= endDate;
}

function buildBreakdown(
  sales: TicketSaleRow[],
  startDate: string,
  endDate: string,
  now: Date,
): EventSalesBreakdown[] {
  const map = new Map<
    string,
    EventSalesBreakdown & { _confirmedGross: number; _pendingGross: number }
  >();

  for (const sale of sales) {
    const dateKey = sale.eventDate || sale.paidAt.slice(0, 10);
    if (!inMonth(dateKey, startDate, endDate)) continue;
    const confirmed = isSaleConfirmed(sale, now);
    const qty = Math.max(1, sale.ticketQuantity);
    const prev = map.get(sale.eventId);
    if (prev) {
      prev.ticketCount += qty;
      prev.grossYen += sale.amountYen;
      prev.unitPriceYen =
        prev.ticketCount > 0
          ? Math.round(prev.grossYen / prev.ticketCount)
          : prev.grossYen;
      prev.confirmed = prev.confirmed && confirmed;
      if (confirmed) prev._confirmedGross += sale.amountYen;
      else prev._pendingGross += sale.amountYen;
    } else {
      map.set(sale.eventId, {
        eventId: sale.eventId,
        eventTitle: sale.eventTitle,
        eventDate: sale.eventDate,
        ticketCount: qty,
        grossYen: sale.amountYen,
        unitPriceYen: Math.round(sale.amountYen / qty),
        confirmed,
        confirmedGrossYen: 0,
        pendingGrossYen: 0,
        platformFeeYen: 0,
        netAfterPlatformYen: 0,
        _confirmedGross: confirmed ? sale.amountYen : 0,
        _pendingGross: confirmed ? 0 : sale.amountYen,
      });
    }
  }

  return [...map.values()]
    .map((row) => {
      const fee = calcEventPlatformFee(row.grossYen);
      return {
        eventId: row.eventId,
        eventTitle: row.eventTitle,
        eventDate: row.eventDate,
        ticketCount: row.ticketCount,
        grossYen: row.grossYen,
        unitPriceYen: row.unitPriceYen,
        confirmed: row.confirmed,
        confirmedGrossYen: row._confirmedGross,
        pendingGrossYen: row._pendingGross,
        platformFeeYen: fee.platformFeeYen,
        netAfterPlatformYen: fee.netAfterPlatformYen,
      };
    })
    .sort((a, b) =>
      String(b.eventDate || '').localeCompare(String(a.eventDate || '')),
    );
}

export async function fetchOrganizerSalesSummary(input: {
  userId: string;
  getIdToken: () => Promise<string | null>;
  yearMonth?: string;
}): Promise<OrganizerSalesSummary> {
  const now = new Date();
  const parsed = parseSalesYearMonth(input.yearMonth || '');
  const bounds = parsed
    ? monthBoundsFromParts(parsed.year, parsed.month)
    : monthBoundsFromParts(now.getFullYear(), now.getMonth() + 1);

  const empty = (): OrganizerSalesSummary => ({
    periodLabel: bounds.periodLabel,
    year: bounds.year,
    month: bounds.month,
    yearMonth: bounds.yearMonth,
    grossYen: 0,
    confirmedGrossYen: 0,
    pendingGrossYen: 0,
    platformFeeYen: 0,
    payoutFeeYen: 0,
    netYen: 0,
    ticketCount: 0,
    confirmedTicketCount: 0,
    events: [],
    payoutStatus: 'none',
  });

  const supabase = createAuthedSupabase(input.getIdToken);
  const { data, error } = await supabase
    .from('event_ticket_sales')
    .select(
      'id, event_id, amount_yen, refunded_yen, ticket_quantity, status, paid_at, event_title, event_date, event_ends_at',
    )
    .eq('host_id', input.userId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false });

  if (error) {
    // テーブル未作成時は空サマリー
    if (
      error.message.includes('schema cache') ||
      error.code === 'PGRST205' ||
      /event_ticket_sales/i.test(error.message)
    ) {
      return empty();
    }
    throw new Error(error.message);
  }

  const sales: TicketSaleRow[] = (data ?? []).map((row) => {
    const amount = Math.max(
      0,
      Number((row as { amount_yen?: number }).amount_yen || 0) -
        Number((row as { refunded_yen?: number }).refunded_yen || 0),
    );
    return {
      id: String((row as { id?: string }).id ?? ''),
      eventId: String((row as { event_id?: string }).event_id ?? '').trim(),
      amountYen: amount,
      ticketQuantity: Math.max(
        1,
        Math.floor(Number((row as { ticket_quantity?: number }).ticket_quantity) || 1),
      ),
      paidAt: String((row as { paid_at?: string }).paid_at ?? ''),
      eventTitle:
        String((row as { event_title?: string }).event_title ?? '').trim() ||
        'イベント',
      eventDate: String((row as { event_date?: string }).event_date ?? '').trim() || undefined,
      eventEndsAt:
        String((row as { event_ends_at?: string }).event_ends_at ?? '').trim() ||
        undefined,
    };
  }).filter((row) => row.eventId && row.amountYen > 0);

  const monthSales = sales.filter((sale) => {
    const dateKey = sale.eventDate || sale.paidAt.slice(0, 10);
    return inMonth(dateKey, bounds.startDate, bounds.endDate);
  });
  const confirmedSales = monthSales.filter((s) => isSaleConfirmed(s, now));
  const pendingSales = monthSales.filter((s) => !isSaleConfirmed(s, now));
  const events = buildBreakdown(
    sales,
    bounds.startDate,
    bounds.endDate,
    now,
  );

  const confirmedGrossYen = confirmedSales.reduce((s, r) => s + r.amountYen, 0);
  const pendingGrossYen = pendingSales.reduce((s, r) => s + r.amountYen, 0);
  const fees = calcPayoutBreakdown(confirmedGrossYen);
  const ticketCount = monthSales.reduce(
    (s, r) => s + Math.max(1, r.ticketQuantity),
    0,
  );
  const confirmedTicketCount = confirmedSales.reduce(
    (s, r) => s + Math.max(1, r.ticketQuantity),
    0,
  );

  let payoutStatus: MonthPayoutDisplayStatus = 'none';
  let payoutPaidAt: string | undefined;
  const { data: payoutRow } = await supabase
    .from('organizer_payouts')
    .select('status, paid_at, net_yen')
    .eq('host_id', input.userId)
    .eq('year_month', bounds.yearMonth)
    .maybeSingle();

  if (payoutRow && (payoutRow as { status?: string }).status === 'paid') {
    payoutStatus = 'paid';
    payoutPaidAt =
      String((payoutRow as { paid_at?: string }).paid_at || '').trim() ||
      undefined;
  } else if (confirmedGrossYen > 0) {
    payoutStatus = 'awaiting_payout';
  } else if (pendingGrossYen > 0) {
    payoutStatus = 'awaiting_event';
  }

  return {
    periodLabel: bounds.periodLabel,
    year: bounds.year,
    month: bounds.month,
    yearMonth: bounds.yearMonth,
    grossYen: confirmedGrossYen + pendingGrossYen,
    confirmedGrossYen,
    pendingGrossYen,
    platformFeeYen: fees.platformFeeYen,
    payoutFeeYen: fees.payoutFeeYen,
    netYen: fees.netYen,
    ticketCount,
    confirmedTicketCount,
    events,
    payoutStatus,
    payoutPaidAt,
  };
}

export function formatYen(value: number) {
  return `¥${yen(value).toLocaleString('ja-JP')}`;
}

export function payoutStatusLabel(status: MonthPayoutDisplayStatus) {
  switch (status) {
    case 'paid':
      return '振込済み';
    case 'awaiting_payout':
      return '振込待ち（確定）';
    case 'awaiting_event':
      return '開催待ち（未確定）';
    default:
      return 'No sales';
  }
}

export function payoutStatusHint(status: MonthPayoutDisplayStatus) {
  switch (status) {
    case 'paid':
      return '登録口座への振込が完了しています。';
    case 'awaiting_payout':
      return '終了済みイベントの売上は振込待ち（確定）です。翌月末の振込予定をご確認ください。';
    case 'awaiting_event':
      return 'イベント終了後、自動で「振込待ち（確定）」に切り替わります。';
    default:
      return 'この月のチケット売上はまだありません。';
  }
}
