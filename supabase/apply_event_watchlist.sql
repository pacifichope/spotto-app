-- 手動適用: supabase/apply_event_watchlist.sql
-- 満員イベントの空き通知希望（ウォッチリスト）。決済・自動繰り上げなし。

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

create table if not exists public.event_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint event_watchlist_unique unique (user_id, event_id)
);

create index if not exists event_watchlist_user_id_idx
  on public.event_watchlist (user_id);
create index if not exists event_watchlist_event_id_idx
  on public.event_watchlist (event_id);

alter table public.event_watchlist enable row level security;

grant select, insert, delete on table public.event_watchlist to authenticated;
grant all on table public.event_watchlist to service_role;
revoke all on table public.event_watchlist from anon;

drop policy if exists "event_watchlist_select_own" on public.event_watchlist;
create policy "event_watchlist_select_own"
  on public.event_watchlist for select
  to authenticated
  using (user_id = (select public.requesting_user_id()));

drop policy if exists "event_watchlist_insert_own" on public.event_watchlist;
create policy "event_watchlist_insert_own"
  on public.event_watchlist for insert
  to authenticated
  with check (
    user_id is not null
    and user_id = (select public.requesting_user_id())
  );

drop policy if exists "event_watchlist_delete_own" on public.event_watchlist;
create policy "event_watchlist_delete_own"
  on public.event_watchlist for delete
  to authenticated
  using (user_id = (select public.requesting_user_id()));

notify pgrst, 'reload schema';
