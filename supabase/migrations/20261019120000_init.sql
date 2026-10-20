-- KILN starting schema.
-- Rules (see CLAUDE.md):
--   * Money is integer cents. Rates are basis points (700 = 7%). Quantities are hundredths (250 = 2.5).
--   * Every table has Row Level Security. A signed-in user only sees rows of businesses they belong to.
--   * Data belongs to the business, not the person, so helpers can be added later.
--   * Sent invoices and signed estimates keep their own copy of the lines (they don't change afterwards).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- businesses

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  phone text not null default '',
  trades text[] not null default '{}',
  pricing text not null default 'flat' check (pricing in ('flat', 'hourly')),
  rate_cents integer not null default 8500 check (rate_cents >= 0),
  markup_bps integer not null default 2000 check (markup_bps between 0 and 100000),
  tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 10000),
  tax_labor boolean not null default false,
  tax_materials boolean not null default false,
  deposit_bps integer not null default 3000 check (deposit_bps between 0 and 10000),
  due_days integer not null default 15 check (due_days between 0 and 365),
  card_fee boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'helper')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

-- True when the signed-in user belongs to the business. Security definer so policies
-- on other tables can call it without needing access to business_members themselves.
create function public.is_member(bid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = bid and m.user_id = (select auth.uid())
  );
$$;

create function public.is_owner(bid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = bid and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Setup: creates the business and makes the caller its owner in one step,
-- so nobody can create a membership row for someone else's business.
create function public.create_business(
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

-- ---------------------------------------------------------------- customers and jobs

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  name text not null check (length(name) between 1 and 120),
  phone text not null default '',
  email text not null default '',
  lang text not null default 'en' check (lang in ('en', 'es')),
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  customer_id uuid not null references public.customers on delete restrict,
  title text not null check (length(title) between 1 and 160),
  address text not null default '',
  pricing text not null default 'flat' check (pricing in ('flat', 'hourly')),
  rate_cents integer check (rate_cents >= 0),
  work_order text,
  private_note text,
  estimate_skipped boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  -- id of the starter item it came from (e.g. 'dw-patch'), null for the owner's own items
  catalog_id text,
  name text not null check (length(name) between 1 and 160),
  unit text not null check (unit in ('sq_ft', 'board', 'linear_ft', 'hour', 'flat', 'each', 'cu_yd')),
  -- null until the owner sets a price; KILN never makes one up
  unit_cents integer check (unit_cents >= 0),
  created_at timestamptz not null default now(),
  unique (business_id, catalog_id)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  job_id uuid not null references public.jobs on delete cascade,
  worked_on date not null default current_date,
  hundredths integer not null check (hundredths > 0 and hundredths <= 2400),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  job_id uuid not null references public.jobs on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  job_id uuid not null references public.jobs on delete cascade,
  -- path in the private 'job-photos' storage bucket
  storage_path text not null,
  tag text check (tag in ('before', 'during', 'after')),
  -- GPS is sensitive: kept for proof of work, stripped from customer copies unless shown on purpose
  lat double precision,
  lng double precision,
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.voice_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  job_id uuid not null references public.jobs on delete cascade,
  storage_path text not null,
  duration_ms integer check (duration_ms >= 0),
  transcript text,
  transcribed_by text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- estimates and change orders

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  job_id uuid not null references public.jobs on delete cascade unique,
  number text not null,
  deposit_on boolean not null default true,
  deposit_bps integer not null default 3000 check (deposit_bps between 0 and 10000),
  sent_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.estimate_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  estimate_id uuid not null references public.estimates on delete cascade,
  price_item_id uuid references public.price_list_items on delete set null,
  description text not null check (length(description) between 1 and 300),
  unit text not null check (unit in ('sq_ft', 'board', 'linear_ft', 'hour', 'flat', 'each', 'cu_yd')),
  qty_hundredths integer not null check (qty_hundredths > 0),
  unit_cents integer check (unit_cents >= 0),
  from_voice boolean not null default false,
  position integer not null default 0
);

create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  job_id uuid not null references public.jobs on delete cascade,
  number integer not null check (number > 0),
  description text not null check (length(description) between 1 and 2000),
  amount_cents integer not null check (amount_cents >= 0),
  sent_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, number)
);

-- ---------------------------------------------------------------- receipts

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  store text not null default '',
  receipt_number text not null default '',
  purchased_on date,
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer check (total_cents >= 0),
  storage_path text,
  -- 'reading' while the AI reads it, 'ready' when items are in, 'failed' if it couldn't
  status text not null default 'ready' check (status in ('reading', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  receipt_id uuid not null references public.receipts on delete cascade,
  line integer not null check (line > 0),
  name text not null,
  qty_label text not null default '',
  cost_cents integer not null check (cost_cents >= 0),
  -- AI wasn't sure about this line; the owner must check it
  flagged boolean not null default false,
  -- null = still in the inbox
  assignment text check (assignment in ('jobs', 'personal', 'overhead')),
  markup_off boolean not null default false
);

-- which job(s) a receipt item went to; more than one row = split evenly
create table public.receipt_item_jobs (
  receipt_item_id uuid not null references public.receipt_items on delete cascade,
  job_id uuid not null references public.jobs on delete cascade,
  business_id uuid not null references public.businesses on delete cascade,
  primary key (receipt_item_id, job_id)
);

-- ---------------------------------------------------------------- invoices and payments

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  job_id uuid not null references public.jobs on delete cascade unique,
  number text not null,
  summary text not null default '',
  materials_mode text not null default 'items' check (materials_mode in ('items', 'total')),
  show_location boolean not null default false,
  due_on date,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, number)
);

-- the lines exactly as sent; written when the invoice is sent
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  invoice_id uuid not null references public.invoices on delete cascade,
  kind text not null check (kind in ('labor', 'fee', 'material')),
  description text not null,
  qty_hundredths integer not null check (qty_hundredths > 0),
  unit_cents integer not null check (unit_cents >= 0),
  position integer not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  invoice_id uuid references public.invoices on delete set null,
  estimate_id uuid references public.estimates on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('card', 'bank', 'wallet', 'cash', 'check', 'other')),
  stripe_payment_intent text unique,
  paid_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- signatures, links, audit

create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  document_type text not null check (document_type in ('estimate', 'change_order')),
  document_id uuid not null,
  signer_name text not null,
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  -- SHA-256 of exactly what was signed
  document_hash text not null,
  image_path text
);

-- customer links: only the hash of the token is stored; links expire and open one document
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  token_hash text not null unique,
  document_type text not null check (document_type in ('estimate', 'invoice', 'change_order')),
  document_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses on delete cascade,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexes

create index on public.business_members (user_id);
create index on public.customers (business_id);
create index on public.jobs (business_id);
create index on public.jobs (customer_id);
create index on public.price_list_items (business_id);
create index on public.time_entries (job_id);
create index on public.notes (job_id);
create index on public.photos (job_id);
create index on public.voice_notes (job_id);
create index on public.estimate_lines (estimate_id);
create index on public.change_orders (job_id);
create index on public.receipts (business_id);
create index on public.receipt_items (receipt_id);
create index on public.receipt_item_jobs (job_id);
create index on public.invoice_lines (invoice_id);
create index on public.payments (invoice_id);
create index on public.signatures (document_id);
create index on public.audit_log (business_id, at);

-- ---------------------------------------------------------------- row level security

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

create policy "members read their business" on public.businesses
  for select to authenticated using (public.is_member(id));
create policy "owners update their business" on public.businesses
  for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));
-- businesses are created only through create_business(); no insert or delete policy

create policy "members see their memberships" on public.business_members
  for select to authenticated using (user_id = (select auth.uid()) or public.is_owner(business_id));
-- memberships are created only through create_business() (helpers come later)

-- Every other table: members of the business can read and write its rows.
do $$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'jobs', 'price_list_items', 'time_entries', 'notes', 'photos', 'voice_notes',
    'estimates', 'estimate_lines', 'change_orders', 'receipts', 'receipt_items', 'receipt_item_jobs',
    'invoices', 'invoice_lines', 'payments', 'signatures', 'share_links'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_member(business_id))', t);
    execute format('create policy "members insert" on public.%I for insert to authenticated with check (public.is_member(business_id))', t);
    execute format('create policy "members update" on public.%I for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id))', t);
    execute format('create policy "members delete" on public.%I for delete to authenticated using (public.is_member(business_id))', t);
  end loop;
end;
$$;

-- the audit log can be read and added to, never changed or deleted
alter table public.audit_log enable row level security;
create policy "members read audit" on public.audit_log
  for select to authenticated using (public.is_member(business_id));
create policy "members add audit" on public.audit_log
  for insert to authenticated with check (public.is_member(business_id) and actor = (select auth.uid()));

-- Child rows must point at a parent in the same business (stops mixing rows across businesses).
create function public.same_business_check() returns trigger
language plpgsql set search_path = ''
as $$
declare
  parent_business uuid;
begin
  execute format('select business_id from public.%I where id = $1', tg_argv[0])
    into parent_business using (to_jsonb(new) ->> tg_argv[1])::uuid;
  if parent_business is null or parent_business <> new.business_id then
    raise exception '% must belong to the same business', tg_argv[0];
  end if;
  return new;
end;
$$;

create trigger jobs_customer_same_business before insert or update on public.jobs
  for each row execute function public.same_business_check('customers', 'customer_id');
create trigger time_entries_job_same_business before insert or update on public.time_entries
  for each row execute function public.same_business_check('jobs', 'job_id');
create trigger notes_job_same_business before insert or update on public.notes
  for each row execute function public.same_business_check('jobs', 'job_id');
create trigger photos_job_same_business before insert or update on public.photos
  for each row execute function public.same_business_check('jobs', 'job_id');
create trigger voice_notes_job_same_business before insert or update on public.voice_notes
  for each row execute function public.same_business_check('jobs', 'job_id');
create trigger estimates_job_same_business before insert or update on public.estimates
  for each row execute function public.same_business_check('jobs', 'job_id');
create trigger estimate_lines_estimate_same_business before insert or update on public.estimate_lines
  for each row execute function public.same_business_check('estimates', 'estimate_id');
create trigger change_orders_job_same_business before insert or update on public.change_orders
  for each row execute function public.same_business_check('jobs', 'job_id');
create trigger receipt_items_receipt_same_business before insert or update on public.receipt_items
  for each row execute function public.same_business_check('receipts', 'receipt_id');
create trigger receipt_item_jobs_job_same_business before insert or update on public.receipt_item_jobs
  for each row execute function public.same_business_check('jobs', 'job_id');
create trigger receipt_item_jobs_item_same_business before insert or update on public.receipt_item_jobs
  for each row execute function public.same_business_check('receipt_items', 'receipt_item_id');
create trigger invoices_job_same_business before insert or update on public.invoices
  for each row execute function public.same_business_check('jobs', 'job_id');
create trigger invoice_lines_invoice_same_business before insert or update on public.invoice_lines
  for each row execute function public.same_business_check('invoices', 'invoice_id');

-- Frozen documents: a signed estimate's lines and a sent invoice's lines can't change.
create function public.block_frozen_lines() returns trigger
language plpgsql set search_path = ''
as $$
declare
  frozen boolean;
  row_data jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_table_name = 'estimate_lines' then
    select signed_at is not null into frozen from public.estimates where id = (row_data ->> 'estimate_id')::uuid;
  else
    select sent_at is not null into frozen from public.invoices where id = (row_data ->> 'invoice_id')::uuid;
  end if;
  if frozen then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger estimate_lines_frozen before update or delete on public.estimate_lines
  for each row execute function public.block_frozen_lines();
create trigger invoice_lines_frozen before update or delete on public.invoice_lines
  for each row execute function public.block_frozen_lines();

-- ---------------------------------------------------------------- storage (photos, voice notes, receipts)

insert into storage.buckets (id, name, public) values
  ('job-photos', 'job-photos', false),
  ('voice-notes', 'voice-notes', false),
  ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- files live under <business_id>/..., and only members of that business can touch them
create policy "members read files" on storage.objects for select to authenticated
  using (bucket_id in ('job-photos', 'voice-notes', 'receipts') and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "members upload files" on storage.objects for insert to authenticated
  with check (bucket_id in ('job-photos', 'voice-notes', 'receipts') and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "members delete files" on storage.objects for delete to authenticated
  using (bucket_id in ('job-photos', 'voice-notes', 'receipts') and public.is_member(((storage.foldername(name))[1])::uuid));
