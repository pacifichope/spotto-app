-- 手動適用用（Supabase SQL Editor で実行）
-- 参加者一覧で他ユーザーの名前・アイコンが読めるようにする + 参加行スナップショット

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

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

alter table public.event_participants
  add column if not exists display_name text;

alter table public.event_participants
  add column if not exists avatar_url text;

comment on column public.event_participants.display_name is
  '参加登録時点の表示名スナップショット（profiles.display_name と併用）';
comment on column public.event_participants.avatar_url is
  '参加登録時点のアバター URL スナップショット';
