-- =============================================================================
-- clubs: 主催者クラブのカバー／アイコン（Firebase JWT）
-- Supabase SQL Editor で実行してください。
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

create table if not exists public.clubs (
  id text primary key,
  name text not null default '',
  image_url text,
  cover_image_url text,
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_id_nonempty check (char_length(trim(id)) > 0)
);

create index if not exists clubs_updated_at_idx
  on public.clubs (updated_at desc);

alter table public.clubs enable row level security;

grant select on table public.clubs to anon, authenticated;
grant insert, update, delete on table public.clubs to authenticated;
grant all on table public.clubs to service_role;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'clubs'
  loop
    execute format('drop policy if exists %I on public.clubs', pol.policyname);
  end loop;
end $$;

create policy "clubs_select_all"
  on public.clubs for select
  to anon, authenticated
  using (true);

create policy "clubs_insert_own"
  on public.clubs for insert
  to authenticated
  with check (
    id is not null
    and id = (select public.requesting_user_id())
  );

create policy "clubs_update_own"
  on public.clubs for update
  to authenticated
  using (id = (select public.requesting_user_id()))
  with check (id = (select public.requesting_user_id()));

create policy "clubs_delete_own"
  on public.clubs for delete
  to authenticated
  using (id = (select public.requesting_user_id()));

create or replace function public.clubs_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clubs_set_updated_at on public.clubs;
create trigger clubs_set_updated_at
  before update on public.clubs
  for each row
  execute function public.clubs_set_updated_at();

-- Storage: clubs/ フォルダを許可
drop policy if exists "event_images_authenticated_upload" on storage.objects;
create policy "event_images_authenticated_upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact', 'clubs')
  );

drop policy if exists "event_images_authenticated_update" on storage.objects;
create policy "event_images_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact', 'clubs')
  )
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact', 'clubs')
  );

drop policy if exists "event_images_authenticated_delete" on storage.objects;
create policy "event_images_authenticated_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact', 'clubs')
  );
