-- 振込口座: user_id を常に auth.uid() に固定（クライアント改ざん防止）
create or replace function public.organizer_bank_accounts_enforce_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  new.user_id := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organizer_bank_accounts_enforce_owner on public.organizer_bank_accounts;
create trigger organizer_bank_accounts_enforce_owner
  before insert or update on public.organizer_bank_accounts
  for each row
  execute function public.organizer_bank_accounts_enforce_owner();

-- RLS 再確認（本人のみ）
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

revoke all on table public.organizer_bank_accounts from anon;

notify pgrst, 'reload schema';
