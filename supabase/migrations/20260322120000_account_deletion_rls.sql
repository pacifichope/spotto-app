-- =============================================================================
-- アカウント削除連携 + RLS 見直し（ストア審査向け）
-- =============================================================================
-- 想定テーブル: public.profiles, public.blocks
-- Auth ユーザー削除時は FK ON DELETE CASCADE で profiles / blocks が連動削除される。
-- Auth ユーザー本体の削除はクライアントからは不可のため、Edge Function / API
-- （service_role）経由で行う（supabase/functions/delete-account 参照）。
-- =============================================================================

-- ----- profiles: 所有権・権限 -----
alter table public.profiles enable row level security;

-- 既存ポリシーを置き換え（authenticated のみ・自分の行のみ）
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 退会フローで明示削除できるようにする（auth.users CASCADE でも消える）
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles
  for delete
  to authenticated
  using (auth.uid() = id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant all on table public.profiles to service_role;
revoke all on table public.profiles from anon;

-- FK が cascade であることを再確認（既にあればそのまま）
do $$
begin
  -- profiles.id → auth.users(id) ON DELETE CASCADE は初回マイグレーションで定義済み
  null;
end $$;

-- ----- blocks: 所有権ポリシーの再確認 -----
alter table public.blocks enable row level security;

drop policy if exists "blocks_select_own" on public.blocks;
create policy "blocks_select_own"
  on public.blocks
  for select
  to authenticated
  using (
    blocker_id = auth.uid()
    or blocked_id = auth.uid()::text
  );

drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own"
  on public.blocks
  for insert
  to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "blocks_update_own" on public.blocks;
create policy "blocks_update_own"
  on public.blocks
  for update
  to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

drop policy if exists "blocks_delete_own" on public.blocks;
create policy "blocks_delete_own"
  on public.blocks
  for delete
  to authenticated
  using (blocker_id = auth.uid());

grant select, insert, update, delete on table public.blocks to authenticated;
grant all on table public.blocks to service_role;
revoke all on table public.blocks from anon;

-- 退会時にクライアント側でも自分の関連行を消せる RPC（Auth 削除前のクリーンアップ用）
create or replace function public.delete_own_app_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.blocks
  where blocker_id = uid
     or blocked_id = uid::text;

  delete from public.profiles
  where id = uid;
end;
$$;

revoke all on function public.delete_own_app_data() from public;
grant execute on function public.delete_own_app_data() to authenticated;
grant execute on function public.delete_own_app_data() to service_role;

comment on function public.delete_own_app_data() is
  'ログイン中ユーザーの profiles / blocks を削除。Auth ユーザー削除は Edge Function / API が担当。';

notify pgrst, 'reload schema';

-- =============================================================================
-- RLS 確認クエリ（Dashboard → SQL Editor で実行して目視確認）
-- =============================================================================
-- select schemaname, tablename, policyname, roles, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename in ('profiles', 'blocks')
-- order by tablename, cmd, policyname;
--
-- 期待:
--   profiles: SELECT/INSERT/UPDATE/DELETE が authenticated かつ auth.uid() = id
--   blocks:   SELECT は blocker or blocked、INSERT/UPDATE/DELETE は blocker_id = auth.uid()
-- =============================================================================
