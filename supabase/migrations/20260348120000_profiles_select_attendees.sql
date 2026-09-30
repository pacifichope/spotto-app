-- =============================================================================
-- 参加者一覧用: 他ユーザーの基本プロフィールを authenticated が読めるようにする
-- （profiles_id_text_safe 以降、select_own のみになり「参加者」表示が多発した）
-- + event_participants に表示用スナップショット列（profiles 欠損時の保険）
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

-- 他参加者の display_name / avatar を一覧で取得するため SELECT を許可
-- （INSERT/UPDATE/DELETE は引き続き本人のみ）
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- 参加行に当時の表示名を残す（profiles 未作成・RLS 不整合時の保険）
alter table public.event_participants
  add column if not exists display_name text;

alter table public.event_participants
  add column if not exists avatar_url text;

comment on column public.event_participants.display_name is
  '参加登録時点の表示名スナップショット（profiles.display_name と併用）';
comment on column public.event_participants.avatar_url is
  '参加登録時点のアバター URL スナップショット';
