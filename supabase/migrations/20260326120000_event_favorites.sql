-- =============================================================================
-- public.event_favorites: イベントお気に入り（端末横断同期）
-- =============================================================================

create table if not exists public.event_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint event_favorites_unique unique (user_id, event_id)
);

create index if not exists event_favorites_user_id_idx
  on public.event_favorites (user_id);
create index if not exists event_favorites_event_id_idx
  on public.event_favorites (event_id);

alter table public.event_favorites enable row level security;

drop policy if exists "event_favorites_select_own" on public.event_favorites;
create policy "event_favorites_select_own"
  on public.event_favorites
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "event_favorites_insert_own" on public.event_favorites;
create policy "event_favorites_insert_own"
  on public.event_favorites
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "event_favorites_delete_own" on public.event_favorites;
create policy "event_favorites_delete_own"
  on public.event_favorites
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on table public.event_favorites to authenticated;
grant all on table public.event_favorites to service_role;
revoke all on table public.event_favorites from anon;

-- blocks: anon 権限の明示 revoke（既存適用済みでも安全）
revoke all on table public.blocks from anon;

-- 退会時クリーンアップ（お気に入り含む）
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

  delete from public.chat_messages where sender_id = uid or dm_user_id = uid;
  delete from public.event_favorites where user_id = uid;
  delete from public.event_participants where user_id = uid;
  delete from public.events where host_id = uid;
  delete from public.blocks
  where blocker_id = uid or blocked_id = uid::text;
  delete from public.profiles where id = uid;
end;
$$;

revoke all on function public.delete_own_app_data() from public;
grant execute on function public.delete_own_app_data() to authenticated;
grant execute on function public.delete_own_app_data() to service_role;

notify pgrst, 'reload schema';
