-- Job photos (before / during / after), saved from the phone.
--   * Files are shrunk JPEGs re-saved on the phone, so they carry no GPS. Where a photo was taken
--     is kept only in photos.lat / photos.lng, shown to a customer only when the owner chooses.
--   * Each file lives at <business_id>/<job_id>/<photo_id>.jpg, and the row must point exactly there.
--   * Once the job's invoice is sent, its photos are part of the record: no changes, no deletes.

update storage.buckets
  set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg']
  where id = 'job-photos';

alter table public.photos
  add constraint photos_path_is_own check (storage_path = business_id::text || '/' || job_id::text || '/' || id::text || '.jpg'),
  add constraint photos_lat check (lat is null or lat between -90 and 90),
  add constraint photos_lng check (lng is null or lng between -180 and 180),
  add constraint photos_location_whole check ((lat is null) = (lng is null));

-- Only the tag can change, and only until the job's invoice is sent.
create function public.guard_photo() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (
    select 1 from public.invoices i
    where i.job_id in (old.job_id, coalesce(new.job_id, old.job_id)) and i.sent_at is not null
  ) then
    raise exception 'this job''s invoice was sent; its photos can''t be changed';
  end if;
  if tg_op = 'UPDATE' and (new.job_id, new.business_id, new.storage_path, new.lat, new.lng, new.taken_at)
      is distinct from (old.job_id, old.business_id, old.storage_path, old.lat, old.lng, old.taken_at) then
    raise exception 'only a photo''s tag can change';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger photos_guard before update or delete on public.photos
  for each row execute function public.guard_photo();

-- The same rule for the file itself: a sent invoice's photo files can't be deleted.
drop policy "members delete files" on storage.objects;
create policy "members delete files" on storage.objects for delete to authenticated
  using (
    bucket_id in ('job-photos', 'voice-notes', 'receipts')
    and public.is_member(((storage.foldername(name))[1])::uuid)
    and not (
      bucket_id = 'job-photos' and exists (
        select 1 from public.invoices i
        where i.job_id::text = (storage.foldername(name))[2] and i.sent_at is not null
      )
    )
  );
