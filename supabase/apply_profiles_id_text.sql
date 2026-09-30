-- =============================================================================
-- profiles.id を uuid → text（Firebase UID）へ安全に変更する
-- Supabase SQL Editor で実行してください。
--
-- エラー例:
--   cannot alter type of a column used in a policy definition
--   (profiles_select_own depends on column "id")
--
-- 手順:
--   1. 依存 RLS ポリシーを DROP
--   2. FK を外し、id を text に ALTER
--   3. Firebase JWT 向けポリシーを再 CREATE
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

-- 1) 依存ポリシーを一時削除
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

-- 2) FK 解除 + 型変更（既に text ならスキップ）
alter table if exists public.profiles
  drop constraint if exists profiles_id_fkey;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'id'
      and data_type <> 'text'
  ) then
    alter table public.profiles
      alter column id type text using id::text;
  end if;
end $$;

alter table public.profiles enable row level security;
grant select, insert, update, delete on table public.profiles to authenticated;
grant all on table public.profiles to service_role;
revoke all on table public.profiles from anon;

-- 3) ポリシー再作成（Firebase JWT sub）
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select public.requesting_user_id()));

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = (select public.requesting_user_id()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select public.requesting_user_id()))
  with check (id = (select public.requesting_user_id()));

create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (id = (select public.requesting_user_id()));

notify pgrst, 'reload schema';

-- 確認
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'id';

select
  policyname,
  cmd,
  roles,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by cmd, policyname;
