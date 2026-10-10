import type { PublicEvent } from '@/lib/types';

const DEFAULT_CANCEL_POLICY =
  '開催の2日前までキャンセル無料、以降は返金なし';

export type CancelPolicyRule =
  | { kind: 'none' }
  | { kind: 'days'; days: number }
  | { kind: 'hours'; hours: number };

export type RefundPolicyRow = {
  requestTimeLabel: string;
  refundRateLabel: string;
  refundAmountYen: number;
  refundRatePercent: number;
};

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime());
}

function parseEventDateTime(date: string, time: string) {
  const stamp = String(date || '').trim();
  const clock = String(time || '').trim() || '00:00';
  const normalized = /^\d{1,2}:\d{2}$/.test(clock) ? `${clock}:00` : clock;
  const ms = Date.parse(`${stamp}T${normalized}`);
  return new Date(Number.isFinite(ms) ? ms : NaN);
}

export function eventStartAt(event: Pick<PublicEvent, 'eventDate' | 'eventTime'>) {
  return parseEventDateTime(event.eventDate, event.eventTime);
}

export function formatRefundDeadline(date: Date) {
  if (!isValidDate(date)) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hh}:${mm}`;
}

export function parseCancelPolicyRule(policy?: string | null): CancelPolicyRule {
  const text = String(policy ?? '').trim() || DEFAULT_CANCEL_POLICY;
  if (/(^|[、,。\s])返金不可/.test(text) || text === '返金不可') {
    return { kind: 'none' };
  }
  if (/(^|[、。\s])前日/.test(text) && !/\d+\s*日前/.test(text)) {
    return { kind: 'days', days: 1 };
  }
  const dayMatch = text.match(/(\d+)\s*日前/);
  if (dayMatch) {
    return { kind: 'days', days: Math.max(0, Number(dayMatch[1]) || 0) };
  }
  const hourMatch = text.match(/(\d+)\s*時間前/);
  if (hourMatch) {
    return { kind: 'hours', hours: Math.max(0, Number(hourMatch[1]) || 0) };
  }
  return { kind: 'days', days: 2 };
}

export function refundCutoffAt(
  event: Pick<PublicEvent, 'eventDate' | 'eventTime' | 'cancelPolicy'>,
): Date | null {
  const rule = parseCancelPolicyRule(event.cancelPolicy);
  if (rule.kind === 'none') return null;
  const start = eventStartAt(event);
  if (!isValidDate(start)) return null;
  if (rule.kind === 'hours') {
    return new Date(start.getTime() - rule.hours * 60 * 60 * 1000);
  }
  const cutoff = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
    start.getHours(),
    start.getMinutes(),
    0,
    0,
  );
  cutoff.setDate(cutoff.getDate() - rule.days);
  return cutoff;
}

function formatRefundWindowLead(rule: CancelPolicyRule, t: TranslateFn) {
  if (rule.kind === 'none') return t('payment.refundLeadNone');
  if (rule.kind === 'hours') {
    return t('payment.refundLeadHours', { count: rule.hours });
  }
  if (rule.days === 1) return t('payment.refundLeadDayBefore');
  return t('payment.refundLeadDays', { count: rule.days });
}

function refundYenForRate(totalYen: number, ratePercent: number) {
  const paid = Math.max(0, Math.floor(Number(totalYen) || 0));
  const rate = Math.max(0, Math.min(100, Math.floor(Number(ratePercent) || 0)));
  return Math.floor((paid * rate) / 100);
}

export function cancelPolicySummary(
  event: Pick<PublicEvent, 'cancelPolicy' | 'priceYen'>,
): string {
  const paid = Math.floor(Number(event.priceYen) || 0) > 0;
  const explicit = event.cancelPolicy?.trim() || '';
  if (paid) return explicit || DEFAULT_CANCEL_POLICY;
  return explicit || '';
}

export function buildRefundPolicyRows(
  event: Pick<PublicEvent, 'eventDate' | 'eventTime' | 'cancelPolicy' | 'priceYen'>,
  amountYen: number,
  t: TranslateFn,
): RefundPolicyRow[] {
  const paidYen = Math.max(0, Math.floor(Number(amountYen) || 0));
  const rule = parseCancelPolicyRule(event.cancelPolicy);

  if (rule.kind === 'none') {
    return [
      {
        requestTimeLabel: t('payment.refundAlways'),
        refundRateLabel: '0%',
        refundRatePercent: 0,
        refundAmountYen: 0,
      },
    ];
  }

  const start = eventStartAt(event);
  const cutoff = refundCutoffAt(event);
  const lead = formatRefundWindowLead(rule, t);

  if (!cutoff || !isValidDate(start)) {
    return [
      {
        requestTimeLabel: `${lead}\n${t('payment.refundUnknownStart')}`,
        refundRateLabel: '100%',
        refundRatePercent: 100,
        refundAmountYen: refundYenForRate(paidYen, 100),
      },
      {
        requestTimeLabel: t('payment.refundAfterDeadlineAbove'),
        refundRateLabel: '0%',
        refundRatePercent: 0,
        refundAmountYen: 0,
      },
    ];
  }

  const deadline = formatRefundDeadline(cutoff);
  return [
    {
      requestTimeLabel: t('payment.refundUntil', { deadline, lead }),
      refundRateLabel: '100%',
      refundRatePercent: 100,
      refundAmountYen: refundYenForRate(paidYen, 100),
    },
    {
      requestTimeLabel: t('payment.refundAfter', { deadline }),
      refundRateLabel: '0%',
      refundRatePercent: 0,
      refundAmountYen: 0,
    },
  ];
}

export function spotsLeft(event: Pick<PublicEvent, 'capacity' | 'joinedCount'>) {
  const capacity = Math.max(0, Math.floor(Number(event.capacity) || 0));
  if (capacity <= 0) return 99;
  return Math.max(0, capacity - Math.max(0, Math.floor(Number(event.joinedCount) || 0)));
}

export function formatCheckoutSchedule(
  event: Pick<PublicEvent, 'eventDate' | 'eventTime' | 'endDate' | 'endTime'>,
) {
  const start = eventStartAt(event);
  if (!isValidDate(start)) return '';
  const startLabel = formatRefundDeadline(start);
  const endClock = String(event.endTime || '').trim();
  if (!endClock) return startLabel;
  const endDate = String(event.endDate || event.eventDate || '').trim();
  const end = parseEventDateTime(endDate, endClock);
  if (!isValidDate(end)) return `${startLabel} ~ ${endClock}`;
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) {
    const hh = String(end.getHours()).padStart(2, '0');
    const mm = String(end.getMinutes()).padStart(2, '0');
    return `${startLabel} ~ ${hh}:${mm}`;
  }
  return `${startLabel} ~ ${formatRefundDeadline(end)}`;
}

export function formatYenAmount(yen: number) {
  const amount = Math.max(0, Math.floor(Number(yen) || 0)).toLocaleString('ja-JP');
  return `${amount}円`;
}
