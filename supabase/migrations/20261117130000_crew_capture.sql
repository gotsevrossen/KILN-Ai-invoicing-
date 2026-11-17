-- Crew Capture: the same Receipt, Voice, Photo and Note buttons owners have, on assigned jobs only.
-- Receipts need KILN to read the photo and check every item is for work, so crew get those two
-- AI tasks (counted in the business's daily limit) and nothing else.

-- The AI function asks this with the task's name. Owners and managers may use every task.
create function public.use_ai_quota_for(p_task text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  bid uuid;
  member_role text;
  used integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  select m.business_id, m.role into bid, member_role from public.business_members m
    where m.user_id = (select auth.uid()) and m.status = 'active'
    order by m.created_at limit 1;
  if bid is null then
    raise exception 'this account has no business yet';
  end if;
  if member_role = 'crew' and coalesce(p_task, '') not in ('receipt', 'receiptReview') then
    raise exception using errcode = '42501', message = 'not allowed for crew';
  end if;
  insert into public.ai_usage as u (business_id, day, requests) values (bid, current_date, 1)
    on conflict (business_id, day) do update set requests = u.requests + 1
    returning u.requests into used;
  if used > 300 then
    raise exception 'daily AI limit reached' using errcode = 'KL429';
  end if;
  if (select sum(requests) from public.ai_usage where day = current_date) > 2000 then
    raise exception 'KILN''s daily AI limit reached' using errcode = 'KL429';
  end if;
  return bid;
end;
$$;

-- A receipt a crew member typed or scanned for one assigned job: every item goes to that job,
-- like a receipt typed in from a job page. Stable ids make a retry after a dropped connection safe.
create function public.team_add_receipt(p_id uuid, p_job uuid, p_store text, p_number text, p_date date, p_tax_cents integer, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare bid uuid; item jsonb; line integer := 0; item_id uuid; total bigint := 0; begin
  if not public.team_job_is_open(p_job) then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '23514', message = 'invalid receipt';
  end if;
  if length(btrim(coalesce(p_store, ''))) not between 1 and 120 or length(coalesce(p_number, '')) > 60
    or p_date is null or p_date > current_date + 1 or p_tax_cents is null or p_tax_cents not between 0 and 100000000
    or jsonb_array_length(p_items) not between 1 and 200 then
    raise exception using errcode = '23514', message = 'invalid receipt';
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item->'cost_cents') is distinct from 'number' or jsonb_typeof(item->'name') is distinct from 'string' then
      raise exception using errcode = '23514', message = 'invalid receipt item';
    end if;
    if (item->>'cost_cents')::numeric not between 0 and 100000000
      or (item->>'cost_cents')::numeric <> trunc((item->>'cost_cents')::numeric)
      or length(btrim(coalesce(item->>'name', ''))) not between 1 and 160
      or coalesce(item->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = '23514', message = 'invalid receipt item';
    end if;
    total := total + (item->>'cost_cents')::integer;
  end loop;
  if total + p_tax_cents > 2147483647 then
    raise exception using errcode = '23514', message = 'receipt total too large';
  end if;
  select business_id into bid from public.jobs where id = p_job;
  if exists(select 1 from public.receipts where id = p_id) then
    if not exists(select 1 from public.receipts r where r.id = p_id and r.business_id = bid
      and r.created_by = (select auth.uid()) and r.store = btrim(p_store) and r.receipt_number = coalesce(p_number, '')
      and r.purchased_on = p_date and r.tax_cents = p_tax_cents
      and (select jsonb_agg(jsonb_build_object('name', ri.name, 'cost_cents', ri.cost_cents) order by ri.line)
        from public.receipt_items ri where ri.receipt_id = r.id)
        = (select jsonb_agg(jsonb_build_object('name', btrim(x.value->>'name'), 'cost_cents', (x.value->>'cost_cents')::integer) order by x.n)
          from jsonb_array_elements(p_items) with ordinality x(value,n))
      and not exists(select 1 from public.receipt_items ri where ri.receipt_id = r.id and
        not exists(select 1 from public.receipt_item_jobs rj where rj.receipt_item_id = ri.id and rj.job_id = p_job))) then
      raise exception using errcode = '23514', message = 'receipt retry differs from saved receipt';
    end if;
    return p_id;
  end if;
  insert into public.receipts (id, business_id, store, receipt_number, purchased_on, tax_cents, total_cents, status)
    values (p_id, bid, btrim(p_store), coalesce(p_number, ''), p_date, p_tax_cents, total + p_tax_cents, 'ready');
  for item in select * from jsonb_array_elements(p_items) loop
    line := line + 1;
    item_id := (item->>'id')::uuid;
    insert into public.receipt_items (id, business_id, receipt_id, line, name, qty_label, cost_cents, assignment)
      values (item_id, bid, p_id, line, btrim(item->>'name'), '', (item->>'cost_cents')::integer, 'jobs');
    insert into public.receipt_item_jobs (receipt_item_id, job_id, business_id) values (item_id, p_job, bid);
  end loop;
  return p_id;
end $$;

-- The crew job page also lists receipts on the job (amounts only when crew may see prices).
create or replace function public.team_job(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare j record; prices boolean; begin
  if not public.team_can_work(p_job) then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  select jb.id, jb.title, jb.address, coalesce(jb.private_note, '') as private_note, jb.business_id,
    c.name as customer_name, c.phone as customer_phone, c.lang as customer_lang
    into j from public.jobs jb join public.customers c on c.id = jb.customer_id where jb.id = p_job;
  select b.crew_sees_prices into prices from public.businesses b where b.id = j.business_id;
  return jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'title', j.title, 'address', j.address, 'private_note', j.private_note,
      'customer_name', j.customer_name, 'customer_phone', j.customer_phone, 'customer_lang', j.customer_lang,
      'is_open', public.team_job_is_open(p_job), 'prices', prices),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', m.name)), '[]'::jsonb)
      from public.business_members m where m.business_id = j.business_id and m.status = 'active'),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'storage_path', p.storage_path, 'tag', p.tag,
      'taken_at', p.taken_at, 'created_by', p.created_by) order by p.taken_at desc), '[]'::jsonb) from public.photos p where p.job_id = p_job),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at,
      'created_by', n.created_by) order by n.created_at desc), '[]'::jsonb) from public.notes n where n.job_id = p_job),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'worked_on', t.worked_on, 'hundredths', t.hundredths,
      'note', t.note, 'created_by', t.created_by) order by t.created_at desc), '[]'::jsonb) from public.time_entries t where t.job_id = p_job),
    'work', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'description', w.description, 'unit', w.unit,
      'qty_hundredths', w.qty_hundredths, 'unit_cents', case when prices then w.unit_cents end, 'kind', w.kind,
      'created_by', w.created_by, 'created_at', w.created_at) order by w.created_at desc), '[]'::jsonb) from public.work_items w where w.job_id = p_job),
    'receipts', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'store', r.store, 'purchased_on', r.purchased_on,
      'items', (select count(*) from public.receipt_items ri join public.receipt_item_jobs rj on rj.receipt_item_id = ri.id
        where ri.receipt_id = r.id and rj.job_id = p_job),
      'created_by', r.created_by) order by r.created_at desc), '[]'::jsonb)
      from public.receipts r where exists(select 1 from public.receipt_items ri join public.receipt_item_jobs rj on rj.receipt_item_id = ri.id
        where ri.receipt_id = r.id and rj.job_id = p_job)),
    'changes', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'description', r.description, 'status', r.status,
      'created_by', r.created_by, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb) from public.change_requests r where r.job_id = p_job),
    'estimate', (select jsonb_build_object('number', e.number, 'sent', e.sent_at is not null, 'signed', e.signed_at is not null,
      'scope', e.scope, 'lines', (select coalesce(jsonb_agg(jsonb_build_object('description', l.description, 'unit', l.unit,
        'qty_hundredths', l.qty_hundredths, 'unit_cents', case when prices then l.unit_cents end, 'excluded', l.excluded)
        order by l.position), '[]'::jsonb) from public.estimate_lines l where l.estimate_id = e.id))
      from public.estimates e where e.job_id = p_job),
    'invoice', (select jsonb_build_object('number', i.number, 'sent', i.sent_at is not null, 'paid', i.paid_at is not null,
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('description', l.description, 'kind', l.kind,
        'qty_hundredths', l.qty_hundredths, 'unit_cents', case when prices then l.unit_cents end) order by l.position), '[]'::jsonb)
        from public.invoice_lines l where l.invoice_id = i.id))
      from public.invoices i where i.job_id = p_job));
end $$;

-- Receipt uploads count as team activity too.
create or replace function public.team_members(p_business uuid)
returns table(user_id uuid, name text, email text, role text, status text, joined_at timestamptz, last_active timestamptz, open_jobs integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_manager(p_business) then raise exception using errcode = '42501', message = 'managers only'; end if;
  return query
  select m.user_id, coalesce(nullif(m.name, ''), u.email::text), u.email::text, m.role, m.status, m.created_at,
    greatest(
      (select max(x.created_at) from public.photos x where x.business_id = p_business and x.created_by = m.user_id),
      (select max(x.created_at) from public.notes x where x.business_id = p_business and x.created_by = m.user_id),
      (select max(x.created_at) from public.time_entries x where x.business_id = p_business and x.created_by = m.user_id),
      (select max(x.created_at) from public.work_items x where x.business_id = p_business and x.created_by = m.user_id),
      (select max(x.created_at) from public.receipts x where x.business_id = p_business and x.created_by = m.user_id)),
    (select count(*)::int from public.team_job_assignments a where a.business_id = p_business and a.user_id = m.user_id
      and not exists(select 1 from public.invoices i where i.job_id = a.job_id and i.paid_at is not null))
  from public.business_members m join auth.users u on u.id = m.user_id
  where m.business_id = p_business
  order by (m.role = 'owner') desc, (m.status = 'pending') desc, m.created_at;
end $$;

revoke all on function public.use_ai_quota_for(text), public.team_add_receipt(uuid, uuid, text, text, date, integer, jsonb) from public, anon;
grant execute on function public.use_ai_quota_for(text), public.team_add_receipt(uuid, uuid, text, text, date, integer, jsonb) to authenticated;
