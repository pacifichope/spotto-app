-- Storage: clubs/ フォルダを event-images バケットに追加
-- （apply_clubs.sql にも同趣旨あり。単体適用用）

drop policy if exists "event_images_authenticated_upload" on storage.objects;
create policy "event_images_authenticated_upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] in ('events', 'profiles', 'contact', 'clubs')
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
