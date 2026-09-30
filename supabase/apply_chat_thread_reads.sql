-- Apply: chat_thread_reads（チャット既読）
-- 使い方: SQL Editor で実行

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

create table if not exists public.chat_thread_reads (
  user_id text not null,
  thread_id text not null,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, thread_id),
  constraint chat_thread_reads_thread_id_len check (
    char_length(thread_id) >= 3 and char_length(thread_id) <= 200
  )
);

create index if not exists chat_thread_reads_user_id_idx
  on public.chat_thread_reads (user_id);

create index if not exists chat_thread_reads_user_last_read_idx
  on public.chat_thread_reads (user_id, last_read_at desc);

alter table public.chat_thread_reads enable row level security;

drop policy if exists "chat_thread_reads_select_own" on public.chat_thread_reads;
create policy "chat_thread_reads_select_own"
  on public.chat_thread_reads for select
  to authenticated
  using (user_id = (select public.requesting_user_id()));

drop policy if exists "chat_thread_reads_insert_own" on public.chat_thread_reads;
create policy "chat_thread_reads_insert_own"
  on public.chat_thread_reads for insert
  to authenticated
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "chat_thread_reads_update_own" on public.chat_thread_reads;
create policy "chat_thread_reads_update_own"
  on public.chat_thread_reads for update
  to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "chat_thread_reads_delete_own" on public.chat_thread_reads;
create policy "chat_thread_reads_delete_own"
  on public.chat_thread_reads for delete
  to authenticated
  using (user_id = (select public.requesting_user_id()));

grant select, insert, update, delete on table public.chat_thread_reads to authenticated;
grant all on table public.chat_thread_reads to service_role;
revoke all on table public.chat_thread_reads from anon;

notify pgrst, 'reload schema';
