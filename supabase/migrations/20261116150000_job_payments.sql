create table public.invoice_payment_reservations(invoice_id uuid primary key references public.invoices, collection_method text not null check(collection_method in ('wallet','bank')),collection_cents integer not null check(collection_cents>0));
alter table public.invoice_payment_reservations enable row level security;
-- Requests are advances against a job, never extra invoice lines. Only confirmed ledger
-- entries reduce the final balance. All mutations serialize on the parent job.
alter table public.payments add column job_id uuid references public.jobs on delete restrict;
update public.payments p set job_id=i.job_id from public.invoices i where i.id=p.invoice_id;
update public.payments p set job_id=e.job_id from public.estimates e where e.id=p.estimate_id and p.job_id is null;
create index payments_job on public.payments(job_id);
create table public.job_payment_requests (
 id uuid primary key, business_id uuid not null references public.businesses,
 job_id uuid not null references public.jobs on delete restrict,
 kind text not null check(kind in ('deposit','milestone')),
 label text not null check(length(trim(label)) between 1 and 120),
 amount_cents integer not null check(amount_cents between 1 and 100000000),
 token_hash text unique, expires_at timestamptz not null default now()+interval '90 days',
 intent_id text unique, intent_method text check(intent_method in ('wallet','bank')),
 created_at timestamptz not null default now()
);
alter table public.job_payment_requests enable row level security;
grant select on public.job_payment_requests to authenticated;
create policy "members read" on public.job_payment_requests for select to authenticated using(public.is_member(business_id));
create unique index job_one_deposit on public.job_payment_requests(job_id) where kind='deposit';
alter table public.payments add column request_id uuid references public.job_payment_requests;
create unique index request_one_payment on public.payments(request_id) where request_id is not null;

-- Exact cents from frozen sent lines, including signed credit variations.
create function public.job_agreed_total(p_job uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
declare e record; subtotal numeric; taxable numeric; changes numeric; result numeric;
begin
 select * into e from public.estimates where job_id=p_job and signed_at is not null;
 if not found then raise exception 'A signed estimate is required'; end if;
 select coalesce(sum(round(qty_hundredths::numeric*unit_cents/100)),0),
 coalesce(sum(case when (kind='material' and e.tax_materials) or (kind<>'material' and e.tax_labor)
 then round(qty_hundredths::numeric*unit_cents/100) else 0 end),0)
 into subtotal,taxable from public.estimate_lines where estimate_id=e.id and not excluded;
 select coalesce(sum(amount_cents),0) into changes from public.change_orders where job_id=p_job and signed_at is not null;
 result:=subtotal+changes+round((taxable+case when e.tax_labor then changes else 0 end)*coalesce(e.tax_rate_bps,0)/10000);
 if result<0 or result>100000000 then raise exception 'Invalid agreed total'; end if;
 return result::integer;
end $$;
revoke all on function public.job_agreed_total(uuid) from public,anon,authenticated;
grant execute on function public.job_agreed_total(uuid) to service_role;

create function public.create_job_payment_request(p_id uuid,p_job uuid,p_kind text,p_amount integer,p_label text) returns uuid
language plpgsql security definer set search_path='' as $$
declare j record; e record; amount integer; total integer; reserved bigint; existing record;
begin
 select * into j from public.jobs where id=p_job for update;
 if not found or not public.is_owner(j.business_id) then raise exception 'Not allowed'; end if;
 select * into existing from public.job_payment_requests where id=p_id;
 if found then
  if existing.job_id<>p_job or existing.kind<>p_kind or existing.label<>trim(p_label) or (p_kind='milestone' and existing.amount_cents<>p_amount) then raise exception 'Request does not match'; end if;
  return existing.id;
 end if;
 if p_kind not in ('deposit','milestone') or length(trim(p_label)) not between 1 and 120 then raise exception 'Invalid request'; end if;
 if exists(select 1 from public.invoices where job_id=p_job and sent_at is not null) then raise exception 'Use the final invoice'; end if;
 total:=public.job_agreed_total(p_job);
 amount:=p_amount;
 if p_kind='deposit' then
  select * into e from public.estimates where job_id=p_job;
  if not e.deposit_on then raise exception 'No deposit requested'; end if;
  -- Deposit is based on the original accepted estimate, not later changes.
  select (sum(round(qty_hundredths::numeric*unit_cents/100))+
    round(sum(case when (kind='material' and e.tax_materials) or (kind<>'material' and e.tax_labor)
     then round(qty_hundredths::numeric*unit_cents/100) else 0 end)*coalesce(e.tax_rate_bps,0)/10000))::integer
    into amount from public.estimate_lines where estimate_id=e.id and not excluded;
  amount:=round(amount::numeric*e.deposit_bps/10000)::integer;
 end if;
 select coalesce(sum(amount_cents),0) into reserved from public.job_payment_requests where job_id=p_job;
 if amount is null or amount<1 or amount>100000000 or reserved+amount>total then raise exception 'Amount exceeds the agreed job total'; end if;
 insert into public.job_payment_requests(id,business_id,job_id,kind,label,amount_cents)
 values(p_id,j.business_id,p_job,p_kind,trim(p_label),amount);
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(j.business_id,auth.uid(),'payment.requested','job',p_job);
 return p_id;
end $$;
revoke all on function public.create_job_payment_request(uuid,uuid,text,integer,text) from public,anon;
grant execute on function public.create_job_payment_request(uuid,uuid,text,integer,text) to authenticated;

-- Service only: fixed amount + stable idempotency key in Stripe make concurrent starts
-- produce the same intent. Method is frozen at the first attempt.
create function public.reserve_job_payment(p_id uuid,p_method text) returns void
language plpgsql security definer set search_path='' as $$
declare r record; received bigint; total integer;
begin
 select * into r from public.job_payment_requests where id=p_id;
 if not found then raise exception 'Missing request'; end if;
 perform 1 from public.jobs where id=r.job_id for update;
 if exists(select 1 from public.invoices where job_id=r.job_id and sent_at is not null) then raise exception 'Use the final invoice'; end if;
 if p_method not in ('wallet','bank') or r.expires_at<now() then raise exception 'Invalid request'; end if;
 if exists(select 1 from public.payments where request_id=p_id and status in ('succeeded','processing')) then raise exception 'Already paid'; end if;
 select coalesce(sum(amount_cents),0) into received from public.payments where job_id=r.job_id and status in ('succeeded','processing');
 total:=public.job_agreed_total(r.job_id);
 if received+r.amount_cents>total then raise exception 'Nothing due'; end if;
 update public.job_payment_requests set intent_method=coalesce(intent_method,p_method) where id=p_id;
 if exists(select 1 from public.job_payment_requests where id=p_id and intent_method<>p_method) then raise exception 'Use the original payment method'; end if;
end $$;
revoke all on function public.reserve_job_payment(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_job_payment(uuid,text) to service_role;

create function public.record_job_payment(p_id uuid,p_intent text,p_amount integer,p_method text,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 select * into r from public.job_payment_requests where id=p_id;
 if not found then raise exception 'Missing request'; end if;
 perform 1 from public.jobs where id=r.job_id for update;
 if p_amount<>r.amount_cents or p_method<>r.intent_method or p_intent<>r.intent_id
 or p_status not in ('processing','succeeded','failed') then raise exception 'Payment does not match'; end if;
 insert into public.payments(business_id,job_id,request_id,amount_cents,method,stripe_payment_intent,status)
 values(r.business_id,r.job_id,r.id,p_amount,p_method,p_intent,p_status)
 on conflict(request_id) where request_id is not null do update set status=case
 when public.payments.status='succeeded' then 'succeeded' else excluded.status end;
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(r.business_id,null,'payment.'||p_status,'job',r.job_id);
end $$;
revoke all on function public.record_job_payment(uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.record_job_payment(uuid,text,integer,text,text) to service_role;

create function public.record_job_cash(p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r record; received bigint;
begin
 select * into r from public.job_payment_requests where id=p_request;
 if not found or not public.is_owner(r.business_id) then raise exception 'Not allowed'; end if;
 perform 1 from public.jobs where id=r.job_id for update;
 if exists(select 1 from public.payments where request_id=p_request and method='cash' and status='succeeded') then return; end if;
 if exists(select 1 from public.invoices where job_id=r.job_id and id in (select invoice_id from public.invoice_payment_reservations)) then raise exception 'An online payment was started'; end if;
 if r.intent_method is not null or exists(select 1 from public.payments where request_id=p_request) then raise exception 'An online payment was started'; end if;
 select coalesce(sum(amount_cents),0) into received from public.payments where job_id=r.job_id and status in ('succeeded','processing');
 if received+r.amount_cents>public.job_agreed_total(r.job_id) then raise exception 'Nothing due'; end if;
 insert into public.payments(business_id,job_id,request_id,amount_cents,method,status) values(r.business_id,r.job_id,r.id,r.amount_cents,'cash','succeeded');
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(r.business_id,auth.uid(),'payment.cash','job',r.job_id);
end $$;
revoke all on function public.record_job_cash(uuid) from public,anon;
grant execute on function public.record_job_cash(uuid) to authenticated;

-- No client can bypass the validated cash RPC.
drop policy if exists "members add cash" on public.payments;

-- Existing invoice payments inherit their job. This also prevents cross-business credits.
create function public.payment_job_guard() returns trigger language plpgsql set search_path='' as $$
declare j uuid; bid uuid;
begin
 if new.invoice_id is not null then
 select job_id,business_id into j,bid from public.invoices where id=new.invoice_id;
 if bid<>new.business_id or (new.job_id is not null and new.job_id<>j) then raise exception 'Payment does not match'; end if;
 new.job_id:=j;
 end if;
 if new.job_id is not null and not exists(select 1 from public.jobs where id=new.job_id and business_id=new.business_id) then raise exception 'Payment does not match'; end if;
 return new;
end $$;
create trigger payment_job_guard before insert or update on public.payments for each row execute function public.payment_job_guard();

-- Credits are explicit negative changes; they cannot make the approved subtotal negative.
alter table public.change_orders drop constraint change_orders_amount_cents_check;
alter table public.change_orders add constraint change_orders_amount_cents_check check(amount_cents between -100000000 and 100000000);
alter table public.change_orders add constraint change_orders_nonnegative_total check(base_cents+amount_cents>=0);
alter table public.invoice_lines drop constraint invoice_lines_unit_cents_check;
alter table public.invoice_lines add constraint invoice_lines_unit_cents_check check(unit_cents between -100000000 and 100000000);

create function public.invoice_total_cents(p_invoice uuid) returns integer language sql stable security definer set search_path='' as $$
 select (coalesce(sum(round(l.qty_hundredths::numeric*l.unit_cents/100)),0)+
 round(coalesce(sum(case when (l.kind='material' and i.tax_materials) or (l.kind<>'material' and i.tax_labor)
 then round(l.qty_hundredths::numeric*l.unit_cents/100) else 0 end),0)*coalesce(i.tax_rate_bps,0)/10000))::integer
 from public.invoices i left join public.invoice_lines l on l.invoice_id=i.id where i.id=p_invoice group by i.id
$$;
revoke all on function public.invoice_total_cents(uuid) from public,anon,authenticated;
grant execute on function public.invoice_total_cents(uuid) to service_role;

create or replace function public.mark_invoice_paid(p_invoice_id uuid,p_amount_cents integer) returns void
language plpgsql security definer set search_path='' as $$
declare i record; paid bigint; due integer;
begin
 select * into i from public.invoices where id=p_invoice_id;
 if not found or not public.is_owner(i.business_id) or i.sent_at is null then raise exception 'Not allowed'; end if;
 perform 1 from public.jobs where id=i.job_id for update;
 if i.paid_at is not null then return; end if;
 if exists(select 1 from public.invoice_payment_reservations where invoice_id=i.id) then raise exception 'An online payment was started'; end if;
 if exists(select 1 from public.payments where job_id=i.job_id and status='processing') or
 exists(select 1 from public.job_payment_requests r where r.job_id=i.job_id and r.intent_method is not null
 and not exists(select 1 from public.payments p where p.request_id=r.id and p.status in ('succeeded','failed')))
 then raise exception 'Wait for the online payment'; end if;
 select coalesce(sum(amount_cents),0) into paid from public.payments where job_id=i.job_id and status='succeeded';
 due:=greatest(0,public.invoice_total_cents(i.id)-paid);
 -- Caller confirms the displayed remaining amount; stale screens cannot overcharge.
 if p_amount_cents<>due then raise exception 'Balance changed. Refresh first'; end if;
 if due>0 then insert into public.payments(business_id,job_id,invoice_id,amount_cents,method,status) values(i.business_id,i.job_id,i.id,due,'cash','succeeded'); end if;
 update public.invoices set paid_at=now() where id=i.id;
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(i.business_id,auth.uid(),'invoice.paid','invoice',i.id);
end $$;

create or replace function public.record_stripe_payment(p_business uuid,p_invoice uuid,p_intent text,p_amount_cents integer,p_method text,p_status text,p_invoice_total integer) returns void
language plpgsql security definer set search_path='' as $$
declare i record; paid bigint;
begin
 select * into i from public.invoices where id=p_invoice and business_id=p_business and sent_at is not null;
 if not found then raise exception 'Missing invoice'; end if;
 perform 1 from public.jobs where id=i.job_id for update;
 if p_method not in ('wallet','bank') or p_status not in ('processing','succeeded','failed') or p_amount_cents<1 or p_intent !~ '^pi_[A-Za-z0-9]{8,64}$' then raise exception 'Invalid payment'; end if;
 if exists(select 1 from public.payments where stripe_payment_intent=p_intent and (invoice_id is distinct from p_invoice or business_id<>p_business or amount_cents<>p_amount_cents)) then raise exception 'Payment does not match'; end if;
 insert into public.payments(business_id,job_id,invoice_id,amount_cents,method,stripe_payment_intent,status)
 values(p_business,i.job_id,p_invoice,p_amount_cents,p_method,p_intent,p_status)
 on conflict(stripe_payment_intent) do update set status=case when public.payments.status='succeeded' then 'succeeded' else excluded.status end;
 select coalesce(sum(amount_cents),0) into paid from public.payments where job_id=i.job_id and status='succeeded';
 if paid>=public.invoice_total_cents(i.id) then update public.invoices set paid_at=coalesce(paid_at,now()) where id=i.id; end if;
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(p_business,null,'payment.'||p_status,'invoice',p_invoice);
end $$;


create function public.reserve_invoice_payment(p_invoice uuid,p_method text) returns integer
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
 exists(select 1 from public.job_payment_requests r where r.job_id=i.job_id and r.intent_method is not null and not exists(select 1 from public.payments p where p.request_id=r.id and p.status in ('succeeded','failed')))
 then raise exception 'Wait for the online payment'; end if;
 select coalesce(sum(amount_cents),0) into paid from public.payments where job_id=i.job_id and status='succeeded';
 due:=greatest(0,public.invoice_total_cents(i.id)-paid);
 if due<=0 or i.paid_at is not null then raise exception 'Nothing due'; end if;
 insert into public.invoice_payment_reservations(invoice_id,collection_method,collection_cents) values(i.id,p_method,due);
 return due;
end $$;
revoke all on function public.reserve_invoice_payment(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_invoice_payment(uuid,text) to service_role;

create function public.validate_credit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare agreed integer; paid bigint;
begin
 if new.amount_cents<0 and (tg_op='INSERT' or old.signed_at is null) then
  perform 1 from public.jobs where id=new.job_id for update;
  agreed:=public.job_agreed_total(new.job_id);
  select coalesce(sum(amount_cents),0) into paid from public.payments where job_id=new.job_id and status in ('succeeded','processing');
  -- Conservative protection: tax can only increase this discount's effect.
  if agreed+round(new.amount_cents::numeric*(10000+coalesce((select tax_rate_bps from public.estimates where job_id=new.job_id and tax_labor),0))/10000)<paid or new.base_cents+new.amount_cents<0 then raise exception 'Credit exceeds the unpaid agreed balance'; end if;
 end if;
 return new;
end $$;
create trigger change_order_credit before insert or update on public.change_orders for each row execute function public.validate_credit_change();

create function public.invoice_nonnegative_total() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.sent_at is not null and old.sent_at is null and (select coalesce(sum(round(qty_hundredths::numeric*unit_cents/100)),0) from public.invoice_lines where invoice_id=new.id)<0 then raise exception 'Invoice total cannot be negative'; end if;
 return new;
end $$;
create trigger invoice_nonnegative_total before update on public.invoices for each row execute function public.invoice_nonnegative_total();
