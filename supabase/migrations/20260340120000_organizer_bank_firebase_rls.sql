-- organizer_bank_accounts を Firebase JWT（requesting_user_id）に揃える

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

alter table if exists public.organizer_bank_accounts
  drop constraint if exists organizer_bank_accounts_user_id_fkey;
alter table if exists public.organizer_bank_accounts
  alter column user_id type text using user_id::text;

create or replace function public.organizer_bank_accounts_enforce_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
  sess text := session_user;
  uid text := public.requesting_user_id();
begin
  if uid is null then
    if jwt_role = 'service_role'
       or sess in ('postgres', 'supabase_admin')
       or sess like 'postgres%' then
      new.updated_at := coalesce(new.updated_at, now());
      return new;
    end if;
    raise exception 'not authenticated' using errcode = 'P0001';
  end if;
  new.user_id := uid;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organizer_bank_accounts_enforce_owner on public.organizer_bank_accounts;
drop trigger if exists organizer_bank_accounts_set_owner on public.organizer_bank_accounts;
create trigger organizer_bank_accounts_enforce_owner
  before insert or update on public.organizer_bank_accounts
  for each row
  execute function public.organizer_bank_accounts_enforce_owner();

alter table public.organizer_bank_accounts enable row level security;
grant select, insert, update, delete on table public.organizer_bank_accounts to authenticated;

drop policy if exists "organizer_bank_accounts_select_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_select_own"
  on public.organizer_bank_accounts for select to authenticated
  using (user_id = (select public.requesting_user_id()));

drop policy if exists "organizer_bank_accounts_insert_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_insert_own"
  on public.organizer_bank_accounts for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "organizer_bank_accounts_update_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_update_own"
  on public.organizer_bank_accounts for update to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "organizer_bank_accounts_delete_own" on public.organizer_bank_accounts;
create policy "organizer_bank_accounts_delete_own"
  on public.organizer_bank_accounts for delete to authenticated
  using (user_id = (select public.requesting_user_id()));
