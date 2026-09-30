-- Firebase Auth UID（text）前提への移行（追記: events RLS を TO authenticated 付きで再確認）
-- 既存の apply_firebase_auth_uid.sql / apply_grants_and_rls_check.sql と同等。
-- 手動適用は supabase/apply_events_firebase_rls.sql を推奨。

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

alter table if exists public.events drop constraint if exists events_host_id_fkey;
alter table if exists public.events alter column host_id type text using host_id::text;

alter table public.events enable row level security;
grant select on table public.events to anon, authenticated;
grant insert, update, delete on table public.events to authenticated;

drop policy if exists "events_select_all" on public.events;
create policy "events_select_all"
  on public.events for select
  to anon, authenticated
  using (true);

drop policy if exists "events_insert_own" on public.events;
drop policy if exists "events_update_own" on public.events;
drop policy if exists "events_delete_own" on public.events;

create policy "events_insert_own"
  on public.events for insert
  to authenticated
  with check (
    host_id is not null
    and host_id = (select public.requesting_user_id())
  );

create policy "events_update_own"
  on public.events for update
  to authenticated
  using (host_id = (select public.requesting_user_id()))
  with check (host_id = (select public.requesting_user_id()));

create policy "events_delete_own"
  on public.events for delete
  to authenticated
  using (host_id = (select public.requesting_user_id()));
