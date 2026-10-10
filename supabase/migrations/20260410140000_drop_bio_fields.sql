-- 自己紹介（bio / host_bio）カラムを廃止
-- アプリ側は既に読み書きしない。既存データは破棄してよい。

alter table if exists public.clubs
  drop column if exists bio;

alter table if exists public.events
  drop column if exists host_bio;
