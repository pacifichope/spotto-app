-- =============================================================================
-- clubs: 主催者（host_id）単位のクラブブランド情報
-- クラブ ID = Firebase UID（text）。独立したサークルプロフィール用。
-- 手動適用: supabase/apply_clubs.sql
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

comment on table public.clubs is
  '主催者クラブ（id = Firebase UID / host_id）。cover_image_url はヘッダー画像。';
comment on column public.clubs.cover_image_url is
  'クラブカバー写真（Storage パスまたは公開 URL）';
comment on column public.clubs.image_url is
  'クラブアイコン／ロゴ';

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

-- 誰でも読める（クラブプロフィール公開）
create policy "clubs_select_all"
  on public.clubs for select
  to anon, authenticated
  using (true);

-- 自分のクラブ行のみ作成・更新・削除
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
