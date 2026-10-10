-- =============================================================================
-- ゲスト（anon）でもイベント参加者の公開プロフィール（氏名・アバター・性別）を読めるようにする
-- profiles 全体は anon に開けず、参加イベントに紐づく行だけ SECURITY DEFINER で返す
-- + event_participants.gender スナップショット（profiles 欠損時の保険）
-- =============================================================================

alter table public.event_participants
  add column if not exists gender text
  check (gender is null or gender in ('男性', '女性'));

comment on column public.event_participants.gender is
  '参加登録時点の性別スナップショット（profiles.gender と併用）';

-- 既存参加行を profiles から埋める（可能な範囲）
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
