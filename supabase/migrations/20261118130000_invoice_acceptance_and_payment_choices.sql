create function public.valid_alternative_methods(p_methods jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_methods) is distinct from 'object' then return false; end if;
  return not exists (
    select 1 from jsonb_each(p_methods) as m(method, instructions)
    where method not in ('zelle', 'venmo', 'cash_app', 'cash', 'check')
      or jsonb_typeof(instructions) <> 'string' or length(instructions #>> '{}') > 240
  );
end $$;

alter table public.businesses add column alternative_methods jsonb not null default '{}'
  check (public.valid_alternative_methods(alternative_methods));
alter table public.invoices add column issued_alternative_methods jsonb
  check (issued_alternative_methods is null or public.valid_alternative_methods(issued_alternative_methods));

create function public.freeze_invoice_payment_methods() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select alternative_methods into new.issued_alternative_methods from public.businesses where id = new.business_id for share;
  if new.issued_alternative_methods is null or new.issued_alternative_methods = '{}'::jsonb then
    raise sqlstate 'PT422' using message = 'alternative_methods_required';
  end if;
  return new;
end $$;
create trigger invoices_alternative_methods before update of sent_at on public.invoices
  for each row when (old.sent_at is null and new.sent_at is not null)
  execute function public.freeze_invoice_payment_methods();
revoke all on function public.freeze_invoice_payment_methods() from public, anon, authenticated;

create table public.invoice_acceptances (
  invoice_id uuid primary key references public.invoices(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  signer_name text not null check (length(signer_name) between 2 and 120),
  signed_at timestamptz not null default now(),
  alternative_method text,
  ink jsonb not null check (public.valid_signature_ink(ink)),
  snapshot jsonb not null,
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  consent text not null
);
alter table public.invoice_acceptances enable row level security;
revoke all on public.invoice_acceptances from public, anon, authenticated, service_role;
grant select on public.invoice_acceptances to authenticated;
create policy invoice_acceptance_read on public.invoice_acceptances for select to authenticated
  using (public.is_owner(business_id));
create trigger kiln_live_change after insert or delete on public.invoice_acceptances
  for each row execute function public.kiln_live_change();

-- Legacy links can use current business methods until the customer signs; new sends freeze them.
create function public.invoice_acceptance_snapshot(p_invoice uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i) - 'paid_at' - 'created_by',
    'business', jsonb_build_object('name', b.name, 'phone', b.phone, 'email', b.email, 'address', b.address),
    'customer', jsonb_build_object('name', c.name, 'lang', c.lang),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('description', l.description, 'kind', l.kind,
      'quantity', l.qty_hundredths, 'unitCents', l.unit_cents, 'unit', l.unit) order by l.position, l.id)
      from public.invoice_lines l where l.invoice_id = i.id), '[]'),
    'totalCents', public.invoice_total_cents(i.id),
    'alternativeMethods', coalesce(i.issued_alternative_methods, b.alternative_methods))
  from public.invoices i join public.businesses b on b.id = i.business_id
    join public.jobs j on j.id = i.job_id join public.customers c on c.id = j.customer_id
  where i.id = p_invoice and i.sent_at is not null;
$$;

create function public.invoice_acceptance_view(p_invoice uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('hash', coalesce(a.document_hash, encode(sha256(convert_to(v.snapshot::text, 'UTF8')), 'hex')),
    'alternativeMethods', coalesce(a.snapshot, v.snapshot) -> 'alternativeMethods',
    'acceptance', case when a.invoice_id is not null then jsonb_build_object('name', a.signer_name, 'signedAt', a.signed_at,
      'alternativeMethod', a.alternative_method, 'ink', a.ink) end)
  from (select public.invoice_acceptance_snapshot(p_invoice) as snapshot) v
  left join public.invoice_acceptances a on a.invoice_id = p_invoice where v.snapshot is not null;
$$;

create function public.accept_invoice_link(p_hash text, p_snapshot_hash text, p_name text, p_ink jsonb, p_method text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare link public.share_links; inv public.invoices; existing public.invoice_acceptances; snap jsonb; fingerprint text; consent_text text;
begin
  select * into link from public.share_links where token_hash = p_hash and document_type = 'invoice'
    and revoked_at is null and expires_at > now() for share;
  if not found then raise exception 'invalid invoice link'; end if;
  select * into inv from public.invoices where id = link.document_id and business_id = link.business_id and sent_at is not null for update;
  if not found or length(trim(coalesce(p_name, ''))) not between 2 and 120 or not public.valid_signature_ink(p_ink) then
    raise exception 'invalid invoice acceptance';
  end if;
  select * into existing from public.invoice_acceptances where invoice_id = inv.id;
  if found then
    if existing.document_hash = p_snapshot_hash and existing.signer_name = trim(p_name) and existing.ink = p_ink
      and existing.alternative_method is not distinct from p_method then return public.invoice_acceptance_view(inv.id); end if;
    raise exception 'invoice already accepted';
  end if;
  snap := public.invoice_acceptance_snapshot(inv.id);
  fingerprint := encode(sha256(convert_to(snap::text, 'UTF8')), 'hex');
  if fingerprint is distinct from p_snapshot_hash or (p_method is not null and not ((snap -> 'alternativeMethods') ? p_method)) then
    raise exception 'invoice or payment options changed';
  end if;
  consent_text := case when snap #>> '{customer,lang}' = 'es' then
    case when p_method is null then 'Acepto esta factura y uso mi firma como firma electrónica.'
      else 'Acepto esta factura y me comprometo a pagar el saldo fuera de KILN con el método elegido.' end
    else case when p_method is null then 'I accept this invoice and use my signature as my electronic signature.'
      else 'I accept this invoice and agree to pay the balance outside KILN using the selected method.' end end;
  insert into public.invoice_acceptances(invoice_id, business_id, signer_name, alternative_method, ink, snapshot, document_hash, consent)
    values (inv.id, inv.business_id, trim(p_name), p_method, p_ink, snap, fingerprint, consent_text);
  insert into public.audit_log(business_id, actor, action, entity, entity_id) values(inv.business_id, null, 'invoice.accepted_by_link', 'invoice', inv.id);
  return public.invoice_acceptance_view(inv.id);
end $$;
revoke all on function public.invoice_acceptance_snapshot(uuid), public.invoice_acceptance_view(uuid), public.accept_invoice_link(text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.invoice_acceptance_view(uuid), public.accept_invoice_link(text,text,text,jsonb,text) to service_role;

-- Keep the accepted document and drawn signature when paid-job cleanup files a saved invoice.
create function public.archive_invoice_acceptance() returns trigger
language plpgsql set search_path = '' as $$
declare accepted public.invoice_acceptances;
begin
  select * into accepted from public.invoice_acceptances where invoice_id = (new.snapshot #>> '{document,id}')::uuid
    and business_id = new.business_id;
  if found then
    new.snapshot := new.snapshot || jsonb_build_object('signatures', jsonb_build_array(jsonb_build_object(
      'name', accepted.signer_name, 'signedAt', accepted.signed_at, 'method', 'finger', 'hash', accepted.document_hash, 'ink', accepted.ink,
      'alternativeMethod', accepted.alternative_method)), 'acceptedInvoice', accepted.snapshot, 'acceptanceConsent', accepted.consent);
  end if;
  return new;
end $$;
create trigger archive_invoice_acceptance before insert on public.saved_documents
  for each row when (new.document_type = 'invoice') execute function public.archive_invoice_acceptance();

alter table public.payments add column alternative_method text check (
  alternative_method is null or (stripe_payment_intent is null and case
    when alternative_method in ('cash','check') then method = alternative_method
    else alternative_method in ('zelle','venmo','cash_app') and method = 'other' end)
);

create function public.mark_invoice_alternative_paid(p_invoice uuid, p_amount_cents integer, p_method text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invoices; confirmed bigint; due integer; methods jsonb; ledger_method text;
begin
  select * into i from public.invoices where id = p_invoice;
  if not found or not public.is_owner(i.business_id) or i.sent_at is null then raise exception 'Not allowed'; end if;
  perform 1 from public.jobs where id = i.job_id for update;
  select * into i from public.invoices where id = p_invoice;
  if i.paid_at is not null then return; end if;
  methods := public.invoice_acceptance_view(i.id) -> 'alternativeMethods';
  if p_method is null or not ((methods ? p_method) or (methods = '{}'::jsonb and p_method = 'cash')) then
    raise exception 'Choose an invoice payment method';
  end if;
  if exists(select 1 from public.invoice_payment_reservations where invoice_id = i.id) then
    raise exception 'An online payment was started';
  end if;
  if exists(select 1 from public.payments where job_id = i.job_id and status = 'processing') or
    exists(select 1 from public.job_payment_requests r where r.job_id = i.job_id and r.intent_method is not null
      and not exists(select 1 from public.payments p where p.request_id = r.id and p.status = 'succeeded')) then
    raise exception 'Wait for the online payment';
  end if;
  select coalesce(sum(amount_cents), 0) into confirmed from public.payments where job_id = i.job_id and status = 'succeeded';
  due := greatest(0, public.invoice_total_cents(i.id) - confirmed);
  if p_amount_cents is distinct from due then raise exception 'Balance changed. Refresh first'; end if;
  if due > 0 then
    ledger_method := case when p_method in ('cash','check') then p_method else 'other' end;
    insert into public.payments(business_id, job_id, invoice_id, amount_cents, method, status, alternative_method)
      values (i.business_id, i.job_id, i.id, due, ledger_method, 'succeeded', p_method);
  end if;
  update public.invoices set paid_at = coalesce(paid_at, now()) where id = i.id;
  insert into public.audit_log(business_id, actor, action, entity, entity_id) values (i.business_id, auth.uid(), 'invoice.paid', 'invoice', i.id);
end $$;
revoke all on function public.mark_invoice_alternative_paid(uuid,integer,text) from public, anon;
grant execute on function public.mark_invoice_alternative_paid(uuid,integer,text) to authenticated;


-- A typed card stays distinct from Apple Pay and Google Pay in the ledger.
alter table public.stripe_accounts add column card_ready boolean not null default false;
alter table public.stripe_accounts add column test_mode boolean;
alter table public.invoice_payment_reservations drop constraint invoice_payment_reservations_collection_method_check;
alter table public.invoice_payment_reservations add check (collection_method in ('wallet', 'bank', 'card'));
create or replace function public.reserve_invoice_payment(p_invoice uuid,p_method text) returns integer
language plpgsql security definer set search_path='' as $$
declare i record; paid bigint; due integer; reservation record;
begin
 select * into i from public.invoices where id=p_invoice and sent_at is not null;
 if not found or (p_method is null or p_method not in ('wallet','bank','card')) then raise exception 'Invalid invoice'; end if;
 perform 1 from public.jobs where id=i.job_id for update;
 -- Re-read after acquiring the lock: another request may have frozen the method.
 select * into i from public.invoices where id=p_invoice;
 if i.paid_at is not null then raise exception 'Nothing due'; end if;
 select * into reservation from public.invoice_payment_reservations where invoice_id=i.id;
 if found then
 if reservation.collection_method<>p_method then raise exception 'Use the original payment method'; end if;
 return reservation.collection_cents;
 end if;
 if exists(select 1 from public.payments where job_id=i.job_id and status='processing') or
 exists(select 1 from public.job_payment_requests r where r.job_id=i.job_id and r.intent_method is not null and not exists(select 1 from public.payments p where p.request_id=r.id and p.status='succeeded'))
 then raise exception 'Wait for the online payment'; end if;
 select coalesce(sum(amount_cents),0) into paid from public.payments where job_id=i.job_id and status='succeeded';
 due:=greatest(0,public.invoice_total_cents(i.id)-paid);
 if due<=0 or i.paid_at is not null then raise exception 'Nothing due'; end if;
 insert into public.invoice_payment_reservations(invoice_id,collection_method,collection_cents) values(i.id,p_method,due);
 return due;
end $$;

create or replace function public.record_stripe_payment(p_business uuid,p_invoice uuid,p_intent text,p_amount_cents integer,p_method text,p_status text,p_invoice_total integer) returns void
language plpgsql security definer set search_path='' as $$
declare i record; paid bigint;
begin
 select * into i from public.invoices where id=p_invoice and business_id=p_business and sent_at is not null;
 if not found then raise exception 'Missing invoice'; end if;
 perform 1 from public.jobs where id=i.job_id for update;
 if (p_method is null or p_method not in ('wallet','bank','card')) or p_status not in ('processing','succeeded','failed') or p_amount_cents<1 or p_intent !~ '^pi_[A-Za-z0-9]{8,64}$' then raise exception 'Invalid payment'; end if;
 if exists(select 1 from public.invoice_payment_reservations where invoice_id=i.id and (intent_id is distinct from p_intent or collection_cents<>p_amount_cents or collection_method<>p_method)) then raise exception 'Payment does not match reservation'; end if;
 if exists(select 1 from public.payments where stripe_payment_intent=p_intent and (invoice_id is distinct from p_invoice or business_id<>p_business or amount_cents<>p_amount_cents)) then raise exception 'Payment does not match'; end if;
 insert into public.payments(business_id,job_id,invoice_id,amount_cents,method,stripe_payment_intent,status)
 values(p_business,i.job_id,p_invoice,p_amount_cents,p_method,p_intent,p_status)
 on conflict(stripe_payment_intent) do update set status=case when public.payments.status='succeeded' then 'succeeded' else excluded.status end;
 select coalesce(sum(amount_cents),0) into paid from public.payments where job_id=i.job_id and status='succeeded';
 if paid>=public.invoice_total_cents(i.id) then update public.invoices set paid_at=coalesce(paid_at,now()) where id=i.id; end if;
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(p_business,null,'payment.'||p_status,'invoice',p_invoice);
end $$;


