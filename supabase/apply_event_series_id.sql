-- Apply: events.series_id（開催回ごとの独立イベント）
-- 使い方: SQL Editor で実行

alter table public.events
  add column if not exists series_id text;

create index if not exists events_series_id_idx
  on public.events (series_id)
  where series_id is not null;

comment on column public.events.series_id is
  '同一テンプレートから展開した開催回を束ねる ID。各行は独立した参加・定員を持つ。';

notify pgrst, 'reload schema';
