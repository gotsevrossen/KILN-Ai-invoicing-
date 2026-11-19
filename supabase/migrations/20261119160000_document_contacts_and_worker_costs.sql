-- Preserve historical visits while removing scheduling from signed-in clients.
revoke insert, update, delete on public.operations_visits from authenticated;

-- Add business contacts to newly created document snapshots. Previously signed snapshots stay intact.
create or replace function public.prepare_estimate_access(p_job_id uuid, p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.estimates; snap jsonb; lid uuid;
begin
  select * into e from public.estimates where job_id=p_job_id for update;
  if e.id is null or not public.is_owner(e.business_id) or e.sent_at is null then raise exception 'not allowed'; end if;
  select public.signed_document('estimate',e.id) || jsonb_build_object(
    'business_name',b.name,'business_phone',b.phone,'business_email',b.email,'business_address',b.address,'customer_name',c.name,'lang',c.lang,
    'address',j.address,'title',j.title,'issued_at',e.sent_at)
    into snap from public.jobs j join public.customers c on c.id=j.customer_id
    join public.businesses b on b.id=e.business_id where j.id=e.job_id;
  insert into public.estimate_access_links(business_id,estimate_id,token_hash,snapshot,snapshot_hash,document_hash)
    values(e.business_id,e.id,p_hash,snap,encode(sha256(convert_to(snap::text,'UTF8')),'hex'),public.document_fingerprint('estimate',e.id)) returning id into lid;
  insert into public.document_delivery_events(business_id,document_type,document_id,stage) values(e.business_id,'estimate',e.id,'link_prepared');
  return lid;
end $$;
revoke all on function public.prepare_estimate_access(uuid,text) from public, anon;
grant execute on function public.prepare_estimate_access(uuid,text) to authenticated;

-- Only the token-checking Edge Function may execute these public-link operations.

create or replace function public.change_order_link_snapshot(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select public.signed_document('change_order',co.id) || jsonb_build_object(
    'business_name',b.name,'business_phone',b.phone,'business_email',b.email,'business_address',b.address,'customer_name',c.name,'lang',c.lang,
    'job_title',j.title,'address',j.address,'work_order',j.work_order,'issued_at',co.sent_at)
  from public.change_orders co join public.businesses b on b.id=co.business_id
  join public.jobs j on j.id=co.job_id join public.customers c on c.id=j.customer_id
  where co.id=p_id and co.sent_at is not null;
$$;

create function public.archive_business_contact() returns trigger
language plpgsql set search_path = '' as $$
declare b record;
begin
  select email, address into b from public.businesses where id = new.business_id;
  new.snapshot := jsonb_set(new.snapshot, '{business}',
    coalesce(new.snapshot->'business', '{}'::jsonb) ||
      jsonb_build_object('email', b.email, 'address', b.address));
  return new;
end $$;

revoke all on function public.archive_business_contact() from public, anon, authenticated;
create trigger archive_business_contact before insert on public.saved_documents
for each row execute function public.archive_business_contact();
