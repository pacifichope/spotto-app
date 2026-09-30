-- event_ticket_sales: チケット枚数を台帳に保持（イベント別売上の正確な内訳用）
-- 同一 (event_id, buyer_id) の再決済はアプリ側で加算（上書きしない）

alter table public.event_ticket_sales
  add column if not exists ticket_quantity integer not null default 1;

alter table public.event_ticket_sales
  drop constraint if exists event_ticket_sales_ticket_quantity_check;

alter table public.event_ticket_sales
  add constraint event_ticket_sales_ticket_quantity_check
  check (ticket_quantity >= 1);

-- 同一決済の二重記録防止（null は複数可）
create unique index if not exists event_ticket_sales_payment_intent_uidx
  on public.event_ticket_sales (payment_intent_id)
  where payment_intent_id is not null and length(trim(payment_intent_id)) > 0;

comment on column public.event_ticket_sales.ticket_quantity is
  '購入枚数。amount_yen は単価×枚数の合計。';

notify pgrst, 'reload schema';
