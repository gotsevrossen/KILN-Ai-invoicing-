alter table public.invoices add column proof_photo_ids uuid[];

create function public.check_invoice_proof_photos() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.proof_photo_ids is null and new.sent_at is not null and old.sent_at is null then
    select array(select p.id from public.photos p where p.business_id = new.business_id and p.job_id = new.job_id
      and p.tag in ('before','after') order by p.taken_at, p.id limit 12) into new.proof_photo_ids;
  end if;
  if new.proof_photo_ids is not null and (cardinality(new.proof_photo_ids) > 12 or cardinality(new.proof_photo_ids) <> (
    select count(*) from public.photos p where p.id = any(new.proof_photo_ids)
      and p.business_id = new.business_id and p.job_id = new.job_id and p.tag in ('before','after')
  )) then raise exception 'Choose up to 12 before or after photos from this job'; end if;
  return new;
end $$;

create trigger invoices_proof_photos before update of proof_photo_ids, sent_at on public.invoices
  for each row execute function public.check_invoice_proof_photos();
