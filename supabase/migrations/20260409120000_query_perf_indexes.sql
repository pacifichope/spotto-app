-- =============================================================================
-- 一覧・マップ・チャット取得のパフォーマンス用インデックス
-- =============================================================================

-- マップ bounds / 地域検索（緯度経度 + 未キャンセル）
create index if not exists events_geo_active_idx
  on public.events (latitude, longitude)
  where cancelled_at is null
    and latitude is not null
    and longitude is not null;

-- 公開一覧・日付順（未キャンセル）
create index if not exists events_date_active_idx
  on public.events (event_date)
  where cancelled_at is null;

-- クラブ詳細: 主催者のイベント一覧
create index if not exists events_host_date_active_idx
  on public.events (host_id, event_date)
  where cancelled_at is null;

-- インボックス: 新着順スキャン
create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc);

-- ルーム: イベント内の時系列
create index if not exists chat_messages_event_created_idx
  on public.chat_messages (event_id, created_at desc);

-- 参加クラブ / インボックス: ユーザーの参加行
create index if not exists event_participants_user_status_idx
  on public.event_participants (user_id, status);

notify pgrst, 'reload schema';
