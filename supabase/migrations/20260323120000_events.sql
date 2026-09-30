-- =============================================================================
-- public.events: イベントのリモート永続化（全ユーザー共有）
-- =============================================================================

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  sport text not null default 'その他',
  emoji text not null default '🏅',
  location text not null,
  location_note text,
  event_date text not null,
  event_time text not null,
  end_date text,
  end_time text,
  schedule_type text not null default 'single'
    check (schedule_type in ('single', 'recurring')),
  sessions jsonb,
  level text not null default '誰でも歓迎',
  target_age_groups text[] not null default '{}',
  latitude double precision not null,
  longitude double precision not null,
  capacity integer not null check (capacity >= 1),
  joined_count integer not null default 1 check (joined_count >= 0),
  host_name text not null default '主催者',
  host_image_uri text,
  host_bio text,
  host_sns_links jsonb not null default '[]'::jsonb,
  vibe text not null default '',
  description text not null default '',
  image_uri text not null default '',
  image_uris text[] not null default '{}',
  accent text,
  registration_deadline_offset text not null default '0',
  waitlist_enabled boolean not null default false,
  waitlist_count integer not null default 0,
  enable_pre_questions boolean not null default false,
  pre_questions jsonb,
  items_to_bring text[] not null default '{}',
  included_items text[] not null default '{}',
  price_yen integer not null default 0 check (price_yen >= 0),
  cancel_policy text,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_host_id_idx on public.events (host_id);
create index if not exists events_event_date_idx on public.events (event_date);
create index if not exists events_created_at_idx on public.events (created_at desc);

alter table public.events enable row level security;

-- 閲覧: ログイン不要でも一覧できるようにする（ゲスト閲覧）
drop policy if exists "events_select_all" on public.events;
create policy "events_select_all"
  on public.events
  for select
  to anon, authenticated
  using (true);

drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own"
  on public.events
  for insert
  to authenticated
  with check (host_id = auth.uid());

drop policy if exists "events_update_own" on public.events;
create policy "events_update_own"
  on public.events
  for update
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

drop policy if exists "events_delete_own" on public.events;
create policy "events_delete_own"
  on public.events
  for delete
  to authenticated
  using (host_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select on table public.events to anon, authenticated;
grant insert, update, delete on table public.events to authenticated;
grant all on table public.events to service_role;
revoke all on table public.events from public;

-- 退会時クリーンアップに events を含める
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

  delete from public.events where host_id = uid;

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

notify pgrst, 'reload schema';
