-- 複数日程イベント: 開催回ごとに独立した events 行を持つ。
-- series_id で同一作成（シリーズ）をグループ化する。

alter table public.events
  add column if not exists series_id text;

create index if not exists events_series_id_idx
  on public.events (series_id)
  where series_id is not null;

comment on column public.events.series_id is
  '同一テンプレートから展開した開催回を束ねる ID。各行は独立した参加・定員を持つ。';

notify pgrst, 'reload schema';
