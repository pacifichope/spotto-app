-- =============================================================================
-- public.chat_messages: イベントグループ／主催者DM のリモート同期
-- =============================================================================

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  mode text not null check (mode in ('group', 'host')),
  -- host DM の参加者側ユーザー。group では null
  dm_user_id uuid references auth.users (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
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

-- グループ: 認証ユーザーならイベントの会話を読める
drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select"
  on public.chat_messages
  for select
  to authenticated
  using (
    mode = 'group'
    or dm_user_id = auth.uid()
    or sender_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (
      mode = 'group'
      or (
        mode = 'host'
        and dm_user_id is not null
        and (
          dm_user_id = auth.uid()
          or exists (
            select 1 from public.events e
            where e.id = event_id and e.host_id = auth.uid()
          )
        )
      )
    )
  );

-- 自分の送信のみ削除可（任意）
drop policy if exists "chat_messages_delete_own" on public.chat_messages;
create policy "chat_messages_delete_own"
  on public.chat_messages
  for delete
  to authenticated
  using (sender_id = auth.uid());

grant select, insert, delete on table public.chat_messages to authenticated;
grant all on table public.chat_messages to service_role;
revoke all on table public.chat_messages from anon;

-- Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

-- 退会クリーンアップにチャットを含める
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
