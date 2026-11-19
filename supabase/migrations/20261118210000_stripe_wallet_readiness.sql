-- The previous combined flag cannot identify which wallet Stripe enabled.
alter table public.stripe_accounts
  add column apple_pay_ready boolean not null default false,
  add column google_pay_ready boolean not null default false;

update public.stripe_accounts set wallet_ready = false where wallet_ready;

-- Before returning any client secret, bind the intent once. This also protects
-- requests that overlap the switch to Stripe's new idempotency keys.
create function public.keep_bound_payment_intent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.intent_id is not null and new.intent_id is distinct from old.intent_id then
    raise exception 'Payment intent already bound';
  end if;
  return new;
end $$;

create trigger keep_invoice_payment_intent
  before update of intent_id on public.invoice_payment_reservations
  for each row execute function public.keep_bound_payment_intent();

create trigger keep_job_payment_intent
  before update of intent_id on public.job_payment_requests
  for each row execute function public.keep_bound_payment_intent();

-- Stripe may cache the old 400 response. Restart the idempotency window only for
-- reservations that have never returned a bound intent to a customer.
update public.invoice_payment_reservations set created_at = now() where intent_id is null;
update public.job_payment_requests set reserved_at = now() where intent_method is not null and intent_id is null;
