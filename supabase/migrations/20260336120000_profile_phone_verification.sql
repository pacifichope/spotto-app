-- =============================================================================
-- profiles: 電話番号（SMS）認証フラグ
-- SQL Editor 再実行可
-- =============================================================================

alter table public.profiles
  add column if not exists is_phone_verified boolean not null default false;

alter table public.profiles
  add column if not exists phone_e164 text;

alter table public.profiles
  add column if not exists phone_verified_at timestamptz;

comment on column public.profiles.is_phone_verified is
  'SMS 電話番号認証済みなら true。未認証ユーザーはアプリ主要機能へ進めない';
comment on column public.profiles.phone_e164 is
  '認証済み電話番号（E.164、例: +819012345678）';
comment on column public.profiles.phone_verified_at is
  '電話番号認証が完了した日時';

create index if not exists profiles_is_phone_verified_idx
  on public.profiles (is_phone_verified)
  where is_phone_verified = false;

-- 既存の整合: phone_e164 がある行は verified 扱い
update public.profiles
set
  is_phone_verified = true,
  phone_verified_at = coalesce(phone_verified_at, updated_at, now())
where coalesce(phone_e164, '') <> ''
  and is_phone_verified = false;

notify pgrst, 'reload schema';
