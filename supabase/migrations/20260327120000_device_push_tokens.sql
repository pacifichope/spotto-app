-- マイグレーション相当: RLS 補強 + device_push_tokens
-- （apply_rls_hardening.sql と同趣旨。CLI migrate 用）

-- device_push_tokens のみ新規。既存ポリシー再適用は apply_rls_hardening.sql を推奨。

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  constraint device_push_tokens_unique unique (user_id, token)
);

create index if not exists device_push_tokens_user_id_idx
  on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

drop policy if exists "device_push_tokens_select_own" on public.device_push_tokens;
create policy "device_push_tokens_select_own"
  on public.device_push_tokens for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "device_push_tokens_insert_own" on public.device_push_tokens;
create policy "device_push_tokens_insert_own"
  on public.device_push_tokens for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "device_push_tokens_update_own" on public.device_push_tokens;
create policy "device_push_tokens_update_own"
  on public.device_push_tokens for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "device_push_tokens_delete_own" on public.device_push_tokens;
create policy "device_push_tokens_delete_own"
  on public.device_push_tokens for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.device_push_tokens to authenticated;
grant all on table public.device_push_tokens to service_role;
revoke all on table public.device_push_tokens from anon;

notify pgrst, 'reload schema';
