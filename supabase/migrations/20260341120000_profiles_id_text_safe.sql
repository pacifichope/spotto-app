-- profiles.id を uuid → text へ安全に変更（ポリシー依存を回避）
-- DROP POLICY → ALTER COLUMN → CREATE POLICY

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

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

alter table if exists public.profiles drop constraint if exists profiles_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
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
revoke all on table public.profiles from anon;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = (select public.requesting_user_id()));

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = (select public.requesting_user_id()));

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select public.requesting_user_id()))
  with check (id = (select public.requesting_user_id()));

create policy "profiles_delete_own"
  on public.profiles for delete to authenticated
  using (id = (select public.requesting_user_id()));
