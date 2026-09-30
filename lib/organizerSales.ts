import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { resolveAuthUserId } from '@/lib/eventsRemote';
import { ALLOW_HOST_SELF_TEST_SALE } from '@/lib/devTestFlags';
import { formatYenAmount } from '@/lib/payments';

/** ガイドライン: プラットフォーム利用料 一律 10% */
export const PLATFORM_FEE_RATE = 0.1;
/**
 * 決済手数料（Stripe カード決済の目安 3.6%）。
 * 参加者支払総額から差し引き、主催者振込額を算出する。
 */
export const PAYMENT_FEE_RATE = 0.036;
/** ガイドライン: 振込手数料 一律 500円（税込）/ 振込回 */
export const PAYOUT_FEE_YEN = 500;

export type TicketSaleStatus = 'paid' | 'refunded';

/** 主催者向けの月次振込表示ステータス */
export type MonthPayoutDisplayStatus =
  | 'none'
  | 'awaiting_event'
  | 'awaiting_payout'
  | 'paid';

export type TicketSaleRow = {
  id: string;
  eventId: string;
  hostId: string;
  buyerId: string;
  amountYen: number;
  refundedYen: number;
  /** 購入枚数（未マイグレーション時は 1） */
  ticketQuantity: number;
  paymentIntentId?: string;
  status: TicketSaleStatus;
  paidAt: string;
  refundedAt?: string;
  eventTitle: string;
  eventDate?: string;
  eventEndsAt?: string;
};

export type EventSalesBreakdown = {
  eventId: string;
  eventTitle: string;
  eventDate?: string;
  ticketCount: number;
  grossYen: number;
  unitPriceYen: number;
  /** 終了済み → 振込待ち（確定）対象 */
  confirmed: boolean;
  /** 確定分の売上（終了済み） */
  confirmedGrossYen: number;
  /** 開催待ち分の売上 */
  pendingGrossYen: number;
  /** このイベント売上に対する決済手数料（Stripe 目安） */
  paymentFeeYen: number;
  /** このイベント売上に対するプラットフォーム利用料（10%） */
  platformFeeYen: number;
  /** 決済手数料・利用料控除後の主催者分（月次の振込手数料 500円は含まない） */
  netAfterPlatformYen: number;
};

export type OrganizerSalesSummary = {
  periodLabel: string;
  year: number;
  month: number;
  yearMonth: string;
  /** 当月の支払済み売上総額（返金相殺後・開催前含む） */
  grossYen: number;
  /** 終了済みイベントの売上（振込対象） */
  confirmedGrossYen: number;
  /** 未終了イベントの売上（まだ振込待ちにならない） */
  pendingGrossYen: number;
  /** 決済手数料（確定売上に対する Stripe 目安） */
  paymentFeeYen: number;
  platformFeeYen: number;
  payoutFeeYen: number;
  netYen: number;
  ticketCount: number;
  confirmedTicketCount: number;
  events: EventSalesBreakdown[];
  payoutStatus: MonthPayoutDisplayStatus;
  payoutPaidAt?: string;
};

type RemoteSale = {
  id: string;
  event_id: string;
  host_id: string;
  buyer_id: string;
  amount_yen: number;
  refunded_yen?: number | null;
  ticket_quantity?: number | null;
  payment_intent_id?: string | null;
  status: string;
  paid_at: string;
  refunded_at?: string | null;
  event_title?: string | null;
  event_date?: string | null;
  event_ends_at?: string | null;
};

export type SalesResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function monthBoundsFromParts(year: number, month: number) {
  const y = Math.floor(year);
  const m = Math.floor(month);
  if (!y || m < 1 || m > 12) {
    return monthBoundsFromParts(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
    );
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
    periodLabel: `${y}年${m}月分`,
    periodHint: '翌月末振込予定（イベント開催日ベース）',
  };
}

function monthBounds(now = new Date()) {
  return monthBoundsFromParts(now.getFullYear(), now.getMonth() + 1);
}

/** YYYY-MM */
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
    return formatSalesYearMonth(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
    );
  }
  const d = new Date(parsed.year, parsed.month - 1 + delta, 1);
  return formatSalesYearMonth(d.getFullYear(), d.getMonth() + 1);
}

export function salesYearMonthLabel(yearMonth: string) {
  const parsed = parseSalesYearMonth(yearMonth);
  if (!parsed) return yearMonth;
  return `${parsed.year}年${parsed.month}月分`;
}

export function calcPayoutBreakdown(grossYen: number) {
  const gross = Math.max(0, Math.floor(grossYen));
  const paymentFeeYen = Math.floor(gross * PAYMENT_FEE_RATE);
  const platformFeeYen = Math.floor(gross * PLATFORM_FEE_RATE);
  const afterFees = Math.max(0, gross - paymentFeeYen - platformFeeYen);
  const payoutFeeYen = afterFees > 0 ? PAYOUT_FEE_YEN : 0;
  const netYen = Math.max(0, afterFees - payoutFeeYen);
  return {
    grossYen: gross,
    paymentFeeYen,
    platformFeeYen,
    payoutFeeYen,
    netYen,
  };
}

/** イベント単体の手数料（振込手数料は月次合算から別途控除） */
export function calcEventPlatformFee(grossYen: number) {
  const gross = Math.max(0, Math.floor(grossYen));
  const paymentFeeYen = Math.floor(gross * PAYMENT_FEE_RATE);
  const platformFeeYen = Math.floor(gross * PLATFORM_FEE_RATE);
  return {
    grossYen: gross,
    paymentFeeYen,
    platformFeeYen,
    netAfterPlatformYen: Math.max(0, gross - paymentFeeYen - platformFeeYen),
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
  // フォールバック: 開催日の翌日 0:00 を終了とみなす
  const dateKey = (sale.eventDate || sale.paidAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const end = Date.parse(`${dateKey}T23:59:59+09:00`);
  return Number.isFinite(end) && end <= now.getTime();
}

function remoteToSale(row: RemoteSale): TicketSaleRow {
  return {
    id: row.id,
    eventId: row.event_id,
    hostId: row.host_id,
    buyerId: row.buyer_id,
    amountYen: Math.max(0, Math.floor(Number(row.amount_yen) || 0)),
    refundedYen: Math.max(0, Math.floor(Number(row.refunded_yen) || 0)),
    ticketQuantity: Math.max(1, Math.floor(Number(row.ticket_quantity) || 1)),
    paymentIntentId: row.payment_intent_id?.trim() || undefined,
    status: row.status === 'refunded' ? 'refunded' : 'paid',
    paidAt: row.paid_at,
    refundedAt: row.refunded_at || undefined,
    eventTitle: String(row.event_title || '').trim() || 'イベント',
    eventDate: row.event_date || undefined,
    eventEndsAt: row.event_ends_at || undefined,
  };
}

/** 決済成功時: 購入者セッションで売上行を作成（host_id は DB トリガーが events から設定）
 * - 同一 payment_intent_id → 冪等（上書きしない）
 * - 同一 event×buyer で別決済 → 金額・枚数を加算（イベント横断の上書きは発生しない）
 * - 新規 → insert
 */
export async function recordTicketSale(input: {
  eventId: string;
  amountYen: number;
  ticketQuantity?: number;
  paymentIntentId?: string;
  eventTitle?: string;
  eventDate?: string;
  eventEndsAt?: string;
}): Promise<SalesResult<TicketSaleRow | null>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'データベースが未設定です。' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'データベースに接続できません。' };

  const buyerId = await resolveAuthUserId();
  if (!buyerId) {
    return { ok: false, error: 'ログインが必要です。' };
  }

  const amountYen = Math.max(0, Math.floor(Number(input.amountYen) || 0));
  if (amountYen <= 0) {
    return { ok: true, data: null };
  }
  const ticketQuantity = Math.max(
    1,
    Math.floor(Number(input.ticketQuantity) || 1),
  );
  const paymentIntentId = input.paymentIntentId?.trim() || '';

  // 同一決済の再送は冪等に扱う
  if (paymentIntentId) {
    const { data: byPi } = await client
      .from('event_ticket_sales')
      .select('*')
      .eq('payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (byPi) {
      return { ok: true, data: remoteToSale(byPi as RemoteSale) };
    }
  }

  const { data: existing } = await client
    .from('event_ticket_sales')
    .select('*')
    .eq('event_id', input.eventId)
    .eq('buyer_id', buyerId)
    .maybeSingle();

  if (existing) {
    const prev = remoteToSale(existing as RemoteSale);
    // 同一 PI ならそのまま（上書きしない）
    if (
      paymentIntentId &&
      prev.paymentIntentId &&
      prev.paymentIntentId === paymentIntentId
    ) {
      return { ok: true, data: prev };
    }
    // 返金済み行への再決済: 新規売上として金額を差し替え（加算しない）
    const isFreshAfterRefund = prev.status === 'refunded';
    const nextAmount = isFreshAfterRefund
      ? amountYen
      : prev.amountYen + amountYen;
    const nextQty = isFreshAfterRefund
      ? ticketQuantity
      : prev.ticketQuantity + ticketQuantity;
    const updatePayload: Record<string, unknown> = {
      amount_yen: nextAmount,
      ticket_quantity: nextQty,
      status: 'paid',
      refunded_yen: isFreshAfterRefund ? 0 : prev.refundedYen,
      refunded_at: null,
      paid_at: new Date().toISOString(),
      event_title: input.eventTitle?.trim() || prev.eventTitle,
      event_date: input.eventDate || prev.eventDate || null,
      event_ends_at: input.eventEndsAt || prev.eventEndsAt || null,
    };
    if (paymentIntentId) {
      updatePayload.payment_intent_id = paymentIntentId;
    }

    let { data, error } = await client
      .from('event_ticket_sales')
      .update(updatePayload)
      .eq('id', prev.id)
      .select('*')
      .maybeSingle();

    if (
      error &&
      (error.message.includes('ticket_quantity') ||
        error.message.includes('event_ends_at') ||
        error.message.includes('refunded_yen'))
    ) {
      delete updatePayload.ticket_quantity;
      delete updatePayload.event_ends_at;
      const retry = await client
        .from('event_ticket_sales')
        .update(updatePayload)
        .eq('id', prev.id)
        .select('*')
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (__DEV__) console.warn('[sales] accumulate failed', error);
      return {
        ok: false,
        error: error.message || '売上の更新に失敗しました。',
      };
    }
    if (__DEV__) {
      console.log('[sales] accumulated', {
        eventId: input.eventId,
        prevAmount: prev.amountYen,
        addAmount: amountYen,
        nextAmount,
        ticketQuantity: nextQty,
      });
    }
    return { ok: true, data: data ? remoteToSale(data as RemoteSale) : null };
  }

  const payload: Record<string, unknown> = {
    event_id: input.eventId,
    buyer_id: buyerId,
    host_id: buyerId,
    amount_yen: amountYen,
    ticket_quantity: ticketQuantity,
    refunded_yen: 0,
    payment_intent_id: paymentIntentId || null,
    status: 'paid',
    paid_at: new Date().toISOString(),
    event_title: input.eventTitle?.trim() || '',
    event_date: input.eventDate || null,
    event_ends_at: input.eventEndsAt || null,
  };

  let { data, error } = await client
    .from('event_ticket_sales')
    .insert(payload)
    .select('*')
    .maybeSingle();

  // 未マイグレーション列のフォールバック
  if (
    error &&
    (error.message.includes('event_ends_at') ||
      error.message.includes('refunded_yen') ||
      error.message.includes('ticket_quantity'))
  ) {
    delete payload.event_ends_at;
    delete payload.refunded_yen;
    delete payload.ticket_quantity;
    const retry = await client
      .from('event_ticket_sales')
      .insert(payload)
      .select('*')
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    // 競合（同時 insert）時は既存行を返す
    if (error.code === '23505' && paymentIntentId) {
      const { data: raced } = await client
        .from('event_ticket_sales')
        .select('*')
        .eq('payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (raced) {
        return { ok: true, data: remoteToSale(raced as RemoteSale) };
      }
    }
    if (__DEV__) console.warn('[sales] record failed', error);
    return {
      ok: false,
      error:
        error.message.includes('schema cache') || error.code === 'PGRST205'
          ? '売上テーブルが未作成です。'
          : error.message || '売上の記録に失敗しました。',
    };
  }
  if (__DEV__) {
    console.log('[sales] recorded', {
      eventId: input.eventId,
      amountYen,
      ticketQuantity,
      paymentIntentId: paymentIntentId || null,
    });
  }
  return { ok: true, data: data ? remoteToSale(data as RemoteSale) : null };
}

/**
 * __DEV__ 用: 自分が主催するイベントに対し、自分を購入者としてテスト売上を1件記録。
 * （RLS 上 buyer = JWT sub のため、ホスト自身の決済行として挿入する）
 */
export async function recordSelfTestTicketSale(input: {
  eventId: string;
  amountYen: number;
  ticketQuantity?: number;
  eventTitle?: string;
  eventDate?: string;
  eventEndsAt?: string;
}): Promise<SalesResult<TicketSaleRow | null>> {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return { ok: false, error: '開発ビルドでのみ利用できます。' };
  }
  if (!ALLOW_HOST_SELF_TEST_SALE) {
    return { ok: false, error: 'テスト売上の記録は無効です。' };
  }
  const eventId = String(input.eventId || '').trim();
  if (!eventId) {
    return { ok: false, error: 'イベントが指定されていません。' };
  }
  return recordTicketSale({
    eventId,
    amountYen: input.amountYen,
    ticketQuantity: input.ticketQuantity,
    eventTitle: input.eventTitle,
    eventDate: input.eventDate,
    eventEndsAt: input.eventEndsAt,
    paymentIntentId: `demo_self_test_${eventId}_${Date.now()}`,
  });
}

/**
 * キャンセル・返金に応じて売上を相殺する。
 * - refundYen >= 残額 → status=refunded（売上・利用料計算から除外）
 * - 0 < refundYen < 残額 → amount_yen を減額（部分返金）
 * - refundYen <= 0 → 何もしない
 */
export async function applyTicketSaleRefund(input: {
  eventId: string;
  paymentIntentId?: string;
  refundYen: number;
}): Promise<SalesResult<true>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'データベースが未設定です。' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'データベースに接続できません。' };

  const buyerId = await resolveAuthUserId();
  if (!buyerId) {
    return { ok: false, error: 'ログインが必要です。' };
  }

  const refundYen = Math.max(0, Math.floor(Number(input.refundYen) || 0));
  if (refundYen <= 0) {
    return { ok: true, data: true };
  }

  let select = client
    .from('event_ticket_sales')
    .select('*')
    .eq('event_id', input.eventId)
    .eq('buyer_id', buyerId)
    .eq('status', 'paid')
    .maybeSingle();

  const { data: existing, error: fetchError } = await select;
  if (fetchError) {
    return { ok: false, error: fetchError.message || '売上の取得に失敗しました。' };
  }
  if (!existing) {
    return { ok: true, data: true };
  }

  const sale = remoteToSale(existing as RemoteSale);
  if (
    input.paymentIntentId?.trim() &&
    sale.paymentIntentId &&
    sale.paymentIntentId !== input.paymentIntentId.trim()
  ) {
    return { ok: true, data: true };
  }

  const nowIso = new Date().toISOString();
  if (refundYen >= sale.amountYen) {
    const { error } = await client
      .from('event_ticket_sales')
      .update({
        status: 'refunded',
        refunded_at: nowIso,
        refunded_yen: sale.refundedYen + sale.amountYen,
        amount_yen: sale.amountYen,
      })
      .eq('id', sale.id)
      .eq('status', 'paid');
    if (error) {
      // refunded_yen 未適用時
      const fallback = await client
        .from('event_ticket_sales')
        .update({ status: 'refunded', refunded_at: nowIso })
        .eq('id', sale.id)
        .eq('status', 'paid');
      if (fallback.error) {
        return {
          ok: false,
          error: fallback.error.message || '返金記録に失敗しました。',
        };
      }
    }
    return { ok: true, data: true };
  }

  const nextAmount = sale.amountYen - refundYen;
  const nextRefunded = sale.refundedYen + refundYen;
  const { error } = await client
    .from('event_ticket_sales')
    .update({
      amount_yen: nextAmount,
      refunded_yen: nextRefunded,
    })
    .eq('id', sale.id)
    .eq('status', 'paid');

  if (error) {
    // 部分返金カラムが無い場合は全額返金扱いにせず減額のみ試行
    const fallback = await client
      .from('event_ticket_sales')
      .update({ amount_yen: nextAmount })
      .eq('id', sale.id)
      .eq('status', 'paid');
    if (fallback.error) {
      return {
        ok: false,
        error: fallback.error.message || '返金の相殺に失敗しました。',
      };
    }
  }
  return { ok: true, data: true };
}

/** @deprecated applyTicketSaleRefund を使用（互換） */
export async function markTicketSaleRefunded(input: {
  eventId: string;
  paymentIntentId?: string;
  refundYen?: number;
}): Promise<SalesResult<true>> {
  return applyTicketSaleRefund({
    eventId: input.eventId,
    paymentIntentId: input.paymentIntentId,
    refundYen:
      input.refundYen == null
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, Math.floor(input.refundYen)),
  });
}

/** 主催者中止: 当該イベントの支払済み売上をすべて相殺 */
export async function markEventTicketSalesRefunded(
  eventId: string,
): Promise<SalesResult<true>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'データベースが未設定です。' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'データベースに接続できません。' };

  const hostId = await resolveAuthUserId();
  if (!hostId) {
    return { ok: false, error: 'ログインが必要です。' };
  }

  const nowIso = new Date().toISOString();
  const { error } = await client
    .from('event_ticket_sales')
    .update({
      status: 'refunded',
      refunded_at: nowIso,
    })
    .eq('event_id', eventId)
    .eq('host_id', hostId)
    .eq('status', 'paid');

  if (error) {
    return { ok: false, error: error.message || '売上の相殺に失敗しました。' };
  }
  return { ok: true, data: true };
}

async function fetchHostSalesLedger(
  hostId: string,
): Promise<SalesResult<TicketSaleRow[]>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'データベースに接続できません。' };

  const { data, error } = await client
    .from('event_ticket_sales')
    .select('*')
    .eq('host_id', hostId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false });

  if (error) {
    return {
      ok: false,
      error:
        error.message.includes('schema cache') || error.code === 'PGRST205'
          ? '売上テーブルが未作成です。'
          : error.message || '売上の取得に失敗しました。',
    };
  }

  const rows = (data as RemoteSale[] | null)?.map(remoteToSale) ?? [];
  return {
    ok: true,
    data: rows.filter((row) => row.hostId === hostId && row.status === 'paid'),
  };
}

async function fetchOwnPayoutRow(yearMonth: string) {
  const client = getSupabaseClient();
  const hostId = await resolveAuthUserId();
  if (!client || !hostId) return null;
  const { data, error } = await client
    .from('organizer_payouts')
    .select('status,paid_at,net_yen')
    .eq('host_id', hostId)
    .eq('year_month', yearMonth)
    .maybeSingle();
  if (error || !data) return null;
  return data as { status: string; paid_at?: string | null; net_yen?: number };
}

function inMonth(dateStr: string | undefined, startDate: string, endDate: string) {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= startDate && d <= endDate;
}

function buildBreakdownFromLedger(
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
        paymentFeeYen: 0,
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
        paymentFeeYen: fee.paymentFeeYen,
        platformFeeYen: fee.platformFeeYen,
        netAfterPlatformYen: fee.netAfterPlatformYen,
      };
    })
    .sort((a, b) =>
      String(b.eventDate || '').localeCompare(String(a.eventDate || '')),
    );
}

/**
 * ログイン中ホストの指定月売上サマリー（決済台帳の実額のみ・返金相殺後）。
 * yearMonth は YYYY-MM。未指定時は当月。
 * 振込ステータスは organizer_payouts とイベント終了で判定。
 */
export async function fetchOrganizerSalesSummary(
  yearMonthOrNow?: string | Date,
): Promise<SalesResult<OrganizerSalesSummary>> {
  const hostId = await resolveAuthUserId();
  if (!hostId) {
    return { ok: false, error: 'ログインが必要です。' };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'データベースが未設定です。' };
  }

  const now = new Date();
  let bounds = monthBounds(now);
  if (typeof yearMonthOrNow === 'string') {
    const parsed = parseSalesYearMonth(yearMonthOrNow);
    if (parsed) {
      bounds = monthBoundsFromParts(parsed.year, parsed.month);
    }
  } else if (yearMonthOrNow instanceof Date) {
    bounds = monthBounds(yearMonthOrNow);
  }

  const { year, month, yearMonth, startDate, endDate, periodLabel } = bounds;
  const ledger = await fetchHostSalesLedger(hostId);
  if (!ledger.ok) {
    return { ok: false, error: ledger.error };
  }

  const monthSales = ledger.data.filter((sale) => {
    const dateKey = sale.eventDate || sale.paidAt.slice(0, 10);
    return inMonth(dateKey, startDate, endDate);
  });
  // 確定判定は「今」基準（過去月はほぼすべて確定）
  const confirmedSales = monthSales.filter((s) => isSaleConfirmed(s, now));
  const pendingSales = monthSales.filter((s) => !isSaleConfirmed(s, now));

  const events = buildBreakdownFromLedger(ledger.data, startDate, endDate, now);
  const confirmedGrossYen = confirmedSales.reduce((s, r) => s + r.amountYen, 0);
  const pendingGrossYen = pendingSales.reduce((s, r) => s + r.amountYen, 0);
  const {
    paymentFeeYen,
    platformFeeYen,
    payoutFeeYen,
    netYen,
  } = calcPayoutBreakdown(confirmedGrossYen);
  const grossYen = confirmedGrossYen + pendingGrossYen;
  const ticketCount = monthSales.reduce(
    (s, r) => s + Math.max(1, r.ticketQuantity),
    0,
  );
  const confirmedTicketCount = confirmedSales.reduce(
    (s, r) => s + Math.max(1, r.ticketQuantity),
    0,
  );

  const payoutRow = await fetchOwnPayoutRow(yearMonth);
  let payoutStatus: MonthPayoutDisplayStatus = 'none';
  if (payoutRow?.status === 'paid') {
    payoutStatus = 'paid';
  } else if (confirmedGrossYen > 0) {
    payoutStatus = 'awaiting_payout';
  } else if (pendingGrossYen > 0) {
    payoutStatus = 'awaiting_event';
  }

  if (__DEV__) {
    console.log('[sales] summary', {
      hostId,
      yearMonth,
      events: events.map((e) => ({
        eventId: e.eventId,
        title: e.eventTitle,
        tickets: e.ticketCount,
        grossYen: e.grossYen,
        paymentFeeYen: e.paymentFeeYen,
        platformFeeYen: e.platformFeeYen,
        netAfterPlatformYen: e.netAfterPlatformYen,
        confirmed: e.confirmed,
      })),
      confirmedGrossYen,
      paymentFeeYen,
      platformFeeYen,
      payoutFeeYen,
      netYen,
    });
  }

  return {
    ok: true,
    data: {
      periodLabel,
      year,
      month,
      yearMonth,
      grossYen,
      confirmedGrossYen,
      pendingGrossYen,
      paymentFeeYen,
      platformFeeYen,
      payoutFeeYen,
      netYen,
      ticketCount,
      confirmedTicketCount,
      events,
      payoutStatus,
      payoutPaidAt: payoutRow?.paid_at || undefined,
    },
  };
}

/** 振込ステータス変更を Realtime で購読（売上画面用） */
export function subscribeOwnPayoutUpdates(
  yearMonth: string,
  onChange: () => void,
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => undefined;

  let cancelled = false;
  let channel: ReturnType<typeof client.channel> | null = null;

  void resolveAuthUserId().then((hostId) => {
    if (cancelled || !hostId) return;
    channel = client
      .channel(`organizer_payouts:${hostId}:${yearMonth}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'organizer_payouts',
          filter: `host_id=eq.${hostId}`,
        },
        () => {
          onChange();
        },
      )
      .subscribe();
  });

  return () => {
    cancelled = true;
    if (channel) {
      void client.removeChannel(channel);
    }
  };
}

export function payoutStatusLabel(status: MonthPayoutDisplayStatus) {
  switch (status) {
    case 'paid':
      return '振込完了';
    case 'awaiting_payout':
      return '振込待ち（確定）';
    case 'awaiting_event':
      return '開催待ち（未確定）';
    default:
      return '売上なし';
  }
}

export { formatYenAmount };
