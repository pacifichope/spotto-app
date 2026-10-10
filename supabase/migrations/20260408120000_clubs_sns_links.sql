-- clubs.sns_links: サークルの SNS / Web リンク（複数）

alter table public.clubs
  add column if not exists sns_links jsonb not null default '[]'::jsonb;

comment on column public.clubs.sns_links is
  'SNS / Web リンク配列 [{ id, kind, url }]';

notify pgrst, 'reload schema';
