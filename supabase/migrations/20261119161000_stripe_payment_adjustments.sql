-- Compensating entries keep the original Stripe amount available for replay validation.
alter table public.payments
  add column stripe_adjustment_kind text check (stripe_adjustment_kind in ('refund','dispute')),
  add column stripe_adjustment_of uuid,
  add column stripe_dispute_open boolean not null default false,
  drop constraint payments_amount_cents_check,
  add constraint payments_amount_cents_check check (
    (amount_cents > 0 and stripe_adjustment_kind is null and stripe_adjustment_of is null)
    or (amount_cents < 0 and stripe_adjustment_kind is not null and stripe_adjustment_of is not null
      and method = 'other' and stripe_payment_intent is null and request_id is null and status = 'succeeded')
  ),
  add unique (stripe_adjustment_of, stripe_adjustment_kind);

-- Provider object state survives archival so future updates can still correct retained documents.
create table public.stripe_payment_adjustments (
  business_id uuid not null references public.businesses on delete cascade,
  intent_id text not null,
  provider_id text not null,
  kind text not null check (kind in ('refund','dispute')),
  amount_cents integer not null check (amount_cents > 0),
  state text not null check (state in ('pending','debit','closed')),
  event_at bigint not null,
  primary key (business_id, provider_id)
);
create index stripe_payment_adjustments_intent on public.stripe_payment_adjustments (business_id,intent_id);
alter table public.stripe_payment_adjustments enable row level security;
revoke all on public.stripe_payment_adjustments from public, anon, authenticated, service_role;

create or replace function public.check_invoice() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.sent_at is not null or new.paid_at is not null then
      raise exception 'an invoice starts as a draft';
    end if;
    return new;
  end if;
  if new.sent_at is not null and old.sent_at is null then
    if not exists (select 1 from public.invoice_lines l where l.invoice_id = new.id) then
      raise exception 'an invoice needs its lines before it is sent';
    end if;
    if new.tax_rate_bps is null or new.tax_labor is null or new.tax_materials is null or new.issued_on is null or new.due_days is null then
      raise exception 'the tax rule and due date are saved when the invoice is sent';
    end if;
  end if;
  if new.paid_at is not null and new.sent_at is null then
    raise exception 'only a sent invoice can be marked paid';
  end if;
  -- Issued contents are immutable. Only Stripe reconciliation may clear the paid time.
  if old.sent_at is not null and (to_jsonb(new) - 'paid_at') is distinct from (to_jsonb(old) - 'paid_at') then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  if old.paid_at is not null and new.paid_at is distinct from old.paid_at
    and not (new.paid_at is null and current_setting('kiln.stripe_adjustment', true) is not distinct from 'on'
      and current_user not in ('anon', 'authenticated', 'service_role')) then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  return new;
end;
$$;

create or replace function public.job_paid_at(p_job uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when count(*) > 0 and count(*) = count(i.paid_at) then max(i.paid_at) end
  from public.invoices i where i.job_id = p_job
    and not exists (select 1 from public.jobs j where j.id = p_job and j.reopened)
    and not exists (select 1 from public.payments p where p.job_id=p_job and p.stripe_dispute_open);
$$;

create or replace function public.billing_export_page(p_business uuid,p_kind text,p_after uuid) returns table(record_id uuid, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner(p_business) then raise sqlstate '42501' using message='Not allowed'; end if;
  if p_kind='invoice' then
    return query select i.id, jsonb_build_object('number',i.number,'customer',c.name,'job',j.title,'issuedOn',i.issued_on,
      'dueOn',i.issued_on+i.due_days,'status',case when i.paid_at is not null then 'paid' when i.sent_at is not null then 'issued' else 'draft' end,
      'total',amount.total,'paid',case when i.paid_at is not null then amount.total else paid.amount end)
    from public.invoices i join public.jobs j on j.id=i.job_id join public.customers c on c.id=j.customer_id
    cross join lateral (select public.invoice_total_cents(i.id) as total) amount
    cross join lateral (select coalesce(sum(p.amount_cents),0) as amount from public.payments p where p.job_id=i.job_id and p.status='succeeded') paid
    where i.business_id=p_business and i.sent_at is not null and (p_after is null or i.id>p_after) order by i.id limit 100;
  elsif p_kind='payment' then
    return query select p.id,jsonb_build_object('number',i.number,'customer',c.name,'job',j.title,'jobId',p.job_id,'date',p.paid_at,
      'amount',p.amount_cents,'method',coalesce(p.stripe_adjustment_kind,p.alternative_method,p.method))
    from public.payments p left join public.invoices i on i.id=p.invoice_id
    left join public.jobs j on j.id=p.job_id left join public.customers c on c.id=j.customer_id
    where p.business_id=p_business and p.status='succeeded' and (p_after is null or p.id>p_after) order by p.id limit 100;
  elsif p_kind='archived' then
    return query select d.id,d.snapshot || jsonb_build_object('archivedJobId',d.job_id) from public.saved_documents d
    where d.business_id=p_business and d.document_type='invoice' and (p_after is null or d.id>p_after) order by d.id limit 100;
  else raise exception 'Invalid export kind'; end if;
end $$;
revoke all on function public.billing_export_page(uuid,text,uuid) from public, anon;
grant execute on function public.billing_export_page(uuid,text,uuid) to authenticated;

create or replace function public.archive_invoice_payments() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.snapshot := jsonb_set(new.snapshot,'{payments}',coalesce((select jsonb_agg(jsonb_build_object(
    'amountCents',p.amount_cents,'method',coalesce(p.stripe_adjustment_kind,p.alternative_method,p.method),'paidAt',p.paid_at,'status',p.status,'paymentIntent',p.stripe_payment_intent,'adjustmentFor',original.stripe_payment_intent) order by p.paid_at,p.id)
    from public.payments p left join public.payments original on original.id=p.stripe_adjustment_of where p.business_id=new.business_id and p.job_id=new.job_id),'[]'::jsonb));
  return new;
end $$;

create function public.reconcile_stripe_adjustment(
  p_account text, p_test boolean, p_intent text, p_provider text, p_kind text,
  p_amount integer, p_state text, p_event_at bigint
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  bid uuid;
  original public.payments;
  archived public.saved_documents;
  gross integer;
  job uuid;
  refunds integer;
  disputes integer;
  dispute_open boolean;
  net_paid bigint;
  invoice uuid;
  refunded_at timestamptz := to_timestamp(p_event_at);
begin
  if p_intent !~ '^pi_[A-Za-z0-9]+$' or p_amount is null or p_amount <= 0 or p_event_at is null or p_event_at <= 0
    or p_kind is null or p_kind not in ('refund','dispute') or p_state is null or p_state not in ('pending','debit','closed')
    or p_provider is null or (p_kind='refund' and p_provider !~ '^re_[A-Za-z0-9]+$')
    or (p_kind='dispute' and p_provider !~ '^du_[A-Za-z0-9]+$') then
    raise exception 'Invalid Stripe adjustment';
  end if;
  select business_id into bid from public.stripe_accounts where account_id=p_account and (test_mode=p_test or test_mode is null);
  if not found then return true; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_intent,0));
  select * into original from public.payments where business_id=bid and stripe_payment_intent=p_intent;
  job := original.job_id;
  -- Serialize with payment recording and paid-job removal.
  if job is not null then perform 1 from public.jobs where id=job for update; end if;
  select * into original from public.payments where business_id=bid and stripe_payment_intent=p_intent;
  if original.id is not null then
    if original.status <> 'succeeded' then return false; end if;
    gross := original.amount_cents;
  else
    select d.* into archived from public.saved_documents d
    where d.business_id=bid and d.document_type='invoice'
      and d.snapshot->'payments' @> jsonb_build_array(jsonb_build_object('paymentIntent',p_intent))
    order by d.id limit 1 for update;
    if not found then
      -- A connected checkout may deliver an adjustment before its first settlement webhook.
      return not exists (select 1 from public.invoice_payment_reservations r
        join public.invoices i on i.id=r.invoice_id where r.intent_id=p_intent and i.business_id=bid)
        and not exists (select 1 from public.job_payment_requests r where r.intent_id=p_intent and r.business_id=bid);
    end if;
    select (item->>'amountCents')::integer into gross from jsonb_array_elements(archived.snapshot->'payments') item
      where item->>'paymentIntent'=p_intent;
  end if;
  if p_kind='refund' and p_amount > gross then raise exception 'Stripe refund exceeds payment'; end if;
  insert into public.stripe_payment_adjustments as existing (business_id,intent_id,provider_id,kind,amount_cents,state,event_at)
    values(bid,p_intent,p_provider,p_kind,p_amount,p_state,p_event_at)
    on conflict (business_id,provider_id) do update set
      amount_cents=excluded.amount_cents,state=excluded.state,event_at=excluded.event_at
    where existing.intent_id=excluded.intent_id and existing.kind=excluded.kind
      and existing.event_at <= excluded.event_at
      and (existing.state='pending' or excluded.state<>'pending')
      and (existing.amount_cents,existing.state) is distinct from (excluded.amount_cents,excluded.state);
  if not found then return true; end if;
  select least(gross,coalesce(sum(amount_cents) filter (where kind='refund' and state='debit'),0)),
    least(gross,coalesce(sum(amount_cents) filter (where kind='dispute' and state='debit'),0)),
    coalesce(bool_or(kind='dispute' and state='pending'),false)
    into refunds,disputes,dispute_open
    from public.stripe_payment_adjustments where business_id=bid and intent_id=p_intent;
  disputes := least(gross-refunds,disputes);

  if original.id is not null then
    invoice := original.invoice_id;
    if invoice is null then
      select i.id into invoice from public.invoices i where i.job_id=job and i.sent_at is not null order by i.sent_at desc limit 1;
    end if;
    update public.payments set stripe_dispute_open=dispute_open where id=original.id;
    delete from public.payments where stripe_adjustment_of=original.id
      and ((stripe_adjustment_kind='refund' and refunds=0) or (stripe_adjustment_kind='dispute' and disputes=0));
    insert into public.payments(business_id,job_id,invoice_id,method,status,amount_cents,paid_at,stripe_adjustment_of,stripe_adjustment_kind)
      select bid,job,invoice,'other','succeeded',-entry.cents,refunded_at,original.id,entry.kind
      from (values ('refund',refunds),('dispute',disputes)) entry(kind,cents) where entry.cents>0
    on conflict (stripe_adjustment_of,stripe_adjustment_kind) do update set amount_cents=excluded.amount_cents
      where payments.amount_cents is distinct from excluded.amount_cents;
    if invoice is not null then
      select coalesce(sum(amount_cents),0) into net_paid from public.payments
      where status='succeeded' and (job_id=job or invoice_id=invoice);
      perform set_config('kiln.stripe_adjustment','on',true);
      if net_paid < public.invoice_total_cents(invoice) then
        update public.invoices set paid_at=null where id=invoice and paid_at is not null;
        if found then update public.jobs set removal_warned_at=null, documents_choice=null where id=job; end if;
      else
        update public.invoices set paid_at=now() where id=invoice and paid_at is null;
      end if;
      perform set_config('kiln.stripe_adjustment','off',true);
    end if;
  else
    -- The archived invoice already contains the gross receipt. Replace its adjustment rows.
    with retained as (
      select coalesce(jsonb_agg(item),'[]'::jsonb) as items
      from jsonb_array_elements(archived.snapshot->'payments') item
      where item->>'adjustmentFor' is distinct from p_intent
    ), corrections as (
      select coalesce(jsonb_agg(jsonb_build_object('amountCents',-entry.cents,'method',entry.kind,
        'paidAt',refunded_at,'status','succeeded','adjustmentFor',p_intent)),'[]'::jsonb) as items
      from (values ('refund',refunds),('dispute',disputes)) entry(kind,cents) where entry.cents>0
    )
    update public.saved_documents d set snapshot=jsonb_set(d.snapshot,'{payments}',retained.items||corrections.items)
      from retained,corrections where d.id=archived.id;
  end if;

  insert into public.audit_log(business_id,actor,action,entity,entity_id)
    values(bid,null,'payment.'||p_kind||'.'||p_state,'invoice',coalesce(invoice,archived.id,job));
  return true;
end $$;

revoke all on function public.reconcile_stripe_adjustment(text,boolean,text,text,text,integer,text,bigint) from public, anon, authenticated;
grant execute on function public.reconcile_stripe_adjustment(text,boolean,text,text,text,integer,text,bigint) to service_role;
