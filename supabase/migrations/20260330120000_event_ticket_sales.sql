-- チケット売上台帳（主催者ダッシュボード用）
-- 参加者の決済成功時に buyer が insert。主催者は host_id = auth.uid() のみ閲覧可。

create table if not exists public.event_ticket_sales (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  host_id uuid not null references auth.users (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  amount_yen integer not null check (amount_yen > 0),
  payment_intent_id text,
  status text not null default 'paid'
    check (status in ('paid', 'refunded')),
  paid_at timestamptz not null default now(),
  refunded_at timestamptz,
  event_title text not null default '',
  event_date date,
  created_at timestamptz not null default now(),
  constraint event_ticket_sales_buyer_unique unique (event_id, buyer_id)
);

create index if not exists event_ticket_sales_host_paid_at_idx
  on public.event_ticket_sales (host_id, paid_at desc);

create index if not exists event_ticket_sales_host_event_date_idx
  on public.event_ticket_sales (host_id, event_date);

create index if not exists event_ticket_sales_event_id_idx
  on public.event_ticket_sales (event_id);

alter table public.event_ticket_sales enable row level security;

-- insert 前に events.host_id を強制セット（改ざん防止）
create or replace function public.event_ticket_sales_set_host()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id, host_id, title, event_date, price_yen
    into ev
  from public.events
  where id = new.event_id;

  if not found then
    raise exception 'event not found';
  end if;

  new.host_id := ev.host_id;
  new.buyer_id := auth.uid();
  if coalesce(trim(new.event_title), '') = '' then
    new.event_title := coalesce(ev.title, '');
  end if;
  if new.event_date is null then
    new.event_date := ev.event_date;
  end if;
  if new.amount_yen is null or new.amount_yen <= 0 then
    new.amount_yen := greatest(1, coalesce(ev.price_yen, 1));
  end if;
  return new;
end;
$$;

drop trigger if exists event_ticket_sales_set_host on public.event_ticket_sales;
create trigger event_ticket_sales_set_host
  before insert on public.event_ticket_sales
  for each row
  execute function public.event_ticket_sales_set_host();

drop policy if exists "event_ticket_sales_select_own" on public.event_ticket_sales;
create policy "event_ticket_sales_select_own"
  on public.event_ticket_sales for select to authenticated
  using (host_id = auth.uid() or buyer_id = auth.uid());

drop policy if exists "event_ticket_sales_insert_buyer" on public.event_ticket_sales;
create policy "event_ticket_sales_insert_buyer"
  on public.event_ticket_sales for insert to authenticated
  with check (buyer_id = auth.uid());

drop policy if exists "event_ticket_sales_update_parties" on public.event_ticket_sales;
create policy "event_ticket_sales_update_parties"
  on public.event_ticket_sales for update to authenticated
  using (host_id = auth.uid() or buyer_id = auth.uid())
  with check (host_id = auth.uid() or buyer_id = auth.uid());

grant select, insert, update on table public.event_ticket_sales to authenticated;
grant all on table public.event_ticket_sales to service_role;
revoke all on table public.event_ticket_sales from anon;

-- 退会クリーンアップに売上行を追加
create or replace function public.delete_own_app_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.event_ticket_sales where host_id = uid or buyer_id = uid;
  delete from public.organizer_bank_accounts where user_id = uid;
  delete from public.device_push_tokens where user_id = uid;
  delete from public.chat_messages where sender_id = uid or dm_user_id = uid;
  delete from public.event_favorites where user_id = uid;
  delete from public.event_participants where user_id = uid;
  delete from public.events where host_id = uid;
  delete from public.blocks
  where blocker_id = uid or blocked_id = uid::text;
  delete from public.profiles where id = uid;
end;
$$;

revoke all on function public.delete_own_app_data() from public;
grant execute on function public.delete_own_app_data() to authenticated;
grant execute on function public.delete_own_app_data() to service_role;

notify pgrst, 'reload schema';
