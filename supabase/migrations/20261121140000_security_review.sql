-- A client may edit draft records. Settlement and the owner's deletion decisions must
-- pass the ledger and retention procedures, including when a client uses the REST API directly.
create function public.guard_cleanup_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.removal_warned_at is null and new.documents_choice is null then return new; end if;
    elsif (new.removal_warned_at, new.documents_choice) is not distinct from
          (old.removal_warned_at, old.documents_choice) then return new;
    end if;
    raise exception using errcode = '42501', message = 'Use the owner cleanup procedures';
  end if;
  return new;
end $$;
create trigger jobs_cleanup_fields before insert or update of removal_warned_at, documents_choice on public.jobs
  for each row execute function public.guard_cleanup_fields();

create function public.guard_invoice_settlement() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'Record a payment to settle an invoice';
  end if;
  return new;
end $$;
create trigger invoices_settlement before update of paid_at on public.invoices
  for each row when (new.paid_at is distinct from old.paid_at) execute function public.guard_invoice_settlement();

-- Supabase's default table grants include privileges that row-level security cannot restrict.
revoke truncate, references, trigger on all tables in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated;
revoke all on function public.guard_cleanup_fields(), public.guard_invoice_settlement() from public, anon, authenticated;

-- Membership creation and invitation redemption take the same per-person lock.
create or replace function public.create_business(
  p_name text, p_phone text, p_trades text[], p_pricing text, p_rate_cents integer
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  bid uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists (select 1 from public.business_members where user_id = (select auth.uid())) then
    raise exception 'this account already has a business';
  end if;
  insert into public.businesses (name, phone, trades, pricing, rate_cents)
    values (p_name, coalesce(p_phone, ''), coalesce(p_trades, '{}'), p_pricing, p_rate_cents)
    returning id into bid;
  insert into public.business_members (business_id, user_id, role) values (bid, (select auth.uid()), 'owner');
  return bid;
end;
$$;

revoke execute on function public.create_business(text,text,text[],text,integer) from public, anon;
grant execute on function public.create_business(text,text,text[],text,integer) to authenticated;

-- All keys sent to Storage must belong to the business whose job was purged.
create function public.owned_storage_path(bid uuid, path text) returns boolean
language sql immutable strict set search_path = '' as $$
  select starts_with(path, bid::text || '/') and path !~ '(/$|//|/\.\.?(/|$)|[[:cntrl:]%\\])';
$$;
alter table public.voice_notes add constraint voice_path_owned check (public.owned_storage_path(business_id,storage_path)) not valid;
alter table public.receipts add constraint receipt_path_owned check (public.owned_storage_path(business_id,storage_path)) not valid;

-- Old queue entries have no recorded source business. Preserve them for manual reconciliation.
alter table public.job_cleanup_files rename to job_cleanup_files_unverified;
revoke all on public.job_cleanup_files_unverified from service_role;
create table public.job_cleanup_files (
  bucket text not null check (bucket in ('job-photos','voice-notes','receipts')),
  path text not null,
  business_id uuid not null,
  queued_at timestamptz not null default now(),
  unique (bucket,path),
  check (public.owned_storage_path(business_id,path))
);
alter table public.job_cleanup_files enable row level security;
revoke all on public.job_cleanup_files from public, anon, authenticated, service_role;
grant select, delete on public.job_cleanup_files to service_role;

-- The original collector is private. Filter legacy row paths before either cleanup worker sees them.
alter function public.purge_job(uuid) rename to purge_job_records;
revoke all on function public.purge_job_records(uuid) from public, anon, authenticated, service_role;
create function public.purge_job(p_job uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare bid uuid; result jsonb; safe_files jsonb;
begin
  select business_id into bid from public.jobs where id=p_job for update;
  result := public.purge_job_records(p_job);
  select jsonb_object_agg(bucket.key, coalesce((
    select jsonb_agg(file.path) from jsonb_array_elements_text(bucket.value) file(path)
    where public.owned_storage_path(bid,file.path)
  ), '[]'::jsonb)) into safe_files from jsonb_each(result->'files') bucket;
  return jsonb_set(result,'{files}',safe_files);
end $$;
revoke all on function public.purge_job(uuid) from public, anon, authenticated;
grant execute on function public.purge_job(uuid) to service_role;

create or replace function public.purge_job_and_queue_files(p_job uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare bid uuid; result jsonb;
begin
  select business_id into bid from public.jobs where id=p_job for update;
  result := public.purge_job(p_job);
  insert into public.job_cleanup_files(business_id,bucket,path)
    select bid,bucket.key,file.path from jsonb_each(result->'files') bucket
    cross join lateral jsonb_array_elements_text(bucket.value) file(path)
    on conflict do nothing;
  return result;
end $$;

-- Only the validated on-device and customer-link signing procedures may create evidence.
revoke insert on public.signatures from public, anon, authenticated;
revoke execute on function public.sign_estimate(uuid,text,text), public.sign_change_order(uuid,text,text)
  from public, anon, authenticated;
alter table public.signatures add constraint signature_name_present
  check (length(btrim(signer_name)) between 1 and 120) not valid;

-- Generate activity from committed row changes, including when the phone retries after a lost reply.
create function public.audit_document_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare source jsonb := to_jsonb(coalesce(new,old));
begin
  if auth.uid() is not null then
    insert into public.audit_log(business_id,actor,action,entity,entity_id)
      values ((source->>'business_id')::uuid,auth.uid(),tg_argv[0],tg_argv[1],(source->>'id')::uuid);
  end if;
  return null;
end $$;
revoke all on function public.audit_document_event() from public, anon, authenticated;
create trigger audit_job_deleted after delete on public.jobs for each row execute function public.audit_document_event('job.deleted','job');
create trigger audit_estimate_sent after update of sent_at on public.estimates for each row
  when (old.sent_at is null and new.sent_at is not null) execute function public.audit_document_event('estimate.sent','estimate');
create trigger audit_invoice_created after insert on public.invoices for each row execute function public.audit_document_event('invoice.created','invoice');
create trigger audit_invoice_sent after update of sent_at on public.invoices for each row
  when (old.sent_at is null and new.sent_at is not null) execute function public.audit_document_event('invoice.sent','invoice');
create trigger audit_change_created after insert on public.change_orders for each row execute function public.audit_document_event('change_order.created','change_order');
create trigger audit_change_declined after update of declined_at on public.change_orders for each row
  when (old.declined_at is null and new.declined_at is not null) execute function public.audit_document_event('change_order.declined','change_order');
create trigger audit_change_signed after update of signed_at on public.change_orders for each row
  when (old.signed_at is null and new.signed_at is not null) execute function public.audit_document_event('change_order.signed','change_order');
create trigger audit_estimate_signed after update of signed_at on public.estimates for each row
  when (old.signed_at is null and new.signed_at is not null) execute function public.audit_document_event('estimate.signed','estimate');

-- Old mobile clients and the invoker-rights send_invoice RPC still submit a redundant insert.
-- A matching server entry acknowledges the retry. No client-supplied event is stored.
create function public.guard_audit_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') then
    if new.actor = auth.uid() and exists (
      select 1 from public.audit_log a where a.business_id=new.business_id and a.actor=new.actor
        and a.action=new.action and a.entity=new.entity and a.entity_id=new.entity_id
    ) then return null; end if;
    raise exception using errcode='42501', message='Audit events are recorded by the server';
  end if;
  return new;
end $$;
revoke all on function public.guard_audit_insert() from public, anon, authenticated;
create trigger audit_insert before insert on public.audit_log for each row execute function public.guard_audit_insert();

create or replace function public.record_invoice_link_view() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.document_type='invoice' and old.opened_at is null and new.opened_at is not null then
    insert into public.document_delivery_events(business_id,document_type,document_id,stage)
      values(new.business_id,'invoice',new.document_id,'customer_viewed');
    insert into public.audit_log(business_id,actor,action,entity,entity_id)
      values(new.business_id,null,'invoice.opened','invoice',new.document_id);
  end if;
  return new;
end $$;
