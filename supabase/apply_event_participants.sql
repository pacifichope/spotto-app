-- 手動適用用: イベント参加同期
-- ※ public.events / public.profiles が先に存在していること
-- ※ Firebase Auth 利用時は続けて apply_event_participants_firebase_rls.sql も実行推奨

create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- Firebase UID（text）。GoTrue auth.users FK は付けない
  user_id text not null,
  status text not null default 'joined'
    check (status in ('joined', 'waitlisted')),
  created_at timestamptz not null default now(),
  constraint event_participants_unique unique (event_id, user_id)
);

create index if not exists event_participants_event_id_idx
  on public.event_participants (event_id);
create index if not exists event_participants_user_id_idx
  on public.event_participants (user_id);

-- 既存 DB が uuid + auth.users FK の場合の移行
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

alter table public.event_participants enable row level security;

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

grant select, insert, update, delete on table public.event_participants to authenticated;
grant select on table public.event_participants to anon;
grant all on table public.event_participants to service_role;
revoke insert, update, delete on table public.event_participants from anon;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);

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

notify pgrst, 'reload schema';
