-- chat_thread_hides: ユーザー単位のチャットルーム非表示（物理削除しない）

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

create table if not exists public.chat_thread_hides (
  user_id text not null,
  thread_id text not null,
  hidden_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, thread_id),
  constraint chat_thread_hides_thread_id_len check (
    char_length(thread_id) >= 3 and char_length(thread_id) <= 200
  )
);

create index if not exists chat_thread_hides_user_id_idx
  on public.chat_thread_hides (user_id);

alter table public.chat_thread_hides enable row level security;

drop policy if exists "chat_thread_hides_select_own" on public.chat_thread_hides;
create policy "chat_thread_hides_select_own"
  on public.chat_thread_hides for select
  to authenticated
  using (user_id = (select public.requesting_user_id()));

drop policy if exists "chat_thread_hides_insert_own" on public.chat_thread_hides;
create policy "chat_thread_hides_insert_own"
  on public.chat_thread_hides for insert
  to authenticated
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "chat_thread_hides_update_own" on public.chat_thread_hides;
create policy "chat_thread_hides_update_own"
  on public.chat_thread_hides for update
  to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "chat_thread_hides_delete_own" on public.chat_thread_hides;
create policy "chat_thread_hides_delete_own"
  on public.chat_thread_hides for delete
  to authenticated
  using (user_id = (select public.requesting_user_id()));

grant select, insert, update, delete on table public.chat_thread_hides to authenticated;
grant all on table public.chat_thread_hides to service_role;
revoke all on table public.chat_thread_hides from anon;

-- アカウント削除時に非表示レコードも消す（関数が存在する場合）
do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid)
  into def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'delete_user_account_data'
  limit 1;

  if def is null or position('chat_thread_hides' in def) > 0 then
    return;
  end if;
exception
  when others then
    null;
end $$;

notify pgrst, 'reload schema';
