-- Business records stay put (security review, Oct 26).
--   * A sent or signed estimate, a sent invoice, and an answered change order can't be deleted.
--   * Lines can't be moved out of a sent document by pointing them at another one.
--   * A change order starts unanswered; signing always files the signature in the same step.
--   * Signing, sending an invoice, and marking it paid are each one server step: all of it
--     is saved or none of it is, so a dropped connection can't leave half a record (or
--     put an invoice's lines on it twice).
--   * The server works out the signed document's fingerprint from the saved rows, so it
--     can be checked again later: signature_matches(signature id).
--   * A daily AI limit for all of KILN, on top of each business's own.

-- ---------------------------------------------------------------- no deleting records

create function public.block_record_delete() returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- (each table's own fields; a change order counts once it's answered)
  if tg_table_name = 'change_orders' then
    if old.signed_at is not null or old.declined_at is not null then
      raise exception 'a sent or signed document can''t be deleted';
    end if;
  elsif old.sent_at is not null then
    raise exception 'a sent or signed document can''t be deleted';
  end if;
  return old;
end;
$$;

-- (a job with any of these is already refused by jobs_delete_check, so cascades only remove drafts)
create trigger estimates_keep before delete on public.estimates
  for each row execute function public.block_record_delete();
create trigger invoices_keep before delete on public.invoices
  for each row execute function public.block_record_delete();
create trigger change_orders_keep before delete on public.change_orders
  for each row execute function public.block_record_delete();

-- ---------------------------------------------------------------- frozen lines

-- Checks the document a line comes from as well as the one it goes to.
create or replace function public.block_frozen_lines() returns trigger
language plpgsql set search_path = ''
as $$
declare
  old_parent uuid;
  new_parent uuid;
  frozen boolean;
begin
  if tg_table_name = 'estimate_lines' then
    old_parent := (to_jsonb(old) ->> 'estimate_id')::uuid;
    new_parent := (to_jsonb(new) ->> 'estimate_id')::uuid;
    select exists (select 1 from public.estimates e where e.id in (old_parent, new_parent) and e.sent_at is not null) into frozen;
  else
    old_parent := (to_jsonb(old) ->> 'invoice_id')::uuid;
    new_parent := (to_jsonb(new) ->> 'invoice_id')::uuid;
    select exists (select 1 from public.invoices i where i.id in (old_parent, new_parent) and i.sent_at is not null) into frozen;
  end if;
  if frozen then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------- change orders

create or replace function public.check_change_order() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.signed_at is not null or new.declined_at is not null then
      raise exception 'a change order starts unanswered';
    end if;
    return new;
  end if;
  if old.signed_at is not null or old.declined_at is not null then
    raise exception 'this change order was answered and can''t be changed';
  end if;
  return new;
end;
$$;

drop trigger change_orders_answered on public.change_orders;
create trigger change_orders_answered before insert or update on public.change_orders
  for each row execute function public.check_change_order();

-- ---------------------------------------------------------------- work items

-- Postgres runs triggers by name; the same-business check should come first.
alter trigger work_items_invoiced on public.work_items rename to work_items_locked;

-- ---------------------------------------------------------------- signatures

-- What was signed, built from the saved rows. Sent documents can't change, so the same
-- document (and fingerprint) comes back every time. jsonb text has one fixed form.
create function public.signed_document(p_type text, p_id uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select case p_type
    when 'estimate' then (
      select jsonb_build_object(
        'type', 'estimate', 'id', e.id, 'job_id', e.job_id, 'number', e.number,
        'deposit_on', e.deposit_on, 'deposit_bps', e.deposit_bps, 'scope', e.scope,
        'tax', jsonb_build_object('rate_bps', e.tax_rate_bps, 'labor', e.tax_labor, 'materials', e.tax_materials),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'description', l.description, 'unit', l.unit, 'qty_hundredths', l.qty_hundredths,
            'unit_cents', l.unit_cents, 'kind', l.kind, 'excluded', l.excluded) order by l.position, l.id)
          from public.estimate_lines l where l.estimate_id = e.id), '[]'::jsonb))
      from public.estimates e where e.id = p_id)
    when 'change_order' then (
      select jsonb_build_object(
        'type', 'change_order', 'id', c.id, 'job_id', c.job_id, 'number', c.number,
        'description', c.description, 'amount_cents', c.amount_cents, 'base_cents', c.base_cents)
      from public.change_orders c where c.id = p_id)
  end;
$$;

create function public.document_fingerprint(p_type text, p_id uuid) returns text
language sql stable set search_path = ''
as $$
  select encode(sha256(convert_to(public.signed_document(p_type, p_id)::text, 'UTF8')), 'hex');
$$;

-- True when the document still matches what was signed.
create function public.signature_matches(p_signature_id uuid) returns boolean
language sql stable set search_path = ''
as $$
  select s.document_hash = public.document_fingerprint(s.document_type, s.document_id)
  from public.signatures s where s.id = p_signature_id;
$$;

-- one signature per document, and only on a document that is signed
create unique index signatures_one_per_document on public.signatures (document_type, document_id);

create or replace function public.check_signature() returns trigger
language plpgsql set search_path = ''
as $$
declare
  doc_business uuid;
  doc_signed timestamptz;
begin
  if new.document_type = 'estimate' then
    select business_id, signed_at into doc_business, doc_signed from public.estimates where id = new.document_id;
  else
    select business_id, signed_at into doc_business, doc_signed from public.change_orders where id = new.document_id;
  end if;
  if doc_business is null or doc_business <> new.business_id then
    raise exception 'a signature must belong to a document of the same business';
  end if;
  if doc_signed is null then
    raise exception 'only a signed document gets a signature';
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

-- A document marked signed must have its signature by the end of the same step.
create function public.require_signature() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.signed_at is not null and not exists (
    select 1 from public.signatures s
    where s.document_id = new.id and s.document_type = case tg_table_name when 'estimates' then 'estimate' else 'change_order' end
  ) then
    raise exception 'a signed document needs its signature';
  end if;
  return null;
end;
$$;

create constraint trigger estimates_signature after update of signed_at on public.estimates
  deferrable initially deferred for each row execute function public.require_signature();
create constraint trigger change_orders_signature after update of signed_at on public.change_orders
  deferrable initially deferred for each row execute function public.require_signature();

-- The signer's network address as it reached the server (Cloudflare's header first).
create function public.request_ip() returns text
language sql stable set search_path = ''
as $$
  select nullif(left(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
    trim(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1))
  ), 64), '');
$$;

-- ---------------------------------------------------------------- one-step actions
-- These run as the signed-in owner, so Row Level Security and every check above still apply.

create function public.sign_estimate(p_job_id uuid, p_signer text, p_device text) returns text
language plpgsql set search_path = ''
as $$
declare
  est record;
  fingerprint text;
begin
  update public.estimates set signed_at = now() where job_id = p_job_id returning id, business_id into est;
  if not found then
    raise exception 'The record was not found on the server';
  end if;
  fingerprint := public.document_fingerprint('estimate', est.id);
  insert into public.signatures (business_id, document_type, document_id, signer_name, document_hash, ip, user_agent)
    values (est.business_id, 'estimate', est.id, left(trim(p_signer), 120), fingerprint, public.request_ip(), left(p_device, 200));
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (est.business_id, (select auth.uid()), 'estimate.signed', 'estimate', est.id);
  return fingerprint;
end;
$$;

create function public.sign_change_order(p_id uuid, p_signer text, p_device text) returns text
language plpgsql set search_path = ''
as $$
declare
  co record;
  fingerprint text;
begin
  update public.change_orders set signed_at = now() where id = p_id returning id, business_id into co;
  if not found then
    raise exception 'The record was not found on the server';
  end if;
  fingerprint := public.document_fingerprint('change_order', co.id);
  insert into public.signatures (business_id, document_type, document_id, signer_name, document_hash, ip, user_agent)
    values (co.business_id, 'change_order', co.id, left(trim(p_signer), 120), fingerprint, public.request_ip(), left(p_device, 200));
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (co.business_id, (select auth.uid()), 'change_order.signed', 'change_order', co.id);
  return fingerprint;
end;
$$;

-- The lines exactly as sent, then the frozen copy. Lines left on the draft by an earlier
-- try are replaced, never added to.
create function public.send_invoice(p_invoice_id uuid, p_lines jsonb, p_issued jsonb) returns void
language plpgsql set search_path = ''
as $$
declare
  bid uuid;
begin
  select business_id into bid from public.invoices where id = p_invoice_id;
  if bid is null then
    raise exception 'The record was not found on the server';
  end if;
  delete from public.invoice_lines where invoice_id = p_invoice_id;
  insert into public.invoice_lines (business_id, invoice_id, kind, description, qty_hundredths, unit_cents, unit, position)
    select bid, p_invoice_id, l.kind, l.description, l.qty_hundredths, l.unit_cents, l.unit, (l.n - 1)::integer
    from rows from (jsonb_to_recordset(p_lines) as (kind text, description text, qty_hundredths integer, unit_cents integer, unit text))
      with ordinality as l(kind, description, qty_hundredths, unit_cents, unit, n);
  update public.invoices set
    sent_at = now(),
    summary = left(coalesce(p_issued ->> 'summary', ''), 4000),
    materials_mode = p_issued ->> 'materials_mode',
    show_location = (p_issued ->> 'show_location')::boolean,
    tax_rate_bps = (p_issued ->> 'tax_rate_bps')::integer,
    tax_labor = (p_issued ->> 'tax_labor')::boolean,
    tax_materials = (p_issued ->> 'tax_materials')::boolean,
    issued_scope = nullif(p_issued -> 'issued_scope', 'null'::jsonb),
    excluded_scope = coalesce((select array_agg(x) from jsonb_array_elements_text(p_issued -> 'excluded_scope') x), '{}'),
    due_days = (p_issued ->> 'due_days')::integer,
    issued_on = (p_issued ->> 'issued_on')::date,
    issued_address = left(p_issued ->> 'issued_address', 300),
    issued_work_order = left(p_issued ->> 'issued_work_order', 60)
  where id = p_invoice_id;
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (bid, (select auth.uid()), 'invoice.sent', 'invoice', p_invoice_id);
end;
$$;

-- Paid in cash, marked by the owner: the paid time and the payment together.
create function public.mark_invoice_paid(p_invoice_id uuid, p_amount_cents integer) returns void
language plpgsql set search_path = ''
as $$
declare
  bid uuid;
begin
  update public.invoices set paid_at = now() where id = p_invoice_id returning business_id into bid;
  if bid is null then
    raise exception 'The record was not found on the server';
  end if;
  if p_amount_cents > 0 then
    insert into public.payments (business_id, invoice_id, amount_cents, method) values (bid, p_invoice_id, p_amount_cents, 'cash');
  end if;
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (bid, (select auth.uid()), 'invoice.paid', 'invoice', p_invoice_id);
end;
$$;

revoke execute on function public.sign_estimate(uuid, text, text), public.sign_change_order(uuid, text, text),
  public.send_invoice(uuid, jsonb, jsonb), public.mark_invoice_paid(uuid, integer),
  public.signature_matches(uuid), public.document_fingerprint(text, uuid), public.signed_document(text, uuid)
  from public, anon;
grant execute on function public.sign_estimate(uuid, text, text), public.sign_change_order(uuid, text, text),
  public.send_invoice(uuid, jsonb, jsonb), public.mark_invoice_paid(uuid, integer),
  public.signature_matches(uuid), public.document_fingerprint(text, uuid), public.signed_document(text, uuid)
  to authenticated;

-- ---------------------------------------------------------------- AI: a limit for all of KILN

-- Sign-up is open, so one person with many accounts could otherwise get 300 requests a day
-- for each. Once all businesses together reach 2,000 today, requests wait for tomorrow.
create or replace function public.use_ai_quota() returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  bid uuid;
  used integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  select m.business_id into bid from public.business_members m
    where m.user_id = (select auth.uid()) order by m.created_at limit 1;
  if bid is null then
    raise exception 'this account has no business yet';
  end if;
  insert into public.ai_usage as u (business_id, day, requests) values (bid, current_date, 1)
    on conflict (business_id, day) do update set requests = u.requests + 1
    returning u.requests into used;
  if used > 300 then
    -- its own code, so the Edge Function can tell "over the limit" from other errors
    raise exception 'daily AI limit reached' using errcode = 'KL429';
  end if;
  if (select sum(requests) from public.ai_usage where day = current_date) > 2000 then
    raise exception 'KILN''s daily AI limit reached' using errcode = 'KL429';
  end if;
  return bid;
end;
$$;
