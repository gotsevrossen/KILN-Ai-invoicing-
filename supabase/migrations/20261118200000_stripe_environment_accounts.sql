-- Keep the sandbox connection when a business onboards in live mode.
-- An older unclassified account is assigned a mode only after Stripe verifies it.
alter table public.stripe_accounts
  drop constraint stripe_accounts_pkey,
  drop constraint stripe_accounts_account_id_key,
  add primary key (account_id),
  add constraint stripe_accounts_business_mode_unique unique nulls not distinct (business_id,test_mode);
