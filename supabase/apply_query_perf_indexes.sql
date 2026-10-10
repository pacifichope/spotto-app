-- =============================================================================
-- 一覧・マップ・チャット取得のパフォーマンス用インデックス
-- =============================================================================

create index if not exists events_geo_active_idx
  on public.events (latitude, longitude)
  where cancelled_at is null
    and latitude is not null
    and longitude is not null;

create index if not exists events_date_active_idx
  on public.events (event_date)
  where cancelled_at is null;

create index if not exists events_host_date_active_idx
  on public.events (host_id, event_date)
  where cancelled_at is null;

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc);

create index if not exists chat_messages_event_created_idx
  on public.chat_messages (event_id, created_at desc);

create index if not exists event_participants_user_status_idx
  on public.event_participants (user_id, status);

notify pgrst, 'reload schema';
