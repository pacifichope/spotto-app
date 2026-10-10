-- 手動適用用: clubs.bio / events.host_bio を削除
-- ※ migrations/20260410140000_drop_bio_fields.sql と同等

alter table if exists public.clubs
  drop column if exists bio;

alter table if exists public.events
  drop column if exists host_bio;
