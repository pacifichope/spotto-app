-- RLS 監査用（読み取り専用）

select
  tablename,
  policyname,
  roles,
  cmd,
  permissive,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'blocks',
    'events',
    'event_participants',
    'chat_messages',
    'event_favorites',
    'device_push_tokens'
  )
order by tablename, cmd, policyname;

-- anon / authenticated の権限
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'profiles',
    'blocks',
    'events',
    'event_participants',
    'chat_messages',
    'event_favorites',
    'device_push_tokens'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

-- 期待:
-- events: SELECT は anon+authenticated、INSERT/UPDATE/DELETE は host_id = auth.uid()
-- event_participants / event_favorites / device_push_tokens: 自分の user_id のみ書込
-- chat_messages: sender_id = auth.uid() で insert、select は group または当事者
-- blocks: blocker のみ書込、当事者のみ select
-- profiles: 書込は id = auth.uid()、select は authenticated で閲覧可
-- anon は events の SELECT 以外にテーブル権限がないこと
