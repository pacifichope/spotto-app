-- event_ticket_sales: チケット枚数カラム（手動適用用）
-- 詳細は migrations/20260354120000_event_ticket_sales_quantity.sql

alter table public.event_ticket_sales
  add column if not exists ticket_quantity integer not null default 1;

alter table public.event_ticket_sales
  drop constraint if exists event_ticket_sales_ticket_quantity_check;

alter table public.event_ticket_sales
  add constraint event_ticket_sales_ticket_quantity_check
  check (ticket_quantity >= 1);

create unique index if not exists event_ticket_sales_payment_intent_uidx
  on public.event_ticket_sales (payment_intent_id)
  where payment_intent_id is not null and length(trim(payment_intent_id)) > 0;

notify pgrst, 'reload schema';
