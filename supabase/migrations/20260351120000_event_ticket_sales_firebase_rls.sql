-- event_ticket_sales: Firebase Auth JWT 向け RLS + host トリガー修復
-- （詳細コメントは apply_event_ticket_sales_firebase_rls.sql を参照）

create or replace function public.requesting_user_id()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

grant execute on function public.requesting_user_id() to anon, authenticated, service_role;

alter table if exists public.event_ticket_sales
  drop constraint if exists event_ticket_sales_host_id_fkey;
alter table if exists public.event_ticket_sales
  drop constraint if exists event_ticket_sales_buyer_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_ticket_sales'
      and column_name = 'host_id'
      and data_type <> 'text'
  ) then
    alter table public.event_ticket_sales
      alter column host_id type text using host_id::text;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_ticket_sales'
      and column_name = 'buyer_id'
      and data_type <> 'text'
  ) then
    alter table public.event_ticket_sales
      alter column buyer_id type text using buyer_id::text;
  end if;
end $$;

alter table public.event_ticket_sales enable row level security;

alter table public.event_ticket_sales
  add column if not exists event_ends_at timestamptz;
alter table public.event_ticket_sales
  add column if not exists refunded_yen integer not null default 0;

grant select, insert, update on table public.event_ticket_sales to authenticated;
grant all on table public.event_ticket_sales to service_role;
revoke all on table public.event_ticket_sales from anon;

create or replace function public.event_ticket_sales_set_host()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
  sess text := session_user;
  uid text := public.requesting_user_id();
  ev record;
begin
  if uid is null then
    if jwt_role = 'service_role'
       or sess in ('postgres', 'supabase_admin')
       or sess like 'postgres%' then
      null;
    else
      raise exception 'not authenticated' using errcode = 'P0001';
    end if;
  end if;

  select id, host_id, title, event_date, price_yen, end_date, end_time
    into ev
  from public.events
  where id = new.event_id;

  if not found then
    raise exception 'event not found' using errcode = 'P0001';
  end if;

  new.host_id := ev.host_id::text;
  if uid is not null then
    new.buyer_id := uid;
  end if;

  if coalesce(trim(new.event_title), '') = '' then
    new.event_title := coalesce(ev.title, '');
  end if;
  if new.event_date is null and ev.event_date is not null then
    begin
      new.event_date := nullif(trim(ev.event_date::text), '')::date;
    exception
      when others then
        null;
    end;
  end if;
  if new.event_ends_at is null then
    if ev.end_date is not null and coalesce(trim(ev.end_time::text), '') <> '' then
      new.event_ends_at := (
        (ev.end_date::text || 'T' || left(trim(ev.end_time::text) || ':00', 8))::timestamp
        at time zone 'Asia/Tokyo'
      );
    elsif nullif(trim(ev.event_date::text), '') is not null then
      new.event_ends_at := (
        (trim(ev.event_date::text) || 'T23:59:59')::timestamp
        at time zone 'Asia/Tokyo'
      );
    end if;
  end if;

  if new.amount_yen is null or new.amount_yen <= 0 then
    new.amount_yen := greatest(1, coalesce(ev.price_yen, 1));
  end if;
  return new;
end;
$$;

drop trigger if exists event_ticket_sales_set_host on public.event_ticket_sales;
create trigger event_ticket_sales_set_host
  before insert or update on public.event_ticket_sales
  for each row
  execute function public.event_ticket_sales_set_host();

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'event_ticket_sales'
  loop
    execute format('drop policy if exists %I on public.event_ticket_sales', pol.policyname);
  end loop;
end $$;

create policy "event_ticket_sales_select_own"
  on public.event_ticket_sales for select to authenticated
  using (
    host_id = (select public.requesting_user_id())
    or buyer_id = (select public.requesting_user_id())
  );

create policy "event_ticket_sales_insert_buyer"
  on public.event_ticket_sales for insert to authenticated
  with check (buyer_id = (select public.requesting_user_id()));

create policy "event_ticket_sales_update_parties"
  on public.event_ticket_sales for update to authenticated
  using (
    host_id = (select public.requesting_user_id())
    or buyer_id = (select public.requesting_user_id())
  )
  with check (
    host_id = (select public.requesting_user_id())
    or buyer_id = (select public.requesting_user_id())
  );

update public.event_ticket_sales s
set host_id = e.host_id::text
from public.events e
where s.event_id = e.id
  and s.host_id is distinct from e.host_id::text;

update public.event_ticket_sales s
set
  event_date = coalesce(
    s.event_date,
    nullif(trim(e.event_date::text), '')::date
  ),
  event_title = case
    when coalesce(trim(s.event_title), '') = '' then coalesce(e.title, s.event_title)
    else s.event_title
  end,
  event_ends_at = coalesce(
    s.event_ends_at,
    case
      when e.end_date is not null and coalesce(trim(e.end_time::text), '') <> '' then
        ((e.end_date::text || 'T' || left(trim(e.end_time::text) || ':00', 8))::timestamp
          at time zone 'Asia/Tokyo')
      when nullif(trim(e.event_date::text), '') is not null then
        ((trim(e.event_date::text) || 'T23:59:59')::timestamp at time zone 'Asia/Tokyo')
      else null
    end
  )
from public.events e
where s.event_id = e.id
  and (
    s.event_date is null
    or s.event_ends_at is null
    or coalesce(trim(s.event_title), '') = ''
  );

notify pgrst, 'reload schema';
