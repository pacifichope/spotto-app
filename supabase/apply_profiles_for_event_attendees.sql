-- 手動適用用（Supabase SQL Editor）
-- ゲストでも参加者一覧に性別・名前・アバターが出るようにする
-- ※ 本番では migrations/20260410120000_profiles_for_event_attendees.sql と同等

alter table public.event_participants
  add column if not exists gender text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_participants_gender_check'
  ) then
    alter table public.event_participants
      add constraint event_participants_gender_check
      check (gender is null or gender in ('男性', '女性'));
  end if;
exception
  when duplicate_object then null;
end $$;

comment on column public.event_participants.gender is
  '参加登録時点の性別スナップショット（profiles.gender と併用）';

update public.event_participants ep
set gender = p.gender
from public.profiles p
where ep.gender is null
  and ep.user_id::text = p.id::text
  and p.gender in ('男性', '女性');

create or replace function public.profiles_for_event_attendees(p_event_id text)
returns table (
  id text,
  display_name text,
  nickname text,
  avatar_url text,
  gender text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id::text,
    p.display_name,
    p.nickname,
    p.avatar_url,
    p.gender
  from public.profiles p
  inner join public.event_participants ep
    on ep.user_id::text = p.id::text
  where ep.event_id::text = lower(trim(p_event_id))
    and (
      ep.status is null
      or lower(ep.status) in ('joined', 'confirmed', 'waitlisted')
    );
$$;

revoke all on function public.profiles_for_event_attendees(text) from public;
grant execute on function public.profiles_for_event_attendees(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
