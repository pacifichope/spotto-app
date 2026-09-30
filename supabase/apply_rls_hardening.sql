-- =============================================================================
-- RLS 総点検・補強（本番リリース向け）
-- events / event_participants / chat_messages / event_favorites / blocks / profiles
--
-- Firebase Auth を使う場合は auth.uid() ではなく requesting_user_id() を使うこと。
-- 推奨: supabase/apply_grants_and_rls_check.sql または apply_events_firebase_rls.sql
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

-- ----- profiles -----
alter table if exists public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

-- 参加者表示用: 認証ユーザーは基本プロフィールを閲覧可
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete to authenticated
  using (auth.uid() = id);

grant select, insert, update, delete on table public.profiles to authenticated;
grant all on table public.profiles to service_role;
revoke all on table public.profiles from anon;

-- ----- blocks -----
alter table if exists public.blocks enable row level security;

drop policy if exists "blocks_select_own" on public.blocks;
create policy "blocks_select_own"
  on public.blocks for select to authenticated
  using (
    blocker_id = auth.uid()
    or blocked_id = auth.uid()::text
  );

drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own"
  on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "blocks_update_own" on public.blocks;
create policy "blocks_update_own"
  on public.blocks for update to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

drop policy if exists "blocks_delete_own" on public.blocks;
create policy "blocks_delete_own"
  on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

grant select, insert, update, delete on table public.blocks to authenticated;
grant all on table public.blocks to service_role;
revoke all on table public.blocks from anon;

-- ----- events -----
alter table if exists public.events enable row level security;

-- ゲスト閲覧のため SELECT は公開。書き込みは主催者のみ。
drop policy if exists "events_select_all" on public.events;
create policy "events_select_all"
  on public.events for select
  to anon, authenticated
  using (true);

drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own"
  on public.events for insert to authenticated
  with check (host_id = (select public.requesting_user_id()));

drop policy if exists "events_update_own" on public.events;
create policy "events_update_own"
  on public.events for update to authenticated
  using (host_id = (select public.requesting_user_id()))
  with check (host_id = (select public.requesting_user_id()));

drop policy if exists "events_delete_own" on public.events;
create policy "events_delete_own"
  on public.events for delete to authenticated
  using (host_id = (select public.requesting_user_id()));

grant select on table public.events to anon, authenticated;
grant insert, update, delete on table public.events to authenticated;
grant all on table public.events to service_role;
revoke all on table public.events from public;

-- ----- event_participants -----
alter table if exists public.event_participants enable row level security;

drop policy if exists "event_participants_select" on public.event_participants;
create policy "event_participants_select"
  on public.event_participants for select to anon, authenticated
  using (true);

drop policy if exists "event_participants_insert_own" on public.event_participants;
create policy "event_participants_insert_own"
  on public.event_participants for insert to authenticated
  with check (
    user_id is not null
    and user_id::text = (select public.requesting_user_id())
  );

drop policy if exists "event_participants_update_own" on public.event_participants;
create policy "event_participants_update_own"
  on public.event_participants for update to authenticated
  using (user_id::text = (select public.requesting_user_id()))
  with check (user_id::text = (select public.requesting_user_id()));

drop policy if exists "event_participants_delete_own" on public.event_participants;
create policy "event_participants_delete_own"
  on public.event_participants for delete to authenticated
  using (user_id::text = (select public.requesting_user_id()));

-- 参加者一覧はイベント詳細の公開情報。ゲスト(anon) の SELECT を維持する
-- （revoke all from anon すると Firebase JWT が anon 扱いのとき 42501 になる）
grant select on table public.event_participants to anon, authenticated;
grant insert, update, delete on table public.event_participants to authenticated;
grant all on table public.event_participants to service_role;
revoke insert, update, delete on table public.event_participants from anon;

-- ----- chat_messages -----
alter table if exists public.chat_messages enable row level security;

drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select"
  on public.chat_messages for select to authenticated
  using (
    mode = 'group'
    or dm_user_id = (select public.requesting_user_id())
    or sender_id = (select public.requesting_user_id())
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.host_id = (select public.requesting_user_id())
    )
  );

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert"
  on public.chat_messages for insert to authenticated
  with check (
    sender_id = (select public.requesting_user_id())
    and (
      mode = 'group'
      or (
        mode = 'host'
        and dm_user_id is not null
        and (
          dm_user_id = (select public.requesting_user_id())
          or exists (
            select 1 from public.events e
            where e.id = event_id and e.host_id = (select public.requesting_user_id())
          )
        )
      )
    )
  );

drop policy if exists "chat_messages_delete_own" on public.chat_messages;
create policy "chat_messages_delete_own"
  on public.chat_messages for delete to authenticated
  using (sender_id = (select public.requesting_user_id()));

grant select, insert, delete on table public.chat_messages to authenticated;
grant all on table public.chat_messages to service_role;
revoke all on table public.chat_messages from anon;

-- ----- event_favorites（bookmarks 相当） -----
alter table if exists public.event_favorites enable row level security;

drop policy if exists "event_favorites_select_own" on public.event_favorites;
create policy "event_favorites_select_own"
  on public.event_favorites for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "event_favorites_insert_own" on public.event_favorites;
create policy "event_favorites_insert_own"
  on public.event_favorites for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "event_favorites_delete_own" on public.event_favorites;
create policy "event_favorites_delete_own"
  on public.event_favorites for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on table public.event_favorites to authenticated;
grant all on table public.event_favorites to service_role;
revoke all on table public.event_favorites from anon;

-- ----- device_push_tokens（プッシュ通知） -----
create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  constraint device_push_tokens_unique unique (user_id, token)
);

create index if not exists device_push_tokens_user_id_idx
  on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

drop policy if exists "device_push_tokens_select_own" on public.device_push_tokens;
create policy "device_push_tokens_select_own"
  on public.device_push_tokens for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "device_push_tokens_insert_own" on public.device_push_tokens;
create policy "device_push_tokens_insert_own"
  on public.device_push_tokens for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "device_push_tokens_update_own" on public.device_push_tokens;
create policy "device_push_tokens_update_own"
  on public.device_push_tokens for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "device_push_tokens_delete_own" on public.device_push_tokens;
create policy "device_push_tokens_delete_own"
  on public.device_push_tokens for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.device_push_tokens to authenticated;
grant all on table public.device_push_tokens to service_role;
revoke all on table public.device_push_tokens from anon;

-- 退会クリーンアップ（トークン含む）
create or replace function public.delete_own_app_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.device_push_tokens where user_id = uid;
  delete from public.chat_messages where sender_id = uid or dm_user_id = uid;
  delete from public.event_favorites where user_id = uid;
  delete from public.event_participants where user_id = uid;
  delete from public.events where host_id = uid;
  delete from public.blocks
  where blocker_id = uid or blocked_id = uid::text;
  delete from public.profiles where id = uid;
end;
$$;

revoke all on function public.delete_own_app_data() from public;
grant execute on function public.delete_own_app_data() to authenticated;
grant execute on function public.delete_own_app_data() to service_role;

notify pgrst, 'reload schema';
