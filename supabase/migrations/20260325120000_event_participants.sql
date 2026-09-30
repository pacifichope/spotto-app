-- =============================================================================
-- public.event_participants: イベント参加・キャンセル待ち
-- =============================================================================

create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'joined'
    check (status in ('joined', 'waitlisted')),
  created_at timestamptz not null default now(),
  constraint event_participants_unique unique (event_id, user_id)
);

create index if not exists event_participants_event_id_idx
  on public.event_participants (event_id);
create index if not exists event_participants_user_id_idx
  on public.event_participants (user_id);

alter table public.event_participants enable row level security;

-- 参加者一覧はログインユーザーが閲覧可（ゲストはアプリ側でサンプル表示のまま）
drop policy if exists "event_participants_select" on public.event_participants;
create policy "event_participants_select"
  on public.event_participants
  for select
  to authenticated
  using (true);

drop policy if exists "event_participants_insert_own" on public.event_participants;
create policy "event_participants_insert_own"
  on public.event_participants
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "event_participants_update_own" on public.event_participants;
create policy "event_participants_update_own"
  on public.event_participants
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "event_participants_delete_own" on public.event_participants;
create policy "event_participants_delete_own"
  on public.event_participants
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.event_participants to authenticated;
grant all on table public.event_participants to service_role;
revoke all on table public.event_participants from anon;

-- profiles を参加者表示用に読めるよう、authenticated に他ユーザーの基本プロフィール閲覧を許可
-- （既に own-only の場合は追加ポリシー）
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- joined_count / waitlist_count を参加者テーブルから同期
create or replace function public.sync_event_attendance_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.event_id, old.event_id);
  update public.events e
  set
    joined_count = (
      select count(*)::int from public.event_participants p
      where p.event_id = target and p.status = 'joined'
    ),
    waitlist_count = (
      select count(*)::int from public.event_participants p
      where p.event_id = target and p.status = 'waitlisted'
    ),
    updated_at = now()
  where e.id = target;
  return null;
end;
$$;

drop trigger if exists event_participants_sync_counts on public.event_participants;
create trigger event_participants_sync_counts
  after insert or update or delete on public.event_participants
  for each row
  execute function public.sync_event_attendance_counts();

-- 退会クリーンアップ
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

  delete from public.chat_messages where sender_id = uid or dm_user_id = uid;
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
