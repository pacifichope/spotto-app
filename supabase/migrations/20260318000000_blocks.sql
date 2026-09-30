-- ユーザー間ブロック関係
-- blocker_id: ブロックした側（auth.users）
-- blocked_id: ブロックされた側（アプリ内ユーザー ID。UUID 文字列またはデモ用 ID）
--
-- 適用方法:
--   Supabase Dashboard → SQL Editor → New query → このファイル全文を貼り付け → Run
-- 適用後も PGRST205 が出る場合:
--   Dashboard → Settings → API → 「Reload schema」相当として下記 NOTIFY を再実行

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

-- 自分が関与する行のみ参照可（自分がブロックした / 自分をブロックした）
drop policy if exists "blocks_select_own" on public.blocks;
create policy "blocks_select_own"
  on public.blocks
  for select
  to authenticated
  using (
    blocker_id = auth.uid()
    or blocked_id = auth.uid()::text
  );

-- 自分がブロックする行のみ挿入可
drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own"
  on public.blocks
  for insert
  to authenticated
  with check (blocker_id = auth.uid());

-- 自分が作ったブロックのみ更新可（upsert 用）
drop policy if exists "blocks_update_own" on public.blocks;
create policy "blocks_update_own"
  on public.blocks
  for update
  to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

-- 自分が作ったブロックのみ削除可
drop policy if exists "blocks_delete_own" on public.blocks;
create policy "blocks_delete_own"
  on public.blocks
  for delete
  to authenticated
  using (blocker_id = auth.uid());

-- PostgREST / クライアントから触れるよう権限を付与
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.blocks to authenticated;
grant all on table public.blocks to service_role;

-- スキーマキャッシュを再読込（PGRST205 対策）
notify pgrst, 'reload schema';
