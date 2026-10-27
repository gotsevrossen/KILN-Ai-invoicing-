-- Sending invoices by link and getting paid online (Stripe: Apple Pay / Google Pay and bank).
-- Links, Stripe accounts, and online payments are written only by KILN's server functions
-- (supabase/functions/payments, pay, stripe-webhook), never by the app directly.

-- ---------------------------------------------------------------- the business's Stripe account

-- Each business is paid into its own Stripe account; KILN only holds the account id.
create table public.stripe_accounts (
  business_id uuid primary key references public.businesses on delete cascade,
  account_id text not null unique check (account_id ~ '^acct_[A-Za-z0-9]{6,64}$'),
  wallet_ready boolean not null default false,
  bank_ready boolean not null default false,
  -- the pay page's web address, once Stripe knows it (Apple Pay needs this)
  domain_registered text,
  updated_at timestamptz not null default now()
);

alter table public.stripe_accounts enable row level security;
create policy "members read" on public.stripe_accounts
  for select to authenticated using (public.is_member(business_id));
-- no insert, update, or delete policy: only the server writes these

-- ---------------------------------------------------------------- customer links

alter table public.share_links
  add column opened_at timestamptz;

-- links are made by the server (it keeps the only copy of the code); owners can still see them
drop policy "members insert" on public.share_links;
drop policy "members update" on public.share_links;
drop policy "members delete" on public.share_links;

create index on public.share_links (document_id);

-- ---------------------------------------------------------------- payments

alter table public.payments
  add column status text not null default 'succeeded' check (status in ('processing', 'succeeded', 'failed')),
  add constraint payments_online_has_intent check (
    (method in ('wallet', 'bank', 'card')) = (stripe_payment_intent is not null)
  );

-- A payment is a record of money: owners add cash (or check) themselves; online payments come
-- only from Stripe through the server. Nobody changes or removes one from the app.
drop policy "members insert" on public.payments;
drop policy "members update" on public.payments;
drop policy "members delete" on public.payments;
create policy "members add cash" on public.payments
  for insert to authenticated with check (
    public.is_member(business_id)
    and method in ('cash', 'check', 'other')
    and status = 'succeeded'
    and stripe_payment_intent is null
  );

/**
 * Records what Stripe says about one payment (from the webhook, or the pay page checking back).
 * The same payment can be reported more than once and out of order: a succeeded payment never
 * goes back to processing. When the paid total reaches the invoice total, the invoice is paid.
 */
create function public.record_stripe_payment(
  p_business uuid, p_invoice uuid, p_intent text, p_amount_cents integer,
  p_method text, p_status text, p_invoice_total integer
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  paid integer;
begin
  if p_method not in ('wallet', 'bank') or p_status not in ('processing', 'succeeded', 'failed') then
    raise exception 'unknown payment method or status';
  end if;
  insert into public.payments (business_id, invoice_id, amount_cents, method, stripe_payment_intent, status)
    values (p_business, p_invoice, p_amount_cents, p_method, p_intent, p_status)
  on conflict (stripe_payment_intent) do update
    set status = case when public.payments.status = 'succeeded' then 'succeeded' else excluded.status end,
        paid_at = case when public.payments.status <> 'succeeded' and excluded.status = 'succeeded' then now() else public.payments.paid_at end;

  if p_status = 'succeeded' then
    select coalesce(sum(amount_cents), 0) into paid
      from public.payments where invoice_id = p_invoice and status = 'succeeded';
    if paid >= p_invoice_total then
      update public.invoices set paid_at = now() where id = p_invoice and paid_at is null and sent_at is not null;
    end if;
  end if;
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (p_business, null, 'payment.' || p_status, 'invoice', p_invoice);
end;
$$;

revoke execute on function public.record_stripe_payment(uuid, uuid, text, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.record_stripe_payment(uuid, uuid, text, integer, text, text, integer) to service_role;
