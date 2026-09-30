-- =============================================================================
-- event_participants: 42501 permission denied 修復（手動適用用・必須）
--
-- Supabase Dashboard → SQL Editor にこのファイル全体を貼り付けて Run してください。
-- プロジェクト: gcannfzalogpgxtowapq（linked）
--
-- これで anon / authenticated の SELECT が通り、ゲストでも参加者一覧を読めます。
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select on table public.event_participants to anon, authenticated;
grant insert, update, delete on table public.event_participants to authenticated;
grant all on table public.event_participants to service_role;
revoke insert, update, delete on table public.event_participants from anon;

alter table public.event_participants enable row level security;

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

-- 成功確認: anon / authenticated に SELECT が付いていること
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'event_participants'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
