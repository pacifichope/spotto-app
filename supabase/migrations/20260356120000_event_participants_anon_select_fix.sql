-- event_participants: 42501 permission denied の恒久修復
--
-- 症状: permission denied for table event_participants (code 42501)
-- 原因: 過去の hardening / 初期マイグレーションが anon から ALL を revoke しており、
--       Firebase JWT が role=authenticated 未付与で anon 扱いになると SELECT が失敗する。
--
-- 手動適用: supabase/apply_event_participants_select_public.sql を SQL Editor で実行

grant usage on schema public to anon, authenticated, service_role;

-- テーブル権限（SELECT はゲスト公開）
grant select on table public.event_participants to anon, authenticated;
grant insert, update, delete on table public.event_participants to authenticated;
grant all on table public.event_participants to service_role;
revoke insert, update, delete on table public.event_participants from anon;

alter table public.event_participants enable row level security;

-- 既存 SELECT ポリシーを掃除して公開 SELECT を再作成
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'event_participants'
      and cmd = 'SELECT'
  loop
    execute format(
      'drop policy if exists %I on public.event_participants',
      pol.policyname
    );
  end loop;
end $$;

create policy "event_participants_select"
  on public.event_participants
  for select
  to anon, authenticated
  using (true);

-- 書き込み用 requesting_user_id（無ければ作成）
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

-- 検証用（SQL Editor で結果を確認）
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'event_participants'
--   and grantee in ('anon', 'authenticated')
-- order by grantee, privilege_type;
