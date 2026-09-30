-- =============================================================================
-- Firebase Auth + Supabase: GRANT / RLS 修復・確認スクリプト
-- SQL Editor でそのまま実行してください。
--
-- 前提（42501 / anon 扱いのとき特に重要）:
--   1) Dashboard → Authentication → Third-party Auth → Firebase を有効化
--   2) Firebase ID Token に role: "authenticated" があること
--      → アプリが /auth/firebase-ensure-claims で付与（FIREBASE_SERVICE_ACCOUNT_JSON 必須）
--   3) ヒントが "GRANT ... TO anon" のときは、JWT が anon 扱いになっている
--      （role クレーム不足 or Third-party Auth 未設定）
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) スキーマ USAGE
-- ---------------------------------------------------------------------------
grant usage on schema public to postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) public 全テーブルへ GRANT（authenticated = CRUD、anon = SELECT）
--    ※ 存在するテーブルだけに効くよう dynamic SQL
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      r.tablename
    );
    execute format(
      'grant select on table public.%I to anon',
      r.tablename
    );
    execute format(
      'grant all on table public.%I to service_role',
      r.tablename
    );
  end loop;
end $$;

-- シーケンスも付与（insert で nextval する場合）
do $$
declare
  r record;
begin
  for r in
    select sequence_name
    from information_schema.sequences
    where sequence_schema = 'public'
  loop
    execute format(
      'grant usage, select on sequence public.%I to authenticated, anon, service_role',
      r.sequence_name
    );
  end loop;
end $$;

-- 主要テーブルを明示（存在しない場合はスキップ）
do $$
begin
  if to_regclass('public.profiles') is not null then
    grant select, insert, update, delete on table public.profiles to authenticated;
    grant select on table public.profiles to anon;
  end if;
  if to_regclass('public.blocks') is not null then
    grant select, insert, update, delete on table public.blocks to authenticated;
  end if;
  if to_regclass('public.events') is not null then
    grant select, insert, update, delete on table public.events to authenticated;
    grant select on table public.events to anon;
  end if;
  if to_regclass('public.event_participants') is not null then
    grant select, insert, update, delete on table public.event_participants to authenticated;
    grant select on table public.event_participants to anon;
  end if;
  if to_regclass('public.event_favorites') is not null then
    grant select, insert, update, delete on table public.event_favorites to authenticated;
  end if;
  if to_regclass('public.device_push_tokens') is not null then
    grant select, insert, update, delete on table public.device_push_tokens to authenticated;
  end if;
  if to_regclass('public.chat_messages') is not null then
    grant select, insert, update, delete on table public.chat_messages to authenticated;
    grant select on table public.chat_messages to anon;
  end if;
  if to_regclass('public.organizer_bank_accounts') is not null then
    grant select, insert, update, delete on table public.organizer_bank_accounts to authenticated;
  end if;
  if to_regclass('public.event_ticket_sales') is not null then
    grant select, insert, update, delete on table public.event_ticket_sales to authenticated;
  end if;
  if to_regclass('public.organizer_payouts') is not null then
    grant select on table public.organizer_payouts to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- requesting_user_id() の再作成 + EXECUTE 権限
-- ---------------------------------------------------------------------------
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
-- 3) RLS ポリシー確認（結果セットを見て目視確認）
-- ---------------------------------------------------------------------------

-- 3-a) 関数定義
select
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'requesting_user_id';

-- 3-b) テーブルごとの RLS 有効状態
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles',
    'blocks',
    'events',
    'event_participants',
    'event_favorites',
    'device_push_tokens',
    'chat_messages',
    'organizer_bank_accounts',
    'event_ticket_sales',
    'organizer_payouts'
  )
order by c.relname;

-- 3-c) ポリシー一覧（qual / with_check に requesting_user_id が含まれるか）
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as with_check_expression,
  (
    coalesce(qual, '') || ' ' || coalesce(with_check, '')
  ) ilike '%requesting_user_id%' as uses_requesting_user_id,
  (
    coalesce(qual, '') || ' ' || coalesce(with_check, '')
  ) ilike '%auth.uid()%' as still_uses_auth_uid
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'blocks',
    'events',
    'event_participants',
    'event_favorites',
    'device_push_tokens',
    'chat_messages',
    'organizer_bank_accounts',
    'event_ticket_sales',
    'organizer_payouts'
  )
order by tablename, cmd, policyname;

-- 3-d) GRANT 確認（authenticated）
select
  table_schema,
  table_name,
  privilege_type,
  grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('authenticated', 'anon')
  and table_name in (
    'profiles',
    'blocks',
    'events',
    'event_participants',
    'event_favorites',
    'device_push_tokens',
    'chat_messages',
    'organizer_bank_accounts',
    'event_ticket_sales',
    'organizer_payouts'
  )
order by table_name, grantee, privilege_type;

-- =============================================================================
-- 補足: still_uses_auth_uid = true のポリシーが残っている場合は
--       apply_firebase_auth_uid.sql を再適用するか、下記で主要ポリシーを張り直す。
-- =============================================================================

-- RLS を確実に ON
do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles enable row level security;
  end if;
  if to_regclass('public.blocks') is not null then
    alter table public.blocks enable row level security;
  end if;
  if to_regclass('public.events') is not null then
    alter table public.events enable row level security;
  end if;
  if to_regclass('public.event_participants') is not null then
    alter table public.event_participants enable row level security;
  end if;
  if to_regclass('public.event_favorites') is not null then
    alter table public.event_favorites enable row level security;
  end if;
  if to_regclass('public.device_push_tokens') is not null then
    alter table public.device_push_tokens enable row level security;
  end if;
end $$;

-- profiles（Firebase UID = text）
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

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

-- blocks
drop policy if exists "blocks_select" on public.blocks;
drop policy if exists "blocks_insert_own" on public.blocks;
drop policy if exists "blocks_update_own" on public.blocks;
drop policy if exists "blocks_delete_own" on public.blocks;

create policy "blocks_select"
  on public.blocks for select
  to authenticated
  using (
    blocker_id = (select public.requesting_user_id())
    or blocked_id = (select public.requesting_user_id())
  );

create policy "blocks_insert_own"
  on public.blocks for insert
  to authenticated
  with check (blocker_id = (select public.requesting_user_id()));

create policy "blocks_update_own"
  on public.blocks for update
  to authenticated
  using (blocker_id = (select public.requesting_user_id()))
  with check (blocker_id = (select public.requesting_user_id()));

create policy "blocks_delete_own"
  on public.blocks for delete
  to authenticated
  using (blocker_id = (select public.requesting_user_id()));

-- events（閲覧は anon+authenticated、書込は host）
drop policy if exists "events_insert_own" on public.events;
drop policy if exists "events_update_own" on public.events;
drop policy if exists "events_delete_own" on public.events;

create policy "events_insert_own"
  on public.events for insert
  to authenticated
  with check (host_id = (select public.requesting_user_id()));

create policy "events_update_own"
  on public.events for update
  to authenticated
  using (host_id = (select public.requesting_user_id()))
  with check (host_id = (select public.requesting_user_id()));

create policy "events_delete_own"
  on public.events for delete
  to authenticated
  using (host_id = (select public.requesting_user_id()));

-- event_participants
drop policy if exists "event_participants_select" on public.event_participants;
drop policy if exists "event_participants_insert_own" on public.event_participants;
drop policy if exists "event_participants_update_own" on public.event_participants;
drop policy if exists "event_participants_delete_own" on public.event_participants;

grant select on table public.event_participants to anon, authenticated;
grant insert, update, delete on table public.event_participants to authenticated;

create policy "event_participants_select"
  on public.event_participants for select
  to anon, authenticated
  using (true);

create policy "event_participants_insert_own"
  on public.event_participants for insert
  to authenticated
  with check (
    user_id is not null
    and user_id::text = (select public.requesting_user_id())
  );

create policy "event_participants_update_own"
  on public.event_participants for update
  to authenticated
  using (user_id::text = (select public.requesting_user_id()))
  with check (user_id::text = (select public.requesting_user_id()));

create policy "event_participants_delete_own"
  on public.event_participants for delete
  to authenticated
  using (user_id::text = (select public.requesting_user_id()));

-- event_favorites
drop policy if exists "event_favorites_select_own" on public.event_favorites;
drop policy if exists "event_favorites_insert_own" on public.event_favorites;
drop policy if exists "event_favorites_delete_own" on public.event_favorites;

create policy "event_favorites_select_own"
  on public.event_favorites for select
  to authenticated
  using (user_id = (select public.requesting_user_id()));

create policy "event_favorites_insert_own"
  on public.event_favorites for insert
  to authenticated
  with check (user_id = (select public.requesting_user_id()));

create policy "event_favorites_delete_own"
  on public.event_favorites for delete
  to authenticated
  using (user_id = (select public.requesting_user_id()));

-- device_push_tokens
drop policy if exists "device_push_tokens_select_own" on public.device_push_tokens;
drop policy if exists "device_push_tokens_insert_own" on public.device_push_tokens;
drop policy if exists "device_push_tokens_update_own" on public.device_push_tokens;
drop policy if exists "device_push_tokens_delete_own" on public.device_push_tokens;

create policy "device_push_tokens_select_own"
  on public.device_push_tokens for select
  to authenticated
  using (user_id = (select public.requesting_user_id()));

create policy "device_push_tokens_insert_own"
  on public.device_push_tokens for insert
  to authenticated
  with check (user_id = (select public.requesting_user_id()));

create policy "device_push_tokens_update_own"
  on public.device_push_tokens for update
  to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));

create policy "device_push_tokens_delete_own"
  on public.device_push_tokens for delete
  to authenticated
  using (user_id = (select public.requesting_user_id()));

-- chat_messages（Firebase JWT）
drop policy if exists "chat_messages_select" on public.chat_messages;
drop policy if exists "chat_messages_insert" on public.chat_messages;
drop policy if exists "chat_messages_delete_own" on public.chat_messages;

create policy "chat_messages_select"
  on public.chat_messages for select
  to authenticated
  using (
    mode = 'group'
    or dm_user_id = (select public.requesting_user_id())
    or sender_id = (select public.requesting_user_id())
    or exists (
      select 1 from public.events e
      where e.id = event_id
        and e.host_id = (select public.requesting_user_id())
    )
  );

create policy "chat_messages_insert"
  on public.chat_messages for insert
  to authenticated
  with check (
    sender_id is not null
    and sender_id = (select public.requesting_user_id())
    and (
      (mode = 'group' and dm_user_id is null)
      or (
        mode = 'host'
        and dm_user_id is not null
        and (
          dm_user_id = (select public.requesting_user_id())
          or exists (
            select 1 from public.events e
            where e.id = event_id
              and e.host_id = (select public.requesting_user_id())
          )
        )
      )
    )
  );

create policy "chat_messages_delete_own"
  on public.chat_messages for delete
  to authenticated
  using (sender_id = (select public.requesting_user_id()));

-- organizer_bank_accounts（Firebase JWT）
drop policy if exists "organizer_bank_accounts_select_own" on public.organizer_bank_accounts;
drop policy if exists "organizer_bank_accounts_insert_own" on public.organizer_bank_accounts;
drop policy if exists "organizer_bank_accounts_update_own" on public.organizer_bank_accounts;
drop policy if exists "organizer_bank_accounts_delete_own" on public.organizer_bank_accounts;

create policy "organizer_bank_accounts_select_own"
  on public.organizer_bank_accounts for select
  to authenticated
  using (user_id = (select public.requesting_user_id()));

create policy "organizer_bank_accounts_insert_own"
  on public.organizer_bank_accounts for insert
  to authenticated
  with check (user_id = (select public.requesting_user_id()));

create policy "organizer_bank_accounts_update_own"
  on public.organizer_bank_accounts for update
  to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));

create policy "organizer_bank_accounts_delete_own"
  on public.organizer_bank_accounts for delete
  to authenticated
  using (user_id = (select public.requesting_user_id()));

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
