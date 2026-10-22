-- Saves what the app tracks on jobs, estimates, change orders, receipts, and invoices.
-- Drafts can be unfinished; sending is where completeness is enforced, here on the server
-- as well as in the app. Sent and answered documents can't be changed afterwards.

-- ---------------------------------------------------------------- jobs

-- taken back to the Work step from an invoice draft that wasn't sent
alter table public.jobs add column reopened boolean not null default false;

-- ---------------------------------------------------------------- estimates

alter table public.estimates
  -- the customer-visible description and scope details (never the job's private note)
  add column scope jsonb not null default '{}'::jsonb
    check (jsonb_typeof(scope) = 'object' and pg_column_size(scope) <= 16000),
  -- the tax rule, frozen when the estimate is sent
  add column tax_rate_bps integer check (tax_rate_bps between 0 and 10000),
  add column tax_labor boolean,
  add column tax_materials boolean;

-- Draft lines can be unfinished while the owner types: a blank description or zero quantity
-- is allowed here and blocked at sending. The app's price list ids are text (e.g. 'labor').
alter table public.estimate_lines
  drop constraint estimate_lines_description_check,
  drop constraint estimate_lines_qty_hundredths_check,
  add constraint estimate_lines_description_check check (length(description) <= 300),
  add constraint estimate_lines_qty_hundredths_check check (qty_hundredths between 0 and 100000000),
  add column price_item_ref text check (length(price_item_ref) <= 120),
  add column kind text not null default 'labor' check (kind in ('labor', 'material', 'fee')),
  -- explicitly left out by the owner; still shown to the customer as excluded scope
  add column excluded boolean not null default false;

create function public.check_estimate() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.sent_at is not null or new.signed_at is not null then
      raise exception 'an estimate starts as a draft';
    end if;
    return new;
  end if;
  -- sending: at least one included line, and every included line complete and priced
  if new.sent_at is not null and old.sent_at is null then
    if not exists (select 1 from public.estimate_lines l where l.estimate_id = new.id and not l.excluded) then
      raise exception 'an estimate needs an included line before it is sent';
    end if;
    if exists (
      select 1 from public.estimate_lines l
      where l.estimate_id = new.id and not l.excluded
        and (length(trim(l.description)) = 0 or l.qty_hundredths <= 0 or l.unit_cents is null)
    ) then
      raise exception 'price or exclude every included line before sending';
    end if;
    if new.tax_rate_bps is null or new.tax_labor is null or new.tax_materials is null then
      raise exception 'the tax rule is saved when the estimate is sent';
    end if;
  end if;
  if new.signed_at is not null and new.sent_at is null then
    raise exception 'only a sent estimate can be signed';
  end if;
  -- once sent, only the signature time can be added, and only once
  if old.sent_at is not null and (to_jsonb(new) - 'signed_at') is distinct from (to_jsonb(old) - 'signed_at') then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  if old.signed_at is not null and new.signed_at is distinct from old.signed_at then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  return new;
end;
$$;

create trigger estimates_check before insert or update on public.estimates
  for each row execute function public.check_estimate();

-- Lines of a sent estimate or a sent invoice can't be added, changed, or removed.
-- (Before, an estimate froze only once signed; the app locks it as soon as it's sent.)
create or replace function public.block_frozen_lines() returns trigger
language plpgsql set search_path = ''
as $$
declare
  frozen boolean;
  row_data jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_table_name = 'estimate_lines' then
    select sent_at is not null into frozen from public.estimates where id = (row_data ->> 'estimate_id')::uuid;
  else
    select sent_at is not null into frozen from public.invoices where id = (row_data ->> 'invoice_id')::uuid;
  end if;
  if frozen then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger estimate_lines_frozen on public.estimate_lines;
drop trigger invoice_lines_frozen on public.invoice_lines;
create trigger estimate_lines_frozen before insert or update or delete on public.estimate_lines
  for each row execute function public.block_frozen_lines();
create trigger invoice_lines_frozen before insert or update or delete on public.invoice_lines
  for each row execute function public.block_frozen_lines();

-- ---------------------------------------------------------------- change orders

alter table public.change_orders
  -- the job amount (before tax) the customer saw next to the change
  add column base_cents integer not null default 0 check (base_cents >= 0),
  add column declined_at timestamptz,
  add constraint change_orders_one_answer check (signed_at is null or declined_at is null);

create function public.check_change_order() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.signed_at is not null or old.declined_at is not null then
    raise exception 'this change order was answered and can''t be changed';
  end if;
  return new;
end;
$$;

create trigger change_orders_answered before update on public.change_orders
  for each row execute function public.check_change_order();

-- ---------------------------------------------------------------- receipts

alter table public.receipt_items
  -- what the owner typed for a line KILN couldn't read (the original reading is kept)
  add column fixed_name text check (length(fixed_name) between 1 and 160);

alter table public.receipt_item_jobs
  -- share of the item for this job; equal weights = an even split (e.g. 3 and 1 = 75% / 25%)
  add column weight integer not null default 1 check (weight between 1 and 100000000);

-- ---------------------------------------------------------------- invoices

alter table public.invoices
  add constraint invoices_summary_check check (length(summary) <= 4000),
  add column labor_description text not null default '' check (length(labor_description) <= 300),
  -- the owner's billing check on a job with a signed estimate; all empty = not looked at yet
  add column labor_basis text check (labor_basis in ('actual', 'estimate')),
  add column materials_basis text check (materials_basis in ('included', 'additional')),
  add column billing_reviewed boolean,
  add constraint invoices_billing_together check (
    (labor_basis is null) = (materials_basis is null) and (labor_basis is null) = (billing_reviewed is null)),
  -- frozen when the invoice is sent
  add column tax_rate_bps integer check (tax_rate_bps between 0 and 10000),
  add column tax_labor boolean,
  add column tax_materials boolean,
  add column issued_scope jsonb check (issued_scope is null or (jsonb_typeof(issued_scope) = 'object' and pg_column_size(issued_scope) <= 16000)),
  add column excluded_scope text[] not null default '{}',
  add column due_days integer check (due_days between 0 and 365),
  add column issued_on date,
  add column issued_address text check (length(issued_address) <= 300),
  add column issued_work_order text check (length(issued_work_order) <= 60);

alter table public.invoice_lines
  add column unit text check (unit in ('sq_ft', 'board', 'linear_ft', 'hour', 'flat', 'each', 'cu_yd'));

create function public.check_invoice() returns trigger
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
  -- once sent, only the paid time can be added, and only once
  if old.sent_at is not null and (to_jsonb(new) - 'paid_at') is distinct from (to_jsonb(old) - 'paid_at') then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  if old.paid_at is not null and new.paid_at is distinct from old.paid_at then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  return new;
end;
$$;

create trigger invoices_check before insert or update on public.invoices
  for each row execute function public.check_invoice();

-- payments belong to a document of the same business
create trigger payments_invoice_same_business before insert or update on public.payments
  for each row when (new.invoice_id is not null) execute function public.same_business_check('invoices', 'invoice_id');
create trigger payments_estimate_same_business before insert or update on public.payments
  for each row when (new.estimate_id is not null) execute function public.same_business_check('estimates', 'estimate_id');

-- ---------------------------------------------------------------- signatures

-- a signature points at a signed document of the same business
create function public.check_signature() returns trigger
language plpgsql set search_path = ''
as $$
declare
  doc_business uuid;
begin
  if new.document_type = 'estimate' then
    select business_id into doc_business from public.estimates where id = new.document_id;
  else
    select business_id into doc_business from public.change_orders where id = new.document_id;
  end if;
  if doc_business is null or doc_business <> new.business_id then
    raise exception 'a signature must belong to a document of the same business';
  end if;
  if length(trim(new.signer_name)) < 2 or length(new.signer_name) > 120 then
    raise exception 'a signature needs the signer''s name';
  end if;
  if new.document_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'a signature needs the SHA-256 of the signed document';
  end if;
  return new;
end;
$$;

create trigger signatures_check before insert on public.signatures
  for each row execute function public.check_signature();

-- signatures are evidence: they can be added and read, never changed or removed
drop policy "members update" on public.signatures;
drop policy "members delete" on public.signatures;

-- ---------------------------------------------------------------- indexes

create index on public.estimates (business_id);
create index on public.invoices (business_id);
create index on public.time_entries (business_id);
create index on public.notes (business_id);
create index on public.receipt_items (business_id);
create index on public.receipt_item_jobs (receipt_item_id);
