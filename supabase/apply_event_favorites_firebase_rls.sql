-- =============================================================================
-- event_favorites: Firebase Auth JWT（requesting_user_id）向けに揃える
-- 手動適用: supabase/apply_event_favorites_firebase_rls.sql
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

create table if not exists public.event_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint event_favorites_unique unique (user_id, event_id)
);

-- 旧 uuid + auth.users FK からの移行
alter table if exists public.event_favorites
  drop constraint if exists event_favorites_user_id_fkey;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_favorites'
      and column_name = 'user_id'
      and data_type <> 'text'
  ) then
    alter table public.event_favorites
      alter column user_id type text using user_id::text;
  end if;
end $$;

create index if not exists event_favorites_user_id_idx
  on public.event_favorites (user_id);
create index if not exists event_favorites_event_id_idx
  on public.event_favorites (event_id);

alter table public.event_favorites enable row level security;

grant select, insert, update, delete on table public.event_favorites to authenticated;
grant all on table public.event_favorites to service_role;
revoke all on table public.event_favorites from anon;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'event_favorites'
  loop
    execute format(
      'drop policy if exists %I on public.event_favorites',
      pol.policyname
    );
  end loop;
end $$;

create policy "event_favorites_select_own"
  on public.event_favorites for select
  to authenticated
  using (user_id = (select public.requesting_user_id()));

create policy "event_favorites_insert_own"
  on public.event_favorites for insert
  to authenticated
  with check (
    user_id is not null
    and user_id = (select public.requesting_user_id())
  );

create policy "event_favorites_update_own"
  on public.event_favorites for update
  to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));

create policy "event_favorites_delete_own"
  on public.event_favorites for delete
  to authenticated
  using (user_id = (select public.requesting_user_id()));

notify pgrst, 'reload schema';
