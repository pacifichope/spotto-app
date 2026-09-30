-- Storage: event-images バケット + contact 匿名アップロード許可
-- （supabase/apply_storage.sql と同内容）

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

drop policy if exists "event_images_public_read" on storage.objects;
create policy "event_images_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'event-images');

drop policy if exists "event_images_authenticated_upload" on storage.objects;
create policy "event_images_authenticated_upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact')
  );

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
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact')
  )
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact')
  );

drop policy if exists "event_images_authenticated_delete" on storage.objects;
create policy "event_images_authenticated_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact')
  );
