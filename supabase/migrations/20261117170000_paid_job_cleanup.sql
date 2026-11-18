-- Paid jobs leave KILN 30 days after they're paid (Rossen's call, Nov 17 2026).
--
-- * A job counts as paid when it has at least one invoice, every invoice is paid, and it wasn't reopened.
-- * One day before, the owner sees a warning and picks: save the documents, or let them go.
-- * The owner must have seen that warning before the job is removed. If they haven't opened KILN by
--   day 30, the job waits; after they see the warning they get one more day (or less, if they choose).
-- * "Save documents automatically" (owner setting): documents are always saved and nobody is warned.
-- * Only documents are kept: each sent estimate, sent invoice and answered change order, as a copy
--   of its saved rows (lines, payments, signatures) in saved_documents. Everything else is erased:
--   the job, its notes, hours, photos, voice notes, work, payments and links. Files are removed by
--   the job-cleanup server function, which calls purge_job() below.
--
-- The rules that stop sent documents and signatures from being deleted stay in force. Only
-- purge_job(), running as the database owner, may pass them (kiln_purging()).

-- ---------------------------------------------------------------- settings and per-job state

alter table public.businesses add column auto_save_documents boolean not null default false;
alter table public.jobs add column removal_warned_at timestamptz;
alter table public.jobs add column documents_choice text check (documents_choice in ('save', 'discard'));

-- ---------------------------------------------------------------- saved documents

create table public.saved_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- the removed job's id, to group its documents; the job itself no longer exists
  job_id uuid not null,
  job_title text not null,
  job_address text not null default '',
  customer_name text not null default '',
  document_type text not null check (document_type in ('estimate', 'invoice', 'change_order')),
  number text,
  issued_at timestamptz,
  paid_at timestamptz,
  snapshot jsonb not null,
  saved_at timestamptz not null default now()
);
create index on public.saved_documents (business_id, saved_at desc);
alter table public.saved_documents enable row level security;
-- owners and managers read them; only the owner deletes one; nobody writes them from the app
create policy "owners and managers read saved documents" on public.saved_documents
  for select to authenticated using (public.is_owner(business_id));
create policy "owner deletes saved documents" on public.saved_documents
  for delete to authenticated using (public.is_business_owner(business_id));
grant select, delete on public.saved_documents to authenticated;
revoke insert, update on public.saved_documents from authenticated, anon;

-- ---------------------------------------------------------------- the one way past the delete rules

-- True only inside purge_job(): the flag is set there, and the statement runs as the database
-- owner, never as a signed-in user. Neither can be done from the app.
create function public.kiln_purging() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('kiln.purge', true), '') = 'on' and current_user not in ('anon', 'authenticated', 'service_role');
$$;

create or replace function public.block_record_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.kiln_purging() then return old; end if;
  -- (each table's own fields; a change order counts once it's answered)
  if tg_table_name = 'change_orders' then
    if old.signed_at is not null or old.declined_at is not null then
      raise exception 'a sent or signed document can''t be deleted';
    end if;
  elsif old.sent_at is not null then
    raise exception 'a sent or signed document can''t be deleted';
  end if;
  return old;
end $$;

create or replace function public.check_job_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.kiln_purging() then return old; end if;
  if exists (select 1 from public.estimates e where e.job_id = old.id and e.sent_at is not null)
     or exists (select 1 from public.invoices i where i.job_id = old.id and i.sent_at is not null)
     or exists (select 1 from public.change_orders c where c.job_id = old.id and (c.signed_at is not null or c.declined_at is not null)) then
    raise exception 'a job with a sent or signed document can''t be deleted';
  end if;
  return old;
end $$;

create or replace function public.block_frozen_lines() returns trigger
language plpgsql set search_path = '' as $$
declare
  old_parent uuid;
  new_parent uuid;
  frozen boolean;
begin
  if tg_op = 'DELETE' and public.kiln_purging() then return old; end if;
  if tg_table_name = 'estimate_lines' then
    old_parent := (to_jsonb(old) ->> 'estimate_id')::uuid;
    new_parent := (to_jsonb(new) ->> 'estimate_id')::uuid;
    select exists (select 1 from public.estimates e where e.id in (old_parent, new_parent) and e.sent_at is not null) into frozen;
  else
    old_parent := (to_jsonb(old) ->> 'invoice_id')::uuid;
    new_parent := (to_jsonb(new) ->> 'invoice_id')::uuid;
    select exists (select 1 from public.invoices i where i.id in (old_parent, new_parent) and i.sent_at is not null) into frozen;
  end if;
  if frozen then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.block_invoiced_work() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and public.kiln_purging() then return old; end if;
  if exists (
    select 1 from public.invoices i
    where i.job_id in (old.job_id, new.job_id) and i.sent_at is not null
  ) then
    raise exception 'this job''s invoice was sent; its work can''t be changed';
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.guard_photo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and public.kiln_purging() then return old; end if;
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
end $$;

create or replace function public.keep_signature_evidence() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and public.kiln_purging() then return old; end if;
  raise exception 'Approval evidence cannot be changed or removed';
end $$;

-- ---------------------------------------------------------------- when a job leaves

-- When the job's last invoice was paid, or null if it isn't fully paid.
create function public.job_paid_at(p_job uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when count(*) > 0 and count(*) = count(i.paid_at) then max(i.paid_at) end
  from public.invoices i
  where i.job_id = p_job and not exists (select 1 from public.jobs j where j.id = p_job and j.reopened);
$$;

-- The owner's business, or null for anyone else.
create function public.owned_business() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.business_id from public.business_members m
  where m.user_id = (select auth.uid()) and m.role = 'owner' and m.status = 'active' limit 1;
$$;

-- Due: 30 days after payment, and either documents save automatically, or the owner saw the
-- warning and chose, or a full day has passed since they saw it.
create function public.job_removal_due(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select paid + interval '30 days' <= now()
      and (b.auto_save_documents
        or (j.removal_warned_at is not null and (j.documents_choice is not null or j.removal_warned_at + interval '1 day' <= now())))
    from public.jobs j join public.businesses b on b.id = j.business_id, lateral (select public.job_paid_at(j.id) as paid) p
    where j.id = p_job and paid is not null), false);
$$;

-- Home's warning: jobs leaving within a day (or overdue and waiting for the owner). Owner only;
-- empty when documents save automatically.
create function public.jobs_leaving()
returns table(id uuid, title text, customer_name text, paid_at timestamptz, leaves_at timestamptz, warned_at timestamptz, choice text)
language sql stable security definer set search_path = '' as $$
  select j.id, j.title, c.name, p.paid,
    greatest(p.paid + interval '30 days', coalesce(j.removal_warned_at, now()) + interval '1 day'),
    j.removal_warned_at, j.documents_choice
  from public.jobs j
  join public.customers c on c.id = j.customer_id
  join public.businesses b on b.id = j.business_id
  cross join lateral (select public.job_paid_at(j.id) as paid) p
  where j.business_id = public.owned_business() and not b.auto_save_documents
    and p.paid is not null and p.paid + interval '29 days' <= now()
  order by p.paid;
$$;

-- The owner saw the warning for these jobs (the clock for the last day starts now).
create function public.see_jobs_leaving(p_jobs uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs j set removal_warned_at = now()
  where j.id = any(p_jobs) and j.business_id = public.owned_business() and j.removal_warned_at is null
    and public.job_paid_at(j.id) + interval '29 days' <= now();
end $$;

-- Save the documents, or let them go. Only for jobs the owner was warned about.
create function public.choose_job_documents(p_job uuid, p_choice text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_choice not in ('save', 'discard') then raise exception using errcode = '23514', message = 'invalid choice'; end if;
  update public.jobs set documents_choice = p_choice
  where id = p_job and business_id = public.owned_business() and removal_warned_at is not null;
  if not found then raise exception using errcode = '42501', message = 'job unavailable'; end if;
end $$;

-- Jobs ready to remove now, for the job-cleanup function (asked as the signed-in owner).
create function public.jobs_due_for_removal() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select j.id from public.jobs j where j.business_id = public.owned_business() and public.job_removal_due(j.id);
$$;

-- ---------------------------------------------------------------- saving and removing

create function public.save_job_documents(p_job uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  j record;
  header jsonb;
  saved integer := 0;
  n integer;
begin
  select jb.id, jb.business_id, jb.title, jb.address, jb.work_order, c.name as customer, c.phone, c.email, c.lang,
         b.name as business, b.phone as business_phone
    into j
  from public.jobs jb join public.customers c on c.id = jb.customer_id join public.businesses b on b.id = jb.business_id
  where jb.id = p_job;
  if not found then return 0; end if;
  header := jsonb_build_object(
    'business', jsonb_build_object('name', j.business, 'phone', j.business_phone),
    'customer', jsonb_build_object('name', j.customer, 'phone', j.phone, 'email', j.email, 'lang', j.lang),
    'job', jsonb_build_object('title', j.title, 'address', j.address, 'workOrder', j.work_order));

  -- signer name, time, method and the document's fingerprint; the drawn signature itself too
  insert into public.saved_documents (business_id, job_id, job_title, job_address, customer_name, document_type, number, issued_at, paid_at, snapshot)
  select j.business_id, j.id, j.title, j.address, j.customer, 'estimate', e.number, e.sent_at, null,
    header || jsonb_build_object('type', 'estimate', 'document', to_jsonb(e) - 'created_by',
      'lines', coalesce((select jsonb_agg(to_jsonb(l) - 'business_id' - 'estimate_id' order by l.position) from public.estimate_lines l where l.estimate_id = e.id), '[]'),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('amountCents', p.amount_cents, 'method', p.method, 'paidAt', p.paid_at, 'status', p.status) order by p.paid_at) from public.payments p where p.estimate_id = e.id), '[]'),
      'signatures', coalesce((select jsonb_agg(jsonb_build_object('name', s.signer_name, 'signedAt', s.signed_at, 'method', s.signature_method, 'hash', s.document_hash, 'ip', s.ip, 'ink', s.ink) order by s.signed_at) from public.signatures s where s.document_id = e.id), '[]'))
  from public.estimates e where e.job_id = p_job and e.sent_at is not null;
  get diagnostics n = row_count; saved := saved + n;

  insert into public.saved_documents (business_id, job_id, job_title, job_address, customer_name, document_type, number, issued_at, paid_at, snapshot)
  select j.business_id, j.id, j.title, j.address, j.customer, 'invoice', i.number, i.sent_at, i.paid_at,
    header || jsonb_build_object('type', 'invoice', 'document', to_jsonb(i) - 'created_by',
      'lines', coalesce((select jsonb_agg(to_jsonb(l) - 'business_id' - 'invoice_id' order by l.position) from public.invoice_lines l where l.invoice_id = i.id), '[]'),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('amountCents', p.amount_cents, 'method', p.method, 'paidAt', p.paid_at, 'status', p.status) order by p.paid_at) from public.payments p where p.invoice_id = i.id), '[]'),
      'signatures', '[]'::jsonb)
  from public.invoices i where i.job_id = p_job and i.sent_at is not null;
  get diagnostics n = row_count; saved := saved + n;

  insert into public.saved_documents (business_id, job_id, job_title, job_address, customer_name, document_type, number, issued_at, paid_at, snapshot)
  select j.business_id, j.id, j.title, j.address, j.customer, 'change_order', co.number, co.sent_at, null,
    header || jsonb_build_object('type', 'change_order', 'document', to_jsonb(co) - 'created_by', 'lines', '[]'::jsonb, 'payments', '[]'::jsonb,
      'signatures', coalesce((select jsonb_agg(jsonb_build_object('name', s.signer_name, 'signedAt', s.signed_at, 'method', s.signature_method, 'hash', s.document_hash, 'ip', s.ip, 'ink', s.ink) order by s.signed_at) from public.signatures s where s.document_id = co.id), '[]'))
  from public.change_orders co where co.job_id = p_job and (co.signed_at is not null or co.declined_at is not null);
  get diagnostics n = row_count; saved := saved + n;
  return saved;
end $$;

-- Removes one due job for good, saving its documents first when the owner (or the setting) said
-- so. Returns the files the job-cleanup function must delete from storage. Server only.
create function public.purge_job(p_job uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  j record;
  docs uuid[];
  estimates uuid[];
  invoices uuid[];
  files jsonb;
  touched uuid[];
  receipt_files jsonb;
  saved integer := 0;
begin
  select jb.id, jb.business_id, jb.documents_choice, b.auto_save_documents into j
  from public.jobs jb join public.businesses b on b.id = jb.business_id where jb.id = p_job for update of jb;
  if not found or not public.job_removal_due(p_job) then
    raise exception using errcode = '42501', message = 'job not due for removal';
  end if;
  perform set_config('kiln.purge', 'on', true);

  if j.auto_save_documents or j.documents_choice = 'save' then saved := public.save_job_documents(p_job); end if;

  select coalesce(array_agg(id), '{}') into estimates from public.estimates where job_id = p_job;
  select coalesce(array_agg(id), '{}') into invoices from public.invoices where job_id = p_job;
  docs := estimates || invoices || coalesce((select array_agg(id) from public.change_orders where job_id = p_job), '{}');

  -- receipt items that went only to this job go with it; a receipt left with no items goes too
  with gone_items as (
    delete from public.receipt_items ri
    where exists (select 1 from public.receipt_item_jobs x where x.receipt_item_id = ri.id and x.job_id = p_job)
      and not exists (select 1 from public.receipt_item_jobs x where x.receipt_item_id = ri.id and x.job_id <> p_job)
    returning ri.receipt_id)
  select coalesce(array_agg(distinct receipt_id), '{}') into touched from gone_items;
  with gone as (
    delete from public.receipts r
    where r.id = any(touched) and not exists (select 1 from public.receipt_items ri where ri.receipt_id = r.id)
    returning r.storage_path)
  select coalesce(jsonb_agg(storage_path) filter (where storage_path is not null), '[]') into receipt_files from gone;

  files := jsonb_build_object(
    'job-photos', coalesce((select jsonb_agg(storage_path) from public.photos where job_id = p_job and storage_path is not null), '[]'),
    'voice-notes', coalesce((select jsonb_agg(storage_path) from public.voice_notes where job_id = p_job and storage_path is not null), '[]'),
    'receipts', receipt_files);

  delete from public.signatures where document_id = any(docs);
  delete from public.share_links where document_id = any(docs);
  delete from public.document_delivery_events where document_id = any(docs);
  delete from public.estimate_access_links where estimate_id = any(estimates);
  delete from public.invoice_payment_reservations where invoice_id = any(invoices);
  delete from public.payments where job_id = p_job or invoice_id = any(invoices) or estimate_id = any(estimates);
  delete from public.job_payment_requests where job_id = p_job;
  delete from public.jobs where id = p_job;

  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (j.business_id, null, case when saved > 0 then 'job.removed_documents_saved' else 'job.removed' end, 'job', p_job);
  perform set_config('kiln.purge', 'off', true);
  return jsonb_build_object('saved', saved, 'files', files);
end $$;

-- ---------------------------------------------------------------- who may call what

revoke all on function public.kiln_purging(), public.job_paid_at(uuid), public.owned_business(), public.job_removal_due(uuid),
  public.jobs_leaving(), public.see_jobs_leaving(uuid[]), public.choose_job_documents(uuid, text), public.jobs_due_for_removal(),
  public.save_job_documents(uuid), public.purge_job(uuid) from public, anon, authenticated;
grant execute on function public.kiln_purging() to authenticated, service_role;
grant execute on function public.jobs_leaving(), public.see_jobs_leaving(uuid[]), public.choose_job_documents(uuid, text),
  public.jobs_due_for_removal() to authenticated;
grant execute on function public.purge_job(uuid) to service_role;
