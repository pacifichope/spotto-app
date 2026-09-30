-- Firebase Auth UID（text）前提への移行
-- Supabase GoTrue / auth.users FK を外し、auth.jwt()->>'sub' で RLS する。
-- Dashboard: Authentication → Third-party Auth → Firebase を有効化し project_id を設定すること。
-- 既存の UUID 行は Firebase UID と一致しないため、必要なら別途データ移行する。
--
-- 重要: ポリシーが参照する列の型変更は
--   1) DROP POLICY → 2) ALTER COLUMN → 3) CREATE POLICY
-- の順で行う（依存ポリシーがあると ALTER が失敗する）。

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

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

alter table if exists public.profiles drop constraint if exists profiles_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'id' and data_type <> 'text'
  ) then
    alter table public.profiles alter column id type text using id::text;
  end if;
end $$;

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

-- ---------------------------------------------------------------------------
-- blocks
-- ---------------------------------------------------------------------------
drop policy if exists "blocks_select" on public.blocks;
drop policy if exists "blocks_insert_own" on public.blocks;
drop policy if exists "blocks_update_own" on public.blocks;
drop policy if exists "blocks_delete_own" on public.blocks;

alter table if exists public.blocks drop constraint if exists blocks_blocker_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'blocks'
      and column_name = 'blocker_id' and data_type <> 'text'
  ) then
    alter table public.blocks alter column blocker_id type text using blocker_id::text;
  end if;
end $$;

create policy "blocks_select"
  on public.blocks for select to authenticated
  using (
    blocker_id = (select public.requesting_user_id())
    or blocked_id = (select public.requesting_user_id())
  );
create policy "blocks_insert_own"
  on public.blocks for insert to authenticated
  with check (blocker_id = (select public.requesting_user_id()));
create policy "blocks_update_own"
  on public.blocks for update to authenticated
  using (blocker_id = (select public.requesting_user_id()))
  with check (blocker_id = (select public.requesting_user_id()));
create policy "blocks_delete_own"
  on public.blocks for delete to authenticated
  using (blocker_id = (select public.requesting_user_id()));

-- ---------------------------------------------------------------------------
-- events.host_id
-- ---------------------------------------------------------------------------
drop policy if exists "events_insert_own" on public.events;
drop policy if exists "events_update_own" on public.events;
drop policy if exists "events_delete_own" on public.events;

alter table if exists public.events drop constraint if exists events_host_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events'
      and column_name = 'host_id' and data_type <> 'text'
  ) then
    alter table public.events alter column host_id type text using host_id::text;
  end if;
end $$;

create policy "events_insert_own"
  on public.events for insert to authenticated
  with check (host_id = (select public.requesting_user_id()));
create policy "events_update_own"
  on public.events for update to authenticated
  using (host_id = (select public.requesting_user_id()))
  with check (host_id = (select public.requesting_user_id()));
create policy "events_delete_own"
  on public.events for delete to authenticated
  using (host_id = (select public.requesting_user_id()));

-- ---------------------------------------------------------------------------
-- event_participants
-- ---------------------------------------------------------------------------
drop policy if exists "event_participants_insert_own" on public.event_participants;
drop policy if exists "event_participants_update_own" on public.event_participants;
drop policy if exists "event_participants_delete_own" on public.event_participants;

alter table if exists public.event_participants
  drop constraint if exists event_participants_user_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_participants'
      and column_name = 'user_id' and data_type <> 'text'
  ) then
    alter table public.event_participants
      alter column user_id type text using user_id::text;
  end if;
end $$;

create policy "event_participants_insert_own"
  on public.event_participants for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));
create policy "event_participants_update_own"
  on public.event_participants for update to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));
create policy "event_participants_delete_own"
  on public.event_participants for delete to authenticated
  using (user_id = (select public.requesting_user_id()));

-- ---------------------------------------------------------------------------
-- event_favorites
-- ---------------------------------------------------------------------------
drop policy if exists "event_favorites_select_own" on public.event_favorites;
drop policy if exists "event_favorites_insert_own" on public.event_favorites;
drop policy if exists "event_favorites_delete_own" on public.event_favorites;

alter table if exists public.event_favorites
  drop constraint if exists event_favorites_user_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_favorites'
      and column_name = 'user_id' and data_type <> 'text'
  ) then
    alter table public.event_favorites
      alter column user_id type text using user_id::text;
  end if;
end $$;

create policy "event_favorites_select_own"
  on public.event_favorites for select to authenticated
  using (user_id = (select public.requesting_user_id()));
create policy "event_favorites_insert_own"
  on public.event_favorites for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));
create policy "event_favorites_delete_own"
  on public.event_favorites for delete to authenticated
  using (user_id = (select public.requesting_user_id()));

-- ---------------------------------------------------------------------------
-- chat_messages（ポリシーが dm_user_id / sender_id を参照）
-- ---------------------------------------------------------------------------
drop policy if exists "chat_messages_select" on public.chat_messages;
drop policy if exists "chat_messages_insert" on public.chat_messages;
drop policy if exists "chat_messages_update_own" on public.chat_messages;
drop policy if exists "chat_messages_delete_own" on public.chat_messages;
drop policy if exists "chat_messages_select_participant" on public.chat_messages;
drop policy if exists "chat_messages_insert_own" on public.chat_messages;

alter table if exists public.chat_messages
  drop constraint if exists chat_messages_dm_user_id_fkey;
alter table if exists public.chat_messages
  drop constraint if exists chat_messages_sender_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_messages'
      and column_name = 'dm_user_id' and data_type <> 'text'
  ) then
    alter table public.chat_messages
      alter column dm_user_id type text using dm_user_id::text;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_messages'
      and column_name = 'sender_id' and data_type <> 'text'
  ) then
    alter table public.chat_messages
      alter column sender_id type text using sender_id::text;
  end if;
end $$;

-- チャット RLS の詳細は apply_chat_messages_firebase_rls.sql を推奨。
-- ここでは最低限の本人送信ポリシーを戻す。
create policy "chat_messages_select"
  on public.chat_messages for select to authenticated
  using (
    dm_user_id = (select public.requesting_user_id())
    or sender_id = (select public.requesting_user_id())
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.host_id = (select public.requesting_user_id())
    )
  );
create policy "chat_messages_insert"
  on public.chat_messages for insert to authenticated
  with check (sender_id = (select public.requesting_user_id()));
create policy "chat_messages_update_own"
  on public.chat_messages for update to authenticated
  using (sender_id = (select public.requesting_user_id()))
  with check (sender_id = (select public.requesting_user_id()));
create policy "chat_messages_delete_own"
  on public.chat_messages for delete to authenticated
  using (sender_id = (select public.requesting_user_id()));

-- ---------------------------------------------------------------------------
-- device_push_tokens
-- ---------------------------------------------------------------------------
drop policy if exists "device_push_tokens_select_own" on public.device_push_tokens;
drop policy if exists "device_push_tokens_insert_own" on public.device_push_tokens;
drop policy if exists "device_push_tokens_update_own" on public.device_push_tokens;
drop policy if exists "device_push_tokens_delete_own" on public.device_push_tokens;

alter table if exists public.device_push_tokens
  drop constraint if exists device_push_tokens_user_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'device_push_tokens'
      and column_name = 'user_id' and data_type <> 'text'
  ) then
    alter table public.device_push_tokens
      alter column user_id type text using user_id::text;
  end if;
end $$;

create policy "device_push_tokens_select_own"
  on public.device_push_tokens for select to authenticated
  using (user_id = (select public.requesting_user_id()));
create policy "device_push_tokens_insert_own"
  on public.device_push_tokens for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));
create policy "device_push_tokens_update_own"
  on public.device_push_tokens for update to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));
create policy "device_push_tokens_delete_own"
  on public.device_push_tokens for delete to authenticated
  using (user_id = (select public.requesting_user_id()));

-- ---------------------------------------------------------------------------
-- organizer_bank_accounts
-- ---------------------------------------------------------------------------
drop policy if exists "organizer_bank_accounts_select_own" on public.organizer_bank_accounts;
drop policy if exists "organizer_bank_accounts_insert_own" on public.organizer_bank_accounts;
drop policy if exists "organizer_bank_accounts_update_own" on public.organizer_bank_accounts;
drop policy if exists "organizer_bank_accounts_delete_own" on public.organizer_bank_accounts;

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

drop function if exists public.organizer_bank_accounts_set_owner() cascade;

drop trigger if exists organizer_bank_accounts_enforce_owner on public.organizer_bank_accounts;
drop trigger if exists organizer_bank_accounts_set_owner on public.organizer_bank_accounts;
create trigger organizer_bank_accounts_enforce_owner
  before insert or update on public.organizer_bank_accounts
  for each row
  execute function public.organizer_bank_accounts_enforce_owner();

create policy "organizer_bank_accounts_select_own"
  on public.organizer_bank_accounts for select to authenticated
  using (user_id = (select public.requesting_user_id()));
create policy "organizer_bank_accounts_insert_own"
  on public.organizer_bank_accounts for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));
create policy "organizer_bank_accounts_update_own"
  on public.organizer_bank_accounts for update to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));
create policy "organizer_bank_accounts_delete_own"
  on public.organizer_bank_accounts for delete to authenticated
  using (user_id = (select public.requesting_user_id()));

grant select, insert, update, delete on table public.organizer_bank_accounts to authenticated;
revoke all on table public.organizer_bank_accounts from anon;

-- event_ticket_sales / organizer_payouts（存在する場合・ポリシー依存があれば同様に DROP してから）
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'event_ticket_sales'
  ) then
    alter table public.event_ticket_sales drop constraint if exists event_ticket_sales_host_id_fkey;
    alter table public.event_ticket_sales drop constraint if exists event_ticket_sales_buyer_id_fkey;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'event_ticket_sales'
        and column_name = 'host_id' and data_type <> 'text'
    ) then
      alter table public.event_ticket_sales alter column host_id type text using host_id::text;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'event_ticket_sales'
        and column_name = 'buyer_id' and data_type <> 'text'
    ) then
      alter table public.event_ticket_sales alter column buyer_id type text using buyer_id::text;
    end if;
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'organizer_payouts'
  ) then
    alter table public.organizer_payouts drop constraint if exists organizer_payouts_host_id_fkey;
    alter table public.organizer_payouts drop constraint if exists organizer_payouts_updated_by_fkey;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'organizer_payouts'
        and column_name = 'host_id' and data_type <> 'text'
    ) then
      alter table public.organizer_payouts alter column host_id type text using host_id::text;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'organizer_payouts'
        and column_name = 'updated_by' and data_type <> 'text'
    ) then
      alter table public.organizer_payouts alter column updated_by type text using updated_by::text;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
