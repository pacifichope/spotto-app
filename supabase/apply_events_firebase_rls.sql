-- =============================================================================
-- events テーブル: Firebase Auth JWT 向け INSERT/UPDATE/DELETE RLS 修復
-- Supabase SQL Editor で実行してください。
--
-- 背景:
--   auth.uid() は GoTrue の UUID 向け。Firebase UID（文字列）では NULL になり、
--   host_id = auth.uid() のポリシーだと INSERT が常に RLS 違反になる。
--   → auth.jwt()->>'sub'（= requesting_user_id()）と比較する。
--
-- 前提:
--   1) Authentication → Third-party Auth → Firebase を有効化
--   2) JWT に role: "authenticated" があること（アプリの ensure-claims）
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

-- host_id を text に（Firebase UID）
alter table if exists public.events drop constraint if exists events_host_id_fkey;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'events'
      and column_name = 'host_id'
      and data_type <> 'text'
  ) then
    alter table public.events
      alter column host_id type text using host_id::text;
  end if;
end $$;

alter table public.events enable row level security;

grant select on table public.events to anon, authenticated;
grant insert, update, delete on table public.events to authenticated;

-- 閲覧は公開のまま
drop policy if exists "events_select_all" on public.events;
create policy "events_select_all"
  on public.events for select
  to anon, authenticated
  using (true);

-- 書込: JWT sub = host_id（auth.uid() は使わない）
drop policy if exists "events_insert_own" on public.events;
drop policy if exists "events_update_own" on public.events;
drop policy if exists "events_delete_own" on public.events;

create policy "events_insert_own"
  on public.events for insert
  to authenticated
  with check (
    host_id is not null
    and host_id = (select public.requesting_user_id())
  );

create policy "events_update_own"
  on public.events for update
  to authenticated
  using (host_id = (select public.requesting_user_id()))
  with check (host_id = (select public.requesting_user_id()));

create policy "events_delete_own"
  on public.events for delete
  to authenticated
  using (host_id = (select public.requesting_user_id()));

-- 確認用
select
  policyname,
  cmd,
  roles,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename = 'events'
order by cmd, policyname;
