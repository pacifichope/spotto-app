-- =============================================================================
-- chat_messages: Firebase Auth JWT 向け RLS 修復
-- Supabase SQL Editor で実行してください。
--
-- 背景:
--   auth.uid() は GoTrue UUID 向け。Firebase UID では NULL → INSERT/SELECT が RLS 違反。
--   → requesting_user_id() = auth.jwt()->>'sub' を使う。
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

-- sender_id / dm_user_id を text に（Firebase UID）。FK は外す。
alter table if exists public.chat_messages
  drop constraint if exists chat_messages_dm_user_id_fkey;
alter table if exists public.chat_messages
  drop constraint if exists chat_messages_sender_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_messages'
      and column_name = 'sender_id'
      and data_type <> 'text'
  ) then
    alter table public.chat_messages
      alter column sender_id type text using sender_id::text;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_messages'
      and column_name = 'dm_user_id'
      and data_type <> 'text'
  ) then
    alter table public.chat_messages
      alter column dm_user_id type text using dm_user_id::text;
  end if;
end $$;

alter table public.chat_messages enable row level security;

-- 旧ポリシーをすべて削除（名前違いの残存を防ぐ）
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
  loop
    execute format(
      'drop policy if exists %I on public.chat_messages',
      pol.policyname
    );
  end loop;
end $$;

grant select, insert, delete on table public.chat_messages to authenticated;
grant all on table public.chat_messages to service_role;
revoke all on table public.chat_messages from anon;

-- SELECT: グループは認証済み全員（参加判定はアプリ側）。host DM は当事者 or 主催者。
create policy "chat_messages_select"
  on public.chat_messages for select
  to authenticated
  using (
    mode = 'group'
    or dm_user_id = (select public.requesting_user_id())
    or sender_id = (select public.requesting_user_id())
    or exists (
      select 1 from public.events e
      where e.id = event_id
        and e.host_id = (select public.requesting_user_id())
    )
  );

-- INSERT: sender_id は必ず JWT sub
create policy "chat_messages_insert"
  on public.chat_messages for insert
  to authenticated
  with check (
    sender_id is not null
    and sender_id = (select public.requesting_user_id())
    and (
      (mode = 'group' and dm_user_id is null)
      or (
        mode = 'host'
        and dm_user_id is not null
        and (
          dm_user_id = (select public.requesting_user_id())
          or exists (
            select 1 from public.events e
            where e.id = event_id
              and e.host_id = (select public.requesting_user_id())
          )
        )
      )
    )
  );

create policy "chat_messages_delete_own"
  on public.chat_messages for delete
  to authenticated
  using (sender_id = (select public.requesting_user_id()));

-- Realtime（未登録なら追加）
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

notify pgrst, 'reload schema';

-- 確認用
select
  policyname,
  cmd,
  roles,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename = 'chat_messages'
order by cmd, policyname;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'chat_messages'
  and column_name in ('sender_id', 'dm_user_id', 'event_id', 'mode');
