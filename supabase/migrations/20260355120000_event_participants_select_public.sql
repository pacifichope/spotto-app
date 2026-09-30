-- event_participants: ゲスト(anon) / ログイン(authenticated) の SELECT を許可
-- 42501 permission denied for table event_participants の修復
--
-- 背景:
--   過去マイグレーションが `revoke all ... from anon` しており、
--   Firebase JWT が role=authenticated 未付与で anon 扱いになると SELECT が 42501 になる。
--   参加者一覧はイベント詳細の公開情報のため、SELECT は anon / authenticated 双方に開放する。

grant usage on schema public to anon, authenticated, service_role;

grant select on table public.event_participants to anon, authenticated;
grant insert, update, delete on table public.event_participants to authenticated;
grant all on table public.event_participants to service_role;

alter table public.event_participants enable row level security;

drop policy if exists "event_participants_select" on public.event_participants;
drop policy if exists "event_participants_select_public" on public.event_participants;

-- 参加者一覧は公開（ゲスト閲覧のイベント詳細でも表示）
create policy "event_participants_select"
  on public.event_participants
  for select
  to anon, authenticated
  using (true);

-- 書き込みは本人のみ（requesting_user_id = Firebase sub）
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

drop policy if exists "event_participants_insert_own" on public.event_participants;
create policy "event_participants_insert_own"
  on public.event_participants for insert
  to authenticated
  with check (
    user_id is not null
    and user_id::text = (select public.requesting_user_id())
  );

drop policy if exists "event_participants_update_own" on public.event_participants;
create policy "event_participants_update_own"
  on public.event_participants for update
  to authenticated
  using (user_id::text = (select public.requesting_user_id()))
  with check (user_id::text = (select public.requesting_user_id()));

drop policy if exists "event_participants_delete_own" on public.event_participants;
create policy "event_participants_delete_own"
  on public.event_participants for delete
  to authenticated
  using (user_id::text = (select public.requesting_user_id()));

notify pgrst, 'reload schema';
