-- Reuse persisted Stripe intents even after Stripe expires its idempotency cache.
-- Failed (retryable) advance intents retain their reservation until settlement.
alter table public.invoice_payment_reservations add column intent_id text unique, add column created_at timestamptz not null default now();
alter table public.job_payment_requests add column reserved_at timestamptz;
update public.job_payment_requests set reserved_at=created_at where intent_method is not null;

create or replace function public.reserve_job_payment(p_id uuid,p_method text) returns void
language plpgsql security definer set search_path='' as $$
declare r record; received bigint; total integer;
begin
 select * into r from public.job_payment_requests where id=p_id;
 if not found then raise exception 'Missing request'; end if;
 perform 1 from public.jobs where id=r.job_id for update;
 select * into r from public.job_payment_requests where id=p_id;
 if exists(select 1 from public.invoices where job_id=r.job_id and sent_at is not null) then raise exception 'Use the final invoice'; end if;
 if p_method not in ('wallet','bank') or r.expires_at<now() then raise exception 'Invalid request'; end if;
 if exists(select 1 from public.payments where request_id=p_id and status in ('succeeded','processing')) then raise exception 'Already paid'; end if;
 select coalesce(sum(amount_cents),0) into received from public.payments where job_id=r.job_id and status in ('succeeded','processing');
 received:=received+coalesce((select sum(x.amount_cents) from public.job_payment_requests x where x.job_id=r.job_id and x.id<>r.id and x.intent_method is not null and not exists(select 1 from public.payments p where p.request_id=x.id and p.status in ('succeeded','processing'))),0);
 total:=public.job_agreed_total(r.job_id);
 if received+r.amount_cents>total then raise exception 'Nothing due'; end if;
 update public.job_payment_requests set intent_method=coalesce(intent_method,p_method), reserved_at=coalesce(reserved_at,now()) where id=p_id;
 if exists(select 1 from public.job_payment_requests where id=p_id and intent_method<>p_method) then raise exception 'Use the original payment method'; end if;
end $$;

create or replace function public.record_job_payment(p_id uuid,p_intent text,p_amount integer,p_method text,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 select * into r from public.job_payment_requests where id=p_id;
 if not found then raise exception 'Missing request'; end if;
 perform 1 from public.jobs where id=r.job_id for update;
 select * into r from public.job_payment_requests where id=p_id;
 if p_amount is distinct from r.amount_cents or p_method is distinct from r.intent_method or p_intent is distinct from r.intent_id or r.intent_id is null
 or p_status not in ('processing','succeeded','failed') then raise exception 'Payment does not match'; end if;
 insert into public.payments(business_id,job_id,request_id,amount_cents,method,stripe_payment_intent,status)
 values(r.business_id,r.job_id,r.id,p_amount,p_method,p_intent,p_status)
 on conflict(request_id) where request_id is not null do update set status=case
 when public.payments.status='succeeded' then 'succeeded' else excluded.status end;
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(r.business_id,null,'payment.'||p_status,'job',r.job_id);
end $$;

create or replace function public.record_job_cash(p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r record; received bigint;
begin
 select * into r from public.job_payment_requests where id=p_request;
 if not found or not public.is_owner(r.business_id) then raise exception 'Not allowed'; end if;
 perform 1 from public.jobs where id=r.job_id for update;
 select * into r from public.job_payment_requests where id=p_request;
 if exists(select 1 from public.payments where request_id=p_request and method='cash' and status='succeeded') then return; end if;
 if exists(select 1 from public.invoices where job_id=r.job_id and id in (select invoice_id from public.invoice_payment_reservations)) then raise exception 'An online payment was started'; end if;
 if r.intent_method is not null or exists(select 1 from public.payments where request_id=p_request) then raise exception 'An online payment was started'; end if;
 select coalesce(sum(amount_cents),0) into received from public.payments where job_id=r.job_id and status in ('succeeded','processing');
 received:=received+coalesce((select sum(x.amount_cents) from public.job_payment_requests x where x.job_id=r.job_id and x.id<>r.id and x.intent_method is not null and not exists(select 1 from public.payments p where p.request_id=x.id and p.status in ('succeeded','processing'))),0);
 if received+r.amount_cents>public.job_agreed_total(r.job_id) then raise exception 'Nothing due'; end if;
 insert into public.payments(business_id,job_id,request_id,amount_cents,method,status) values(r.business_id,r.job_id,r.id,r.amount_cents,'cash','succeeded');
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(r.business_id,auth.uid(),'payment.cash','job',r.job_id);
end $$;

create or replace function public.mark_invoice_paid(p_invoice_id uuid,p_amount_cents integer) returns void
language plpgsql security definer set search_path='' as $$
declare i record; paid bigint; due integer;
begin
 select * into i from public.invoices where id=p_invoice_id;
 if not found or not public.is_owner(i.business_id) or i.sent_at is null then raise exception 'Not allowed'; end if;
 perform 1 from public.jobs where id=i.job_id for update;
 select * into i from public.invoices where id=p_invoice_id;
 if i.paid_at is not null then return; end if;
 if exists(select 1 from public.invoice_payment_reservations where invoice_id=i.id) then raise exception 'An online payment was started'; end if;
 if exists(select 1 from public.payments where job_id=i.job_id and status='processing') or
 exists(select 1 from public.job_payment_requests r where r.job_id=i.job_id and r.intent_method is not null
 and not exists(select 1 from public.payments p where p.request_id=r.id and p.status='succeeded'))
 then raise exception 'Wait for the online payment'; end if;
 select coalesce(sum(amount_cents),0) into paid from public.payments where job_id=i.job_id and status='succeeded';
 due:=greatest(0,public.invoice_total_cents(i.id)-paid);
 -- Caller confirms the displayed remaining amount; stale screens cannot overcharge.
 if p_amount_cents<>due then raise exception 'Balance changed. Refresh first'; end if;
 if due>0 then insert into public.payments(business_id,job_id,invoice_id,amount_cents,method,status) values(i.business_id,i.job_id,i.id,due,'cash','succeeded'); end if;
 update public.invoices set paid_at=now() where id=i.id;
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(i.business_id,auth.uid(),'invoice.paid','invoice',i.id);
end $$;

create or replace function public.reserve_invoice_payment(p_invoice uuid,p_method text) returns integer
language plpgsql security definer set search_path='' as $$
declare i record; paid bigint; due integer; reservation record;
begin
 select * into i from public.invoices where id=p_invoice and sent_at is not null;
 if not found or p_method not in ('wallet','bank') then raise exception 'Invalid invoice'; end if;
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

create or replace function public.validate_credit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare agreed integer; paid bigint;
begin
 if new.amount_cents<0 and (tg_op='INSERT' or old.signed_at is null) then
  perform 1 from public.jobs where id=new.job_id for update;
  if exists(select 1 from public.invoices where job_id=new.job_id and sent_at is not null) then raise exception 'Invoice already sent'; end if;
  agreed:=public.job_agreed_total(new.job_id);
  select coalesce(sum(amount_cents),0) into paid from public.payments where job_id=new.job_id and status in ('succeeded','processing');
  paid:=paid+coalesce((select sum(r.amount_cents) from public.job_payment_requests r where r.job_id=new.job_id and r.intent_method is not null and not exists(select 1 from public.payments p where p.request_id=r.id and p.status in ('succeeded','processing'))),0);
  -- Conservative protection: tax can only increase this discount's effect.
  if agreed+round(new.amount_cents::numeric*(10000+coalesce((select tax_rate_bps from public.estimates where job_id=new.job_id and tax_labor),0))/10000)<paid or new.base_cents+new.amount_cents<0 then raise exception 'Credit exceeds the unpaid agreed balance'; end if;
 end if;
 return new;
end $$;

create or replace function public.record_stripe_payment(p_business uuid,p_invoice uuid,p_intent text,p_amount_cents integer,p_method text,p_status text,p_invoice_total integer) returns void
language plpgsql security definer set search_path='' as $$
declare i record; paid bigint;
begin
 select * into i from public.invoices where id=p_invoice and business_id=p_business and sent_at is not null;
 if not found then raise exception 'Missing invoice'; end if;
 perform 1 from public.jobs where id=i.job_id for update;
 if p_method not in ('wallet','bank') or p_status not in ('processing','succeeded','failed') or p_amount_cents<1 or p_intent !~ '^pi_[A-Za-z0-9]{8,64}$' then raise exception 'Invalid payment'; end if;
 if exists(select 1 from public.invoice_payment_reservations where invoice_id=i.id and (intent_id is distinct from p_intent or collection_cents<>p_amount_cents or collection_method<>p_method)) then raise exception 'Payment does not match reservation'; end if;
 if exists(select 1 from public.payments where stripe_payment_intent=p_intent and (invoice_id is distinct from p_invoice or business_id<>p_business or amount_cents<>p_amount_cents)) then raise exception 'Payment does not match'; end if;
 insert into public.payments(business_id,job_id,invoice_id,amount_cents,method,stripe_payment_intent,status)
 values(p_business,i.job_id,p_invoice,p_amount_cents,p_method,p_intent,p_status)
 on conflict(stripe_payment_intent) do update set status=case when public.payments.status='succeeded' then 'succeeded' else excluded.status end;
 select coalesce(sum(amount_cents),0) into paid from public.payments where job_id=i.job_id and status='succeeded';
 if paid>=public.invoice_total_cents(i.id) then update public.invoices set paid_at=coalesce(paid_at,now()) where id=i.id; end if;
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(p_business,null,'payment.'||p_status,'invoice',p_invoice);
end $$;

-- A delayed advance can settle after the final invoice is issued. Reconcile it there too.
create function public.reconcile_job_payment() returns trigger
language plpgsql security definer set search_path='' as $$
declare invoice_id uuid; paid bigint;
begin
 if new.status='succeeded' and new.job_id is not null then
  perform 1 from public.jobs where id=new.job_id for update;
  select i.id into invoice_id from public.invoices i where i.job_id=new.job_id and i.sent_at is not null and i.paid_at is null;
  if invoice_id is not null then
   select coalesce(sum(amount_cents),0) into paid from public.payments where job_id=new.job_id and status='succeeded';
   if paid>=public.invoice_total_cents(invoice_id) then update public.invoices set paid_at=now() where id=invoice_id and paid_at is null; end if;
  end if;
 end if;
 return new;
end $$;
create trigger reconcile_job_payment after insert or update on public.payments for each row execute function public.reconcile_job_payment();
