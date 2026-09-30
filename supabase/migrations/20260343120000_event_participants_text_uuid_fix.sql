-- event_participants: text/uuid 不一致修復（auth.uid → requesting_user_id）
-- 手動適用: supabase/apply_event_participants_firebase_rls.sql

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
      and data_type <> 'text'
  ) then
    alter table public.event_participants
      alter column user_id type text using user_id::text;
  end if;
end $$;

alter table public.event_participants enable row level security;

grant select, insert, update, delete on table public.event_participants to authenticated;
grant select on table public.event_participants to anon;
grant all on table public.event_participants to service_role;
revoke insert, update, delete on table public.event_participants from anon;

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
