-- 主催者振込口座（本人のみ読み書き。profiles には載せない）
create table if not exists public.organizer_bank_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bank_name text not null,
  branch_name text not null,
  account_type text not null check (account_type in ('ordinary', 'checking')),
  account_number text not null,
  account_holder_kana text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_bank_accounts_bank_name_len
    check (char_length(trim(bank_name)) between 1 and 80),
  constraint organizer_bank_accounts_branch_name_len
    check (char_length(trim(branch_name)) between 1 and 80),
  constraint organizer_bank_accounts_number_digits
    check (account_number ~ '^[0-9]{7,8}$'),
  constraint organizer_bank_accounts_holder_kana_len
    check (char_length(trim(account_holder_kana)) between 1 and 80)
);

create index if not exists organizer_bank_accounts_updated_at_idx
  on public.organizer_bank_accounts (updated_at desc);

alter table public.organizer_bank_accounts enable row level security;

drop policy if exists "organizer_bank_accounts_select_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_select_own"
  on public.organizer_bank_accounts for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "organizer_bank_accounts_insert_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_insert_own"
  on public.organizer_bank_accounts for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "organizer_bank_accounts_update_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_update_own"
  on public.organizer_bank_accounts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "organizer_bank_accounts_delete_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_delete_own"
  on public.organizer_bank_accounts for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.organizer_bank_accounts to authenticated;
grant all on table public.organizer_bank_accounts to service_role;
revoke all on table public.organizer_bank_accounts from anon;

-- 退会時に口座も削除
create or replace function public.delete_own_app_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.organizer_bank_accounts where user_id = uid;
  delete from public.device_push_tokens where user_id = uid;
  delete from public.chat_messages where sender_id = uid or dm_user_id = uid;
  delete from public.event_favorites where user_id = uid;
  delete from public.event_participants where user_id = uid;
  delete from public.events where host_id = uid;
  delete from public.blocks
  where blocker_id = uid or blocked_id = uid::text;
  delete from public.profiles where id = uid;
end;
$$;

revoke all on function public.delete_own_app_data() from public;
grant execute on function public.delete_own_app_data() to authenticated;
grant execute on function public.delete_own_app_data() to service_role;

notify pgrst, 'reload schema';
