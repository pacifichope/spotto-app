-- 支店番号追加 + 口座番号は7桁の半角数字に統一
alter table public.organizer_bank_accounts
  add column if not exists branch_number text;

-- 既存行の空文字を許容しつつ、新規制約用に埋める
update public.organizer_bank_accounts
set branch_number = coalesce(nullif(trim(branch_number), ''), '000')
where branch_number is null or trim(branch_number) = '';

alter table public.organizer_bank_accounts
  alter column branch_number set default '000';

alter table public.organizer_bank_accounts
  alter column branch_number set not null;

alter table public.organizer_bank_accounts
  drop constraint if exists organizer_bank_accounts_number_digits;

alter table public.organizer_bank_accounts
  add constraint organizer_bank_accounts_number_digits
  check (account_number ~ '^[0-9]{7}$');

alter table public.organizer_bank_accounts
  drop constraint if exists organizer_bank_accounts_branch_number_digits;

alter table public.organizer_bank_accounts
  add constraint organizer_bank_accounts_branch_number_digits
  check (branch_number ~ '^[0-9]{3}$');

notify pgrst, 'reload schema';
