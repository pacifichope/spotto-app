-- =============================================================================
-- event_participants: text = uuid エラー修復 + Firebase RLS
-- Supabase SQL Editor で実行してください。
--
-- エラー例: operator does not exist: text = uuid
-- 原因:
--   user_id を Firebase UID 用に text 化した後も、RLS / 関数が auth.uid()（uuid）
--   と比較している。または逆に user_id が uuid のまま requesting_user_id()（text）
--   と比較している。
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

-- auth.users FK を外し、user_id を text（Firebase UID）へ強制
alter table if exists public.event_participants
  drop constraint if exists event_participants_user_id_fkey;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_participants'
      and column_name = 'user_id'
      and udt_name = 'uuid'
  ) then
    alter table public.event_participants
      alter column user_id type text using user_id::text;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_participants'
      and column_name = 'user_id'
      and data_type <> 'text'
  ) then
    alter table public.event_participants
      alter column user_id type text using user_id::text;
  end if;
end $$;

-- event_id は events.id (uuid) のままであることを確認（text 化されていたら戻す）
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_participants'
      and column_name = 'event_id'
      and udt_name = 'text'
  ) then
    -- 不正に text 化された場合のみ uuid へ戻す
    alter table public.event_participants
      alter column event_id type uuid using event_id::uuid;
  end if;
end $$;

alter table public.event_participants enable row level security;

grant select, insert, update, delete on table public.event_participants to authenticated;
grant select on table public.event_participants to anon;
grant all on table public.event_participants to service_role;

-- 旧ポリシーをすべて削除（auth.uid 残存を含む）
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'event_participants'
  loop
    execute format(
      'drop policy if exists %I on public.event_participants',
      pol.policyname
    );
  end loop;
end $$;

-- SELECT: ゲスト閲覧でも参加者一覧を表示できるよう anon / authenticated に開放
create policy "event_participants_select"
  on public.event_participants for select
  to anon, authenticated
  using (true);

-- INSERT/UPDATE/DELETE: text = text（auth.uid() は使わない）
-- user_id::text と requesting_user_id() の両方を text として比較
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

-- 参加人数同期トリガー（SECURITY DEFINER で events RLS を回避）
-- event_id / events.id は uuid 同士で比較
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
  if target is null then
    return null;
  end if;

  update public.events e
  set
    joined_count = (
      select count(*)::int
      from public.event_participants p
      where p.event_id = target
        and p.status = 'joined'
    ),
    waitlist_count = (
      select count(*)::int
      from public.event_participants p
      where p.event_id = target
        and p.status = 'waitlisted'
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

-- 確認
do $$
declare
  uid_type text;
  eid_type text;
  pol record;
begin
  select udt_name into uid_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'event_participants'
    and column_name = 'user_id';

  select udt_name into eid_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'event_participants'
    and column_name = 'event_id';

  raise notice 'event_participants.user_id type = %', uid_type;
  raise notice 'event_participants.event_id type = %', eid_type;

  for pol in
    select policyname, cmd, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'event_participants'
    order by policyname
  loop
    raise notice 'policy % (%) using=% check=%',
      pol.policyname, pol.cmd, pol.qual, pol.with_check;
    if pol.qual ilike '%auth.uid%' or pol.with_check ilike '%auth.uid%' then
      raise warning 'policy % still references auth.uid()', pol.policyname;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
