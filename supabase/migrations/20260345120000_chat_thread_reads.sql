-- チャットスレッド既読（ユーザーごと・端末横断）
-- thread_id はアプリの chatThreadId（例: <eventUuid>:group / <eventUuid>:host:<dmUserId>）

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

-- 退会クリーンアップに追加（関数が存在する場合）
do $$
declare
  def text;
begin
  if to_regprocedure('public.delete_own_app_data()') is null then
    return;
  end if;
  select pg_get_functiondef('public.delete_own_app_data()'::regprocedure)
    into def;
  if def is null or position('chat_thread_reads' in def) > 0 then
    return;
  end if;
  -- 既存関数を置き換えず、手動 apply 側で統合する想定。
  -- ここでは行削除用の補助だけ残す。
  null;
end $$;

notify pgrst, 'reload schema';
