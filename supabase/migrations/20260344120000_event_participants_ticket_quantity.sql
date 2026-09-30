-- 1購入あたりのチケット枚数（定員消費）。未設定行は 1 枚扱い。
alter table public.event_participants
  add column if not exists ticket_quantity integer not null default 1
    check (ticket_quantity >= 1);

comment on column public.event_participants.ticket_quantity is
  '購入・確保した参加枠数。joined_count 集計に合算する';

-- joined_count は参加者人数ではなくチケット枚数の合計
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

-- 既存行の再集計
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
