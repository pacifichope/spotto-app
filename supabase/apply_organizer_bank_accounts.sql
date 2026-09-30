-- 主催者振込口座（本人のみ読み書き。profiles には載せない）
-- user_id は Firebase UID（text）。auth.users FK は付けない。
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

create table if not exists public.organizer_bank_accounts (
  user_id text primary key,
  bank_name text not null,
  branch_name text not null,
  account_type text not null check (account_type in ('ordinary', 'checking')),
  account_number text not null,
  account_holder_kana text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_bank_accounts_bank_name_len
    check (char_length(trim(bank_name)) between 1 and 80),
  constraint organizer_bank_accounts_branch_name_len
    check (char_length(trim(branch_name)) between 1 and 80),
  constraint organizer_bank_accounts_number_digits
    check (account_number ~ '^[0-9]{7,8}$'),
  constraint organizer_bank_accounts_holder_kana_len
    check (char_length(trim(account_holder_kana)) between 1 and 80)
);

-- 既存 DB が uuid + auth.users FK の場合の移行
alter table if exists public.organizer_bank_accounts
  drop constraint if exists organizer_bank_accounts_user_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizer_bank_accounts'
      and column_name = 'user_id'
      and data_type <> 'text'
  ) then
    alter table public.organizer_bank_accounts
      alter column user_id type text using user_id::text;
  end if;
end $$;

create index if not exists organizer_bank_accounts_updated_at_idx
  on public.organizer_bank_accounts (updated_at desc);

alter table public.organizer_bank_accounts enable row level security;

drop policy if exists "organizer_bank_accounts_select_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_select_own"
  on public.organizer_bank_accounts for select to authenticated
  using (user_id = (select public.requesting_user_id()));

drop policy if exists "organizer_bank_accounts_insert_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_insert_own"
  on public.organizer_bank_accounts for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "organizer_bank_accounts_update_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_update_own"
  on public.organizer_bank_accounts for update to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "organizer_bank_accounts_delete_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_delete_own"
  on public.organizer_bank_accounts for delete to authenticated
  using (user_id = (select public.requesting_user_id()));

grant select, insert, update, delete on table public.organizer_bank_accounts to authenticated;
grant all on table public.organizer_bank_accounts to service_role;
revoke all on table public.organizer_bank_accounts from anon;

-- 退会時に口座も削除（Firebase JWT sub）
create or replace function public.delete_own_app_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text := public.requesting_user_id();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.organizer_bank_accounts where user_id = uid;
  delete from public.device_push_tokens where user_id = uid;
  delete from public.chat_messages where sender_id = uid or dm_user_id = uid;
  delete from public.event_favorites where user_id = uid;
  delete from public.event_participants where user_id = uid;
  delete from public.events where host_id = uid;
  delete from public.blocks
  where blocker_id = uid or blocked_id = uid;
  delete from public.profiles where id = uid;
end;
$$;

revoke all on function public.delete_own_app_data() from public;
grant execute on function public.delete_own_app_data() to authenticated;
grant execute on function public.delete_own_app_data() to service_role;

notify pgrst, 'reload schema';
-- 振込口座: user_id を常に JWT sub に固定（Firebase Auth）
create or replace function public.requesting_user_id()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

create or replace function public.organizer_bank_accounts_enforce_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
  sess text := session_user;
  uid text := public.requesting_user_id();
begin
  if uid is null then
    if jwt_role = 'service_role'
       or sess in ('postgres', 'supabase_admin')
       or sess like 'postgres%' then
      new.updated_at := coalesce(new.updated_at, now());
      return new;
    end if;
    raise exception 'not authenticated' using errcode = 'P0001';
  end if;
  new.user_id := uid;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organizer_bank_accounts_enforce_owner on public.organizer_bank_accounts;
create trigger organizer_bank_accounts_enforce_owner
  before insert or update on public.organizer_bank_accounts
  for each row
  execute function public.organizer_bank_accounts_enforce_owner();

-- RLS 再確認（本人のみ・Firebase JWT）
drop policy if exists "organizer_bank_accounts_select_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_select_own"
  on public.organizer_bank_accounts for select to authenticated
  using (user_id = (select public.requesting_user_id()));

drop policy if exists "organizer_bank_accounts_insert_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_insert_own"
  on public.organizer_bank_accounts for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "organizer_bank_accounts_update_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_update_own"
  on public.organizer_bank_accounts for update to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "organizer_bank_accounts_delete_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_delete_own"
  on public.organizer_bank_accounts for delete to authenticated
  using (user_id = (select public.requesting_user_id()));

revoke all on table public.organizer_bank_accounts from anon;

notify pgrst, 'reload schema';
