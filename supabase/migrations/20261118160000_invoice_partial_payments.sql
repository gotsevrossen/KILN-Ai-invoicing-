-- Keep the Stripe idempotency key of reservations made before this migration.
alter table public.invoice_payment_reservations add column attempt_key uuid;
alter table public.payments add column canceled_at timestamptz;

create function public.reserve_invoice_payment(p_invoice uuid, p_method text, p_amount_cents integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare i public.invoices; reservation public.invoice_payment_reservations; confirmed bigint; due integer; amount integer;
begin
  select * into i from public.invoices where id = p_invoice and sent_at is not null;
  if not found or p_method is null or p_method not in ('wallet','bank','card') then raise exception 'Invalid invoice'; end if;
  perform 1 from public.jobs where id = i.job_id for update;
  select * into i from public.invoices where id = p_invoice;
  if not found or i.paid_at is not null then raise exception 'Nothing due'; end if;
  select * into reservation from public.invoice_payment_reservations where invoice_id = i.id;
  if found then
    if reservation.collection_method <> p_method then raise exception 'Use the original payment method'; end if;
    if p_amount_cents is not null and reservation.collection_cents <> p_amount_cents then raise exception 'Use the original payment amount'; end if;
    return reservation.collection_cents;
  end if;
  if exists(select 1 from public.payments where job_id = i.job_id and status = 'processing') or
    exists(select 1 from public.job_payment_requests r where r.job_id = i.job_id and r.intent_method is not null
      and not exists(select 1 from public.payments p where p.request_id = r.id and p.status = 'succeeded')) then
    raise exception 'Wait for the online payment';
  end if;
  select coalesce(sum(amount_cents), 0) into confirmed from public.payments where job_id = i.job_id and status = 'succeeded';
  due := greatest(0, public.invoice_total_cents(i.id) - confirmed);
  amount := coalesce(p_amount_cents, due);
  if amount <= 0 or amount > due then raise exception 'Nothing due'; end if;
  insert into public.invoice_payment_reservations(invoice_id,collection_method,collection_cents,attempt_key)
    values (i.id,p_method,amount,gen_random_uuid());
  return amount;
end $$;
revoke all on function public.reserve_invoice_payment(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_invoice_payment(uuid,text,integer) to service_role;

create or replace function public.reserve_invoice_payment(p_invoice uuid, p_method text) returns integer
language sql security definer set search_path = '' as $$
  select public.reserve_invoice_payment(p_invoice,p_method,null);
$$;

create function public.reserve_invoice_checkout(p_invoice uuid,p_method text,p_amount_cents integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare amount integer; reservation public.invoice_payment_reservations;
begin
  amount := public.reserve_invoice_payment(p_invoice,p_method,p_amount_cents);
  select * into strict reservation from public.invoice_payment_reservations where invoice_id=p_invoice;
  return jsonb_build_object('amount',amount,'attempt_key',reservation.attempt_key,'intent_id',reservation.intent_id,'created_at',reservation.created_at);
end $$;
revoke all on function public.reserve_invoice_checkout(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_invoice_checkout(uuid,text,integer) to service_role;

-- The prior transaction remains the source of amount/method validation and writes the ledger.
alter function public.record_stripe_payment(uuid,uuid,text,integer,text,text,integer) rename to record_reserved_stripe_payment;
revoke all on function public.record_reserved_stripe_payment(uuid,uuid,text,integer,text,text,integer) from service_role;

create function public.record_stripe_payment(p_business uuid,p_invoice uuid,p_intent text,p_amount_cents integer,p_method text,p_status text,p_invoice_total integer) returns void
language plpgsql security definer set search_path = '' as $$
declare job uuid; prior public.payments;
begin
  select job_id into job from public.invoices where id=p_invoice and business_id=p_business and sent_at is not null;
  if not found then raise exception 'Missing invoice'; end if;
  perform 1 from public.jobs where id=job for update;
  select * into prior from public.payments where stripe_payment_intent=p_intent;
  if found then
    if prior.invoice_id is distinct from p_invoice or prior.business_id is distinct from p_business
      or prior.amount_cents is distinct from p_amount_cents or prior.method is distinct from p_method then
      raise exception 'Payment does not match';
    end if;
    if prior.status='succeeded' or prior.canceled_at is not null then return; end if;
  end if;
  perform public.record_reserved_stripe_payment(p_business,p_invoice,p_intent,p_amount_cents,p_method,p_status,p_invoice_total);
  if p_status='succeeded' then
    delete from public.invoice_payment_reservations where invoice_id=p_invoice and intent_id=p_intent;
  end if;
end $$;
revoke all on function public.record_stripe_payment(uuid,uuid,text,integer,text,text,integer) from public, anon, authenticated;
grant execute on function public.record_stripe_payment(uuid,uuid,text,integer,text,text,integer) to service_role;

create function public.release_canceled_invoice_payment(p_invoice uuid,p_intent text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invoices; r public.invoice_payment_reservations;
begin
  select * into i from public.invoices where id=p_invoice and sent_at is not null;
  if not found then return; end if;
  perform 1 from public.jobs where id=i.job_id for update;
  select * into r from public.invoice_payment_reservations where invoice_id=p_invoice and intent_id=p_intent;
  if not found then return; end if;
  if exists (select 1 from public.payments where stripe_payment_intent=p_intent and status='succeeded') then
    raise exception 'Payment already received';
  end if;
  perform public.record_reserved_stripe_payment(i.business_id,i.id,p_intent,r.collection_cents,r.collection_method,'failed',public.invoice_total_cents(i.id));
  update public.payments set canceled_at=now() where stripe_payment_intent=p_intent;
  delete from public.invoice_payment_reservations where invoice_id=p_invoice and intent_id=p_intent;
end $$;
revoke all on function public.release_canceled_invoice_payment(uuid,text) from public, anon, authenticated;
grant execute on function public.release_canceled_invoice_payment(uuid,text) to service_role;

-- A client secret is only returned after the Stripe intent is bound. An unbound
-- attempt can be discarded atomically even if its provider request is in flight.
create function public.release_unbound_invoice_checkout(p_invoice uuid,p_attempt uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare job uuid;
begin
  select job_id into job from public.invoices where id=p_invoice and sent_at is not null;
  if not found then return false; end if;
  perform 1 from public.jobs where id=job for update;
  delete from public.invoice_payment_reservations
    where invoice_id=p_invoice and intent_id is null and attempt_key is not distinct from p_attempt;
  return found;
end $$;
revoke all on function public.release_unbound_invoice_checkout(uuid,uuid) from public, anon, authenticated;
grant execute on function public.release_unbound_invoice_checkout(uuid,uuid) to service_role;

-- Client-generated payment ids make a confirmed recording safe to retry after a lost response.
create function public.record_invoice_alternative_payment(p_invoice uuid,p_amount_cents integer,p_method text,p_payment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invoices; prior public.payments; confirmed bigint; due integer; methods jsonb;
begin
  select * into i from public.invoices where id=p_invoice;
  if not found or not public.is_owner(i.business_id) or i.sent_at is null then raise exception 'Not allowed'; end if;
  perform 1 from public.jobs where id=i.job_id for update;
  select * into i from public.invoices where id=p_invoice;
  if not found then raise exception 'Not allowed'; end if;
  select * into prior from public.payments where id=p_payment_id;
  if found then
    if prior.invoice_id=p_invoice and prior.amount_cents=p_amount_cents and prior.alternative_method=p_method then return; end if;
    raise exception 'Payment does not match';
  end if;
  methods := public.invoice_acceptance_view(i.id) -> 'alternativeMethods';
  if p_method is null or not coalesce((methods ? p_method) or (methods='{}'::jsonb and p_method='cash'),false) then
    raise exception 'Choose an invoice payment method';
  end if;
  if exists(select 1 from public.invoice_payment_reservations where invoice_id=i.id) then raise exception 'An online payment was started'; end if;
  if exists(select 1 from public.payments where job_id=i.job_id and status='processing') or
    exists(select 1 from public.job_payment_requests r where r.job_id=i.job_id and r.intent_method is not null
      and not exists(select 1 from public.payments p where p.request_id=r.id and p.status='succeeded')) then
    raise exception 'Wait for the online payment';
  end if;
  select coalesce(sum(amount_cents),0) into confirmed from public.payments where job_id=i.job_id and status='succeeded';
  due := greatest(0,public.invoice_total_cents(i.id)-confirmed);
  if i.paid_at is not null or p_payment_id is null or p_amount_cents is null or p_amount_cents<=0 or p_amount_cents>due then
    raise exception 'Balance changed. Refresh first';
  end if;
  insert into public.payments(id,business_id,job_id,invoice_id,amount_cents,method,status,alternative_method)
    values (p_payment_id,i.business_id,i.job_id,i.id,p_amount_cents,case when p_method in ('cash','check') then p_method else 'other' end,'succeeded',p_method);
  insert into public.audit_log(business_id,actor,action,entity,entity_id)
    values (i.business_id,auth.uid(),'invoice.alternative_payment','invoice',i.id);
end $$;
revoke all on function public.record_invoice_alternative_payment(uuid,integer,text,uuid) from public, anon;
grant execute on function public.record_invoice_alternative_payment(uuid,integer,text,uuid) to authenticated;
