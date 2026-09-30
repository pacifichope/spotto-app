-- =============================================================================
-- events: 公開 SELECT（anon / authenticated）を確実に許可
-- Supabase SQL Editor で実行してください。
--
-- QA モックや「他アカウントで一覧が空」になる場合の修復用。
-- INSERT/UPDATE/DELETE は Firebase JWT sub（requesting_user_id）のまま。
-- 公開ステータス列は無く、events に INSERT された行＝公開扱い。
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

-- 旧・誤設定のホスト限定 SELECT があれば除去
drop policy if exists "events_select_own" on public.events;
drop policy if exists "events_select_authenticated" on public.events;
drop policy if exists "Users can view own events" on public.events;
drop policy if exists "Enable read access for all users" on public.events;

drop policy if exists "events_select_all" on public.events;
create policy "events_select_all"
  on public.events
  for select
  to anon, authenticated
  using (true);

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

-- 確認
select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'events'
order by cmd, policyname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'events'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

select count(*) as public_event_count from public.events;
