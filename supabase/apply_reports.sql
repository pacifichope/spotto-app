-- Apply: public.reports（通報）
-- 使い方: SQL Editor で実行

create or replace function public.requesting_user_id()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

grant execute on function public.requesting_user_id() to anon, authenticated, service_role;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null,
  target_id text not null,
  target_type text not null default 'user'
    check (target_type in ('user', 'event', 'message', 'other')),
  target_name text not null default '',
  reason text not null,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint reports_reason_len check (
    char_length(trim(reason)) between 1 and 2000
  ),
  constraint reports_target_id_len check (
    char_length(trim(target_id)) between 1 and 200
  )
);

create index if not exists reports_created_at_idx
  on public.reports (created_at desc);

create index if not exists reports_status_created_at_idx
  on public.reports (status, created_at desc);

create index if not exists reports_target_idx
  on public.reports (target_type, target_id);

create index if not exists reports_reporter_id_idx
  on public.reports (reporter_id);

alter table public.reports enable row level security;

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (
    reporter_id = (select public.requesting_user_id())
  );

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own"
  on public.reports for select
  to authenticated
  using (
    reporter_id = (select public.requesting_user_id())
  );

grant select, insert on table public.reports to authenticated;
grant all on table public.reports to service_role;
revoke all on table public.reports from anon;

notify pgrst, 'reload schema';
