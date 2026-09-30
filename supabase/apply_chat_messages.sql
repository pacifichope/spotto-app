-- 手動適用用: チャットメッセージ同期
-- Supabase Dashboard → SQL Editor に全文を貼って Run
-- ※ public.events が先に存在している必要があります（apply_events.sql）

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  mode text not null check (mode in ('group', 'host')),
  -- Firebase UID（text）。auth.users FK は付けない
  dm_user_id text,
  sender_id text not null,
  sender_name text not null default '',
  sender_image_uri text,
  body text not null default '',
  created_at timestamptz not null default now(),
  constraint chat_messages_dm_scope check (
    (mode = 'group' and dm_user_id is null)
    or (mode = 'host' and dm_user_id is not null)
  )
);

create index if not exists chat_messages_event_mode_idx
  on public.chat_messages (event_id, mode, created_at);
create index if not exists chat_messages_dm_idx
  on public.chat_messages (event_id, mode, dm_user_id, created_at);

alter table public.chat_messages enable row level security;

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

drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select"
  on public.chat_messages for select to authenticated
  using (
    mode = 'group'
    or dm_user_id = (select public.requesting_user_id())
    or sender_id = (select public.requesting_user_id())
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.host_id = (select public.requesting_user_id())
    )
  );

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert"
  on public.chat_messages for insert to authenticated
  with check (
    sender_id = (select public.requesting_user_id())
    and (
      (mode = 'group' and dm_user_id is null)
      or (
        mode = 'host'
        and dm_user_id is not null
        and (
          dm_user_id = (select public.requesting_user_id())
          or exists (
            select 1 from public.events e
            where e.id = event_id and e.host_id = (select public.requesting_user_id())
          )
        )
      )
    )
  );

drop policy if exists "chat_messages_delete_own" on public.chat_messages;
create policy "chat_messages_delete_own"
  on public.chat_messages for delete to authenticated
  using (sender_id = (select public.requesting_user_id()));

grant select, insert, delete on table public.chat_messages to authenticated;
grant all on table public.chat_messages to service_role;
revoke all on table public.chat_messages from anon;

do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

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
