-- =============================================================================
-- 売上・振込管理（一式）
-- Supabase Dashboard → SQL Editor でこのファイルをそのまま実行してください。
--
-- 作成・更新するもの:
--   1) public.organizer_payouts     … 月次振込ステータス（未処理 / 振込完了）
--   2) profiles.is_admin            … 管理者フラグ（改ざん防止トリガー付き）
--   3) event_ticket_sales 拡張      … event_ends_at / refunded_yen
--   4) 主催者向け SELECT ポリシー + Realtime
--
-- 前提（未適用なら先に実行）:
--   - supabase/apply_events.sql
--   - supabase/apply_event_ticket_sales.sql
--   - （口座が必要なら）supabase/apply_organizer_bank_accounts.sql
--
-- 再実行しても安全（IF NOT EXISTS / DROP IF EXISTS 使用）。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. organizer_payouts
-- ---------------------------------------------------------------------------
create table if not exists public.organizer_payouts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  year_month text not null
    check (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  status text not null default 'pending'
    check (status in ('pending', 'paid')),
  gross_yen integer not null default 0 check (gross_yen >= 0),
  platform_fee_yen integer not null default 0 check (platform_fee_yen >= 0),
  payout_fee_yen integer not null default 0 check (payout_fee_yen >= 0),
  net_yen integer not null default 0 check (net_yen >= 0),
  paid_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_payouts_host_month unique (host_id, year_month)
);

create index if not exists organizer_payouts_year_month_idx
  on public.organizer_payouts (year_month, status);

create index if not exists organizer_payouts_host_id_idx
  on public.organizer_payouts (host_id);

alter table public.organizer_payouts enable row level security;

-- 書き込みは service role（運営 API）のみ。読み取りは本人のみ許可。
revoke all on table public.organizer_payouts from anon;
revoke all on table public.organizer_payouts from authenticated;
grant select on table public.organizer_payouts to authenticated;
grant all on table public.organizer_payouts to service_role;

drop policy if exists "organizer_payouts_select_own" on public.organizer_payouts;
create policy "organizer_payouts_select_own"
  on public.organizer_payouts for select to authenticated
  using (host_id = auth.uid());

-- Realtime（売上画面の振込完了反映用）
do $$
begin
  alter publication supabase_realtime add table public.organizer_payouts;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. profiles.is_admin（profiles が無い場合はスキップ）
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.profiles') is null then
    raise notice 'public.profiles が無いため is_admin はスキップします';
    return;
  end if;

  alter table public.profiles
    add column if not exists is_admin boolean not null default false;

  create or replace function public.profiles_protect_is_admin()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $fn$
  begin
    if tg_op = 'INSERT' then
      if coalesce(new.is_admin, false) = true
         and auth.role() is distinct from 'service_role' then
        new.is_admin := false;
      end if;
      return new;
    end if;

    if new.is_admin is distinct from old.is_admin
       and auth.role() is distinct from 'service_role' then
      new.is_admin := old.is_admin;
    end if;
    return new;
  end;
  $fn$;

  drop trigger if exists profiles_protect_is_admin on public.profiles;
  create trigger profiles_protect_is_admin
    before insert or update on public.profiles
    for each row
    execute function public.profiles_protect_is_admin();

  -- クライアントから is_admin 列は不可視（サーバー / ENV で判定）
  begin
    revoke select (is_admin) on table public.profiles from anon, authenticated;
  exception
    when undefined_column then null;
    when undefined_table then null;
  end;
  grant select (is_admin) on table public.profiles to service_role;
end $$;

-- ---------------------------------------------------------------------------
-- 3. event_ticket_sales 拡張（テーブルが無い場合はスキップ）
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.event_ticket_sales') is null then
    raise notice 'public.event_ticket_sales が無いため列追加はスキップします。先に apply_event_ticket_sales.sql を実行してください';
    return;
  end if;

  alter table public.event_ticket_sales
    add column if not exists event_ends_at timestamptz;

  alter table public.event_ticket_sales
    add column if not exists refunded_yen integer not null default 0;

  -- 制約（既存なら付け直し）
  alter table public.event_ticket_sales
    drop constraint if exists event_ticket_sales_refunded_yen_check;
  alter table public.event_ticket_sales
    add constraint event_ticket_sales_refunded_yen_check
    check (refunded_yen >= 0);

  create index if not exists event_ticket_sales_host_ends_at_idx
    on public.event_ticket_sales (host_id, event_ends_at);

  update public.event_ticket_sales
  set event_ends_at = (event_date::timestamptz + interval '1 day')
  where event_ends_at is null
    and event_date is not null;
end $$;

notify pgrst, 'reload schema';
