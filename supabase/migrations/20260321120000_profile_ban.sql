-- アカウント凍結（BAN）フラグ
-- Dashboard / service_role からのみ is_banned 等を変更する想定。
-- クライアント（authenticated）が自分で BAN を解除・改ざんできないようトリガーで保護する。

alter table public.profiles
  add column if not exists is_banned boolean not null default false;

alter table public.profiles
  add column if not exists banned_at timestamptz;

alter table public.profiles
  add column if not exists ban_reason text;

comment on column public.profiles.is_banned is
  'true のときアプリは強制ログアウト／操作拒否する';
comment on column public.profiles.banned_at is
  '凍結した日時（任意）';
comment on column public.profiles.ban_reason is
  '凍結理由（管理用・任意。クライアントには出さない想定）';

create index if not exists profiles_is_banned_idx
  on public.profiles (is_banned)
  where is_banned = true;

create or replace function public.profiles_prevent_client_ban_tamper()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role / スーパーユーザー以外は BAN 関連カラムを変更不可
  if auth.role() = 'authenticated' then
    if tg_op = 'UPDATE' then
      if new.is_banned is distinct from old.is_banned
        or new.banned_at is distinct from old.banned_at
        or new.ban_reason is distinct from old.ban_reason
      then
        raise exception 'ban fields are read-only for clients';
      end if;
    elsif tg_op = 'INSERT' then
      if coalesce(new.is_banned, false) = true
        or new.banned_at is not null
        or new.ban_reason is not null
      then
        raise exception 'ban fields are read-only for clients';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_client_ban_tamper on public.profiles;
create trigger profiles_prevent_client_ban_tamper
  before insert or update on public.profiles
  for each row
  execute function public.profiles_prevent_client_ban_tamper();
