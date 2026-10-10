-- =============================================================================
-- notification_preferences: ユーザー単位の通知オン／オフ
-- Supabase SQL Editor で実行してください（再実行可）。
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

create table if not exists public.notification_preferences (
  user_id text primary key,
  event_reminders boolean not null default false,
  chat_messages boolean not null default false,
  event_updates boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint notification_preferences_user_id_nonempty check (
    char_length(trim(user_id)) > 0
  )
);

comment on table public.notification_preferences is
  '通知設定（user_id = Firebase UID）。種類ごとのオン／オフ。';

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
  on public.notification_preferences for select
  to authenticated
  using (user_id = (select public.requesting_user_id()));

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
  on public.notification_preferences for insert
  to authenticated
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
  on public.notification_preferences for update
  to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "notification_preferences_delete_own" on public.notification_preferences;
create policy "notification_preferences_delete_own"
  on public.notification_preferences for delete
  to authenticated
  using (user_id = (select public.requesting_user_id()));

grant select, insert, update, delete on table public.notification_preferences to authenticated;
grant all on table public.notification_preferences to service_role;
revoke all on table public.notification_preferences from anon;

notify pgrst, 'reload schema';
