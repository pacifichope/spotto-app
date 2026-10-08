import { createAuthedSupabase } from '@/lib/supabase';

export const PLATFORM_FEE_RATE = 0.1;
export const PAYMENT_FEE_RATE = 0.036;
export const PAYOUT_FEE_YEN = 500;

export type SalesSummary = {
  year: number;
  month: number;
  periodLabel: string;
  grossYen: number;
  paymentFeeYen: number;
  platformFeeYen: number;
  payoutFeeYen: number;
  netYen: number;
  ticketCount: number;
  rows: {
    id: string;
    eventTitle: string;
    amountYen: number;
    paidAt: string;
    status: string;
  }[];
};

function yen(n: number) {
  return Math.max(0, Math.floor(n));
}

export async function fetchSalesSummary(input: {
  getIdToken: () => Promise<string | null>;
  userId: string;
  year?: number;
  month?: number;
}): Promise<SalesSummary> {
  const now = new Date();
  const year = input.year ?? now.getFullYear();
  const month = input.month ?? now.getMonth() + 1;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const supabase = createAuthedSupabase(input.getIdToken);

  const { data, error } = await supabase
    .from('event_ticket_sales')
    .select('id, event_id, amount_yen, refunded_yen, status, paid_at, event_title')
    .eq('host_id', input.userId)
    .gte('paid_at', start.toISOString())
    .lt('paid_at', end.toISOString())
    .order('paid_at', { ascending: false });

  if (error) {
    // テーブル未作成時など
    return {
      year,
      month,
      periodLabel: `${year}年${month}月`,
      grossYen: 0,
      paymentFeeYen: 0,
      platformFeeYen: 0,
      payoutFeeYen: 0,
      netYen: 0,
      ticketCount: 0,
      rows: [],
    };
  }

  const rows = (data ?? []).map((row) => {
    const amount = Math.max(
      0,
      Number((row as { amount_yen?: number }).amount_yen || 0) -
        Number((row as { refunded_yen?: number }).refunded_yen || 0),
    );
    return {
      id: String((row as { id?: string }).id ?? ''),
      eventTitle:
        String((row as { event_title?: string }).event_title ?? '').trim() ||
        'イベント',
      amountYen: amount,
      paidAt: String((row as { paid_at?: string }).paid_at ?? ''),
      status: String((row as { status?: string }).status ?? 'paid'),
    };
  });

  const paidRows = rows.filter((row) => row.status === 'paid' || !row.status);
  const grossYen = paidRows.reduce((sum, row) => sum + row.amountYen, 0);
  const paymentFeeYen = yen(grossYen * PAYMENT_FEE_RATE);
  const platformFeeYen = yen(grossYen * PLATFORM_FEE_RATE);
  const payoutFeeYen = grossYen > 0 ? PAYOUT_FEE_YEN : 0;
  const netYen = Math.max(0, grossYen - paymentFeeYen - platformFeeYen - payoutFeeYen);

  return {
    year,
    month,
    periodLabel: `${year}年${month}月`,
    grossYen,
    paymentFeeYen,
    platformFeeYen,
    payoutFeeYen,
    netYen,
    ticketCount: paidRows.length,
    rows: paidRows,
  };
}

export function formatYen(value: number) {
  return `¥${yen(value).toLocaleString('ja-JP')}`;
}
