-- =============================================================================
-- spotto: public.blocks を一発適用（PGRST205 解消用）
-- Supabase Dashboard → SQL Editor に全文を貼って Run
-- =============================================================================

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id text not null,
  blocked_name text,
  blocked_image_uri text,
  created_at timestamptz not null default now(),
  constraint blocks_blocker_blocked_unique unique (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id::text <> blocked_id)
);

create index if not exists blocks_blocker_id_idx on public.blocks (blocker_id);
create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);

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

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.blocks to authenticated;
grant all on table public.blocks to service_role;
revoke all on table public.blocks from anon;

notify pgrst, 'reload schema';
