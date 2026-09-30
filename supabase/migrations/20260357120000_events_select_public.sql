-- =============================================================================
-- events: 公開 SELECT を再保証（他ユーザー / ゲストが一覧・詳細を読める）
-- INSERT/UPDATE/DELETE は主催者（JWT sub = host_id）のみ。
-- =============================================================================

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

alter table if exists public.events enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.events to anon, authenticated;
grant insert, update, delete on table public.events to authenticated;
grant all on table public.events to service_role;

-- 旧・誤設定のホスト限定 SELECT があれば除去（名前ゆれ）
drop policy if exists "events_select_own" on public.events;
drop policy if exists "events_select_authenticated" on public.events;
drop policy if exists "Users can view own events" on public.events;
drop policy if exists "Enable read access for all users" on public.events;

-- 公開閲覧: ログイン不要（anon）でも全行 SELECT 可
drop policy if exists "events_select_all" on public.events;
create policy "events_select_all"
  on public.events
  for select
  to anon, authenticated
  using (true);

-- 書込は自分の host_id のみ
drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own"
  on public.events for insert
  to authenticated
  with check (
    host_id is not null
    and host_id = (select public.requesting_user_id())
  );

drop policy if exists "events_update_own" on public.events;
create policy "events_update_own"
  on public.events for update
  to authenticated
  using (host_id = (select public.requesting_user_id()))
  with check (host_id = (select public.requesting_user_id()));

drop policy if exists "events_delete_own" on public.events;
create policy "events_delete_own"
  on public.events for delete
  to authenticated
  using (host_id = (select public.requesting_user_id()));
