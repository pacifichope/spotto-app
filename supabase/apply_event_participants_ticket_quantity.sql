-- Apply: event_participants.ticket_quantity + joined_count = sum(tickets)
-- 使い方: supabase db または SQL Editor で実行

alter table public.event_participants
  add column if not exists ticket_quantity integer not null default 1
    check (ticket_quantity >= 1);

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
      select coalesce(sum(p.ticket_quantity), 0)::int
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

update public.events e
set
  joined_count = (
    select coalesce(sum(p.ticket_quantity), 0)::int
    from public.event_participants p
    where p.event_id = e.id
      and p.status = 'joined'
  ),
  waitlist_count = (
    select count(*)::int
    from public.event_participants p
    where p.event_id = e.id
      and p.status = 'waitlisted'
  );

notify pgrst, 'reload schema';
