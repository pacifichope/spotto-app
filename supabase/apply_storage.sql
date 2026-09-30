-- =============================================================================
-- Supabase Storage: event-images バケット（イベント／プロフィール／お問い合わせ画像）
-- Dashboard → SQL Editor で実行
--
-- 必須:
--   - public = true（チャット・一覧の Image は認証なしで GET するため）
--   - anon / authenticated の SELECT 許可
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images',
  'event-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 公開読み取り（Public URL / Image コンポーネントからの匿名 GET 用）
drop policy if exists "event_images_public_read" on storage.objects;
create policy "event_images_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'event-images');

-- ログインユーザーのみアップロード（イベント／プロフィール／お問い合わせ）
drop policy if exists "event_images_authenticated_upload" on storage.objects;
create policy "event_images_authenticated_upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact', 'clubs')
  );

-- お問い合わせ添付のみ匿名でも可（ログイン前のフォーム用・contact/ 配下に限定）
drop policy if exists "event_images_anon_contact_upload" on storage.objects;
create policy "event_images_anon_contact_upload"
  on storage.objects
  for insert
  to anon
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = 'contact'
  );

drop policy if exists "event_images_authenticated_update" on storage.objects;
create policy "event_images_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact', 'clubs')
  )
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact', 'clubs')
  );

drop policy if exists "event_images_authenticated_delete" on storage.objects;
create policy "event_images_authenticated_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact', 'clubs')
  );

-- 確認
do $$
declare
  is_public boolean;
begin
  select public into is_public from storage.buckets where id = 'event-images';
  raise notice 'event-images.public = %', is_public;
end $$;
