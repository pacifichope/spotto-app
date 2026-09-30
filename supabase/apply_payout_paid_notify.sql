-- 振込完了通知: notified_at + DB トリガー → Edge Function (notify-payout-paid)
--
-- 事前準備:
--   1) supabase functions deploy notify-payout-paid --no-verify-jwt
--   2) Edge Secrets: RESEND_*（または SENDGRID_*）, PAYOUT_NOTIFY_SECRET（任意）
--   3) 下記の URL / 秘密を runtime_config に設定（SQL Editor で UPDATE）
--
-- 例:
--   update public.app_runtime_config set value = 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-payout-paid'
--     where key = 'payout_notify_url';
--   update public.app_runtime_config set value = '<PAYOUT_NOTIFY_SECRET>'
--     where key = 'payout_notify_secret';

create extension if not exists pg_net with schema extensions;

alter table public.organizer_payouts
  add column if not exists notified_at timestamptz;

create table if not exists public.app_runtime_config (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_runtime_config enable row level security;
revoke all on table public.app_runtime_config from anon, authenticated;
grant all on table public.app_runtime_config to service_role;

insert into public.app_runtime_config (key, value)
values
  ('payout_notify_url', ''),
  ('payout_notify_secret', '')
on conflict (key) do nothing;

create or replace function public.request_payout_paid_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  notify_url text;
  notify_secret text;
  payload jsonb;
  headers jsonb;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if new.status is distinct from 'paid' then
    return new;
  end if;
  if old.status is not distinct from 'paid' then
    return new;
  end if;

  select nullif(trim(value), '') into notify_url
  from public.app_runtime_config
  where key = 'payout_notify_url';

  select coalesce(trim(value), '') into notify_secret
  from public.app_runtime_config
  where key = 'payout_notify_secret';

  if notify_url is null then
    raise notice '[payout_notify] payout_notify_url 未設定のためスキップ id=%', new.id;
    return new;
  end if;

  payload := jsonb_build_object(
    'type', 'UPDATE',
    'table', 'organizer_payouts',
    'schema', 'public',
    'record', to_jsonb(new),
    'old_record', to_jsonb(old)
  );

  headers := jsonb_build_object(
    'Content-Type', 'application/json'
  );
  if notify_secret <> '' then
    headers := headers || jsonb_build_object(
      'x-spotto-notify-secret', notify_secret,
      'Authorization', 'Bearer ' || notify_secret
    );
  end if;

  perform net.http_post(
    url := notify_url,
    headers := headers,
    body := payload,
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    raise warning '[payout_notify] trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists organizer_payouts_notify_paid on public.organizer_payouts;
create trigger organizer_payouts_notify_paid
  after update of status on public.organizer_payouts
  for each row
  execute function public.request_payout_paid_notify();

-- INSERT でいきなり paid になるケースも通知
create or replace function public.request_payout_paid_notify_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  notify_url text;
  notify_secret text;
  payload jsonb;
  headers jsonb;
begin
  if new.status is distinct from 'paid' then
    return new;
  end if;

  select nullif(trim(value), '') into notify_url
  from public.app_runtime_config
  where key = 'payout_notify_url';

  select coalesce(trim(value), '') into notify_secret
  from public.app_runtime_config
  where key = 'payout_notify_secret';

  if notify_url is null then
    return new;
  end if;

  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'organizer_payouts',
    'schema', 'public',
    'record', to_jsonb(new),
    'old_record', null
  );

  headers := jsonb_build_object('Content-Type', 'application/json');
  if notify_secret <> '' then
    headers := headers || jsonb_build_object(
      'x-spotto-notify-secret', notify_secret,
      'Authorization', 'Bearer ' || notify_secret
    );
  end if;

  perform net.http_post(
    url := notify_url,
    headers := headers,
    body := payload,
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    raise warning '[payout_notify] insert trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists organizer_payouts_notify_paid_insert on public.organizer_payouts;
create trigger organizer_payouts_notify_paid_insert
  after insert on public.organizer_payouts
  for each row
  when (new.status = 'paid')
  execute function public.request_payout_paid_notify_insert();

notify pgrst, 'reload schema';
