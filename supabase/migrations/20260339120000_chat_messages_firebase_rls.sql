-- chat_messages RLS を Firebase JWT（requesting_user_id）に揃える
-- ※ ポリシー依存があるため型変更前に全ポリシーを DROP する

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

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'chat_messages'
  loop
    execute format(
      'drop policy if exists %I on public.chat_messages',
      pol.policyname
    );
  end loop;
end $$;

alter table if exists public.chat_messages
  drop constraint if exists chat_messages_dm_user_id_fkey;
alter table if exists public.chat_messages
  drop constraint if exists chat_messages_sender_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_messages'
      and column_name = 'sender_id' and data_type <> 'text'
  ) then
    alter table public.chat_messages
      alter column sender_id type text using sender_id::text;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_messages'
      and column_name = 'dm_user_id' and data_type <> 'text'
  ) then
    alter table public.chat_messages
      alter column dm_user_id type text using dm_user_id::text;
  end if;
end $$;

alter table public.chat_messages enable row level security;
grant select, insert, delete on table public.chat_messages to authenticated;
revoke all on table public.chat_messages from anon;

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
