-- =============================================================================
-- 運営向け: 月次「誰にいくら振り込むか」集計クエリ
-- Supabase Dashboard → SQL Editor で実行してください。
--
-- 計算式（アプリ /admin/payouts と同一）:
--   決済手数料     = floor(売上 × 3.6%)
--   利用料         = floor(売上 × 10%)
--   振込手数料     = 控除後残高 > 0 なら 500 円（主催者・月あたり 1 回）
--   振込金額(純額) = 売上 − 決済手数料 − 利用料 − 振込手数料
--
-- 対象: status=paid かつイベント終了済みのチケット売上のみ
-- 月の指定: 下の year_month を '2026-03' 形式に置き換えて実行
--
-- 互換:
--   ticket_quantity / event_ends_at は後から追加された列のため、
--   未適用の DB でも動くよう to_jsonb 経由で参照しています（無い場合は 1 / null）。
--   列を正式追加する場合:
--     supabase/apply_event_ticket_sales_quantity.sql
--     supabase/apply_organizer_payouts.sql（event_ends_at 等）
-- =============================================================================

-- 1) 主催者ごとの振込一覧（口座付き）
with params as (
  select '2026-09''::text as year_month  -- ← ここを変更
),
bounds as (
  select
    year_month,
    (year_month || '-01')::date as start_date,
    (date_trunc('month', (year_month || '-01')::date)
      + interval '1 month' - interval '1 day')::date as end_date
  from params
),
confirmed_sales as (
  select
    s.host_id,
    s.event_id,
    coalesce(nullif(trim(s.event_title), ''), 'イベント') as event_title,
    left(coalesce(s.event_date::text, s.paid_at::text), 10) as event_date,
    -- ticket_quantity 未適用環境ではキーが無く null → 1 枚扱い
    greatest(
      1,
      coalesce((to_jsonb(s) ->> 'ticket_quantity')::integer, 1)
    ) as ticket_qty,
    greatest(0, s.amount_yen)::bigint as amount_yen,
    -- event_ends_at 未適用環境でも参照可能
    nullif(to_jsonb(s) ->> 'event_ends_at', '')::timestamptz as event_ends_at
  from public.event_ticket_sales s
  cross join bounds b
  where s.status = 'paid'
    and left(coalesce(s.event_date::text, s.paid_at::text), 10)
        between b.start_date::text and b.end_date::text
),
confirmed_sales_ended as (
  select *
  from confirmed_sales
  where
    (event_ends_at is not null and event_ends_at <= now())
    or (
      event_ends_at is null
      and event_date < current_date::text
    )
),
by_host as (
  select
    host_id,
    sum(amount_yen)::bigint as gross_yen,
    sum(ticket_qty)::int as ticket_count
  from confirmed_sales_ended
  group by host_id
),
fees as (
  select
    h.host_id,
    h.gross_yen,
    h.ticket_count,
    floor(h.gross_yen * 0.036)::bigint as payment_fee_yen,
    floor(h.gross_yen * 0.10)::bigint as platform_fee_yen,
    case
      when (h.gross_yen - floor(h.gross_yen * 0.036) - floor(h.gross_yen * 0.10)) > 0
        then 500
      else 0
    end::bigint as payout_fee_yen
  from by_host h
)
select
  f.host_id,
  coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(p.nickname), ''),
    '（名前未設定）'
  ) as host_name,
  b.year_month,
  f.ticket_count,
  f.gross_yen,
  f.payment_fee_yen,
  f.platform_fee_yen,
  f.payout_fee_yen,
  greatest(
    0,
    f.gross_yen - f.payment_fee_yen - f.platform_fee_yen - f.payout_fee_yen
  ) as net_yen,
  coalesce(op.status, 'pending') as payout_status,
  op.paid_at,
  ba.bank_name,
  ba.branch_name,
  ba.branch_number,
  ba.account_type,
  ba.account_number,
  ba.account_holder_kana,
  ba.notify_email
from fees f
cross join bounds b
left join public.profiles p on p.id::text = f.host_id::text
left join public.organizer_bank_accounts ba on ba.user_id::text = f.host_id::text
left join public.organizer_payouts op
  on op.host_id::text = f.host_id::text
 and op.year_month = b.year_month
order by net_yen desc, host_name;

-- =============================================================================
-- 2) イベント別内訳（主催者 × イベント）※必要なときだけ下を実行
-- =============================================================================
/*
with params as (
  select '2026-03'::text as year_month  -- ← ここを変更
),
bounds as (
  select
    year_month,
    (year_month || '-01')::date as start_date,
    (date_trunc('month', (year_month || '-01')::date)
      + interval '1 month' - interval '1 day')::date as end_date
  from params
),
confirmed_sales as (
  select
    s.host_id,
    s.event_id,
    coalesce(nullif(trim(s.event_title), ''), 'イベント') as event_title,
    left(coalesce(s.event_date::text, s.paid_at::text), 10) as event_date,
    greatest(
      1,
      coalesce((to_jsonb(s) ->> 'ticket_quantity')::integer, 1)
    ) as ticket_qty,
    greatest(0, s.amount_yen)::bigint as amount_yen,
    nullif(to_jsonb(s) ->> 'event_ends_at', '')::timestamptz as event_ends_at
  from public.event_ticket_sales s
  cross join bounds b
  where s.status = 'paid'
    and left(coalesce(s.event_date::text, s.paid_at::text), 10)
        between b.start_date::text and b.end_date::text
),
confirmed_sales_ended as (
  select *
  from confirmed_sales
  where
    (event_ends_at is not null and event_ends_at <= now())
    or (
      event_ends_at is null
      and event_date < current_date::text
    )
)
select
  host_id,
  event_id,
  event_title,
  event_date,
  sum(ticket_qty)::int as ticket_count,
  sum(amount_yen)::bigint as gross_yen,
  floor(sum(amount_yen) * 0.036)::bigint as payment_fee_yen,
  floor(sum(amount_yen) * 0.10)::bigint as platform_fee_yen,
  greatest(
    0,
    sum(amount_yen)
      - floor(sum(amount_yen) * 0.036)
      - floor(sum(amount_yen) * 0.10)
  )::bigint as net_after_fees_yen
from confirmed_sales_ended
group by host_id, event_id, event_title, event_date
order by host_id, event_date desc;
*/
