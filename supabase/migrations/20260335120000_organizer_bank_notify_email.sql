-- =============================================================================
-- 振込口座: notify_email カラム追加（SQL Editor 用・再実行可）
--
-- 以前の版は UPDATE が organizer_bank_accounts_enforce_owner() を発火し、
-- SQL Editor（auth.uid() = null）で P0001: not authenticated になっていました。
-- 本スクリプトはトリガーを一時無効化してから列を追加します。
-- =============================================================================

-- 1) 所有者強制トリガーを一時停止（存在しなければスキップ）
alter table public.organizer_bank_accounts
  disable trigger if exists organizer_bank_accounts_enforce_owner;

-- 2) カラム追加（定数 DEFAULT なら既存行も書き換えトリガー無しで埋まる）
alter table public.organizer_bank_accounts
  add column if not exists notify_email text;

-- 3) 既存 NULL を空文字に（トリガー無効中のみ安全）
update public.organizer_bank_accounts
set notify_email = ''
where notify_email is null;

-- 4) NOT NULL + DEFAULT
alter table public.organizer_bank_accounts
  alter column notify_email set default '';

alter table public.organizer_bank_accounts
  alter column notify_email set not null;

-- 5) 形式制約
alter table public.organizer_bank_accounts
  drop constraint if exists organizer_bank_accounts_notify_email_format;

alter table public.organizer_bank_accounts
  add constraint organizer_bank_accounts_notify_email_format
  check (
    notify_email = ''
    or notify_email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
  );

alter table public.organizer_bank_accounts
  drop constraint if exists organizer_bank_accounts_notify_email_len;

alter table public.organizer_bank_accounts
  add constraint organizer_bank_accounts_notify_email_len
  check (char_length(notify_email) <= 254);

-- 6) トリガー復帰
alter table public.organizer_bank_accounts
  enable trigger if exists organizer_bank_accounts_enforce_owner;

-- 7) 今後の SQL Editor / service_role バッチ更新で落ちないようトリガーを緩和
--    （クライアント JWT 無しの改ざんは引き続き拒否。ログイン中は従来どおり user_id = auth.uid()）
create or replace function public.organizer_bank_accounts_enforce_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
  sess text := session_user;
begin
  -- マイグレーション / ダッシュボード SQL / service_role
  if auth.uid() is null then
    if jwt_role = 'service_role'
       or sess in ('postgres', 'supabase_admin', 'supabase_admin')
       or sess like 'postgres%' then
      new.updated_at := coalesce(new.updated_at, now());
      return new;
    end if;
    raise exception 'not authenticated';
  end if;

  new.user_id := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

notify pgrst, 'reload schema';
