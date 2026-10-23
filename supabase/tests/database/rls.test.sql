-- Permission rules: a business only ever sees and changes its own data.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

-- two owners, each with their own business
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.create_business('A Plumbing', '', '{plumbing}', 'hourly', 9500) $$, 'owner A can create a business');
select throws_ok($$ select public.create_business('A again', '', '{}', 'flat', 0) $$, 'P0001', 'this account already has a business', 'one business per account');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ select public.create_business('B Drywall', '', '{drywall}', 'flat', 0) $$, 'owner B can create a business');

-- remember the two business ids (read as the database owner)
reset role;
create temp table ids as
  select
    (select business_id from public.business_members where user_id = '00000000-0000-0000-0000-00000000000a') as a,
    (select business_id from public.business_members where user_id = '00000000-0000-0000-0000-00000000000b') as b;
grant select on ids to authenticated;

-- B adds a customer
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into public.customers (business_id, name) select b, 'B customer' from ids $$, 'B can add a customer to its own business');

-- A works in its own business
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.customers (business_id, name) select a, 'A customer' from ids $$, 'A can add a customer to its own business');
select is((select count(*)::int from public.businesses), 1, 'A sees only its own business');
select is((select count(*)::int from public.customers), 1, 'A sees only its own customers');
select is((select name from public.customers), 'A customer', 'the one customer A sees is its own');

-- A can't reach into B's business
select throws_ok($$ insert into public.customers (business_id, name) select b, 'sneaky' from ids $$, '42501', null, 'A cannot add a customer to B''s business');
select lives_ok($$ update public.customers set name = 'changed' where business_id = (select b from ids) $$, 'updating B''s rows runs but touches nothing');
select lives_ok($$ delete from public.customers where business_id = (select b from ids) $$, 'deleting B''s rows runs but touches nothing');

-- a job in A's business can't point at B's customer
select lives_ok(
  $$ insert into public.jobs (business_id, customer_id, title)
     select ids.a, c.id, 'cross-business job' from ids, public.customers c where c.business_id = ids.b $$,
  'A''s insert finds none of B''s customers to attach a job to');
select is((select count(*)::int from public.jobs), 0, 'no cross-business job was created');
-- even the database owner (no row security) is stopped by the same-business check
reset role;
select throws_ok(
  $$ insert into public.jobs (business_id, customer_id, title)
     select ids.a, c.id, 'cross-business job' from ids, public.customers c where c.business_id = ids.b $$,
  'P0001', 'customers must belong to the same business', 'a job and its customer must be in the same business');

-- B's data is untouched
select is((select name from public.customers where business_id = (select b from ids)), 'B customer', 'B''s customer was not changed or deleted');

-- an estimate: drafts can be unfinished, sending needs every included line priced,
-- and a sent estimate can't be edited
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.jobs (business_id, customer_id, title)
  select ids.a, c.id, 'Leak repair' from ids, public.customers c where c.business_id = ids.a;
select throws_ok(
  $$ insert into public.estimates (business_id, job_id, number, sent_at) select ids.a, j.id, 'E-0', now() from ids, public.jobs j $$,
  'P0001', 'an estimate starts as a draft', 'an estimate can''t be created already sent');
insert into public.estimates (business_id, job_id, number) select ids.a, j.id, 'E-1' from ids, public.jobs j;
select lives_ok(
  $$ insert into public.estimate_lines (business_id, estimate_id, description, unit, qty_hundredths, unit_cents)
     select business_id, id, '', 'hour', 0, null from public.estimates $$,
  'a draft line can be blank while the owner types');
select throws_ok(
  $$ update public.estimates set sent_at = now(), tax_rate_bps = 0, tax_labor = false, tax_materials = false $$,
  'P0001', 'price or exclude every included line before sending', 'an unpriced estimate can''t be sent');
update public.estimate_lines set description = 'Labor', qty_hundredths = 200, unit_cents = 9500;
select lives_ok(
  $$ update public.estimates set sent_at = now(), tax_rate_bps = 0, tax_labor = false, tax_materials = false $$,
  'a priced estimate can be sent');
select throws_ok($$ update public.estimate_lines set unit_cents = 1 $$, 'P0001', 'this document is signed or sent and can''t be changed', 'sent estimate lines are frozen');
select throws_ok(
  $$ insert into public.estimate_lines (business_id, estimate_id, description, unit, qty_hundredths, unit_cents)
     select business_id, id, 'Extra', 'flat', 100, 100 from public.estimates $$,
  'P0001', 'this document is signed or sent and can''t be changed', 'no lines can be added to a sent estimate');
select throws_ok($$ update public.estimates set deposit_bps = 1 $$, 'P0001', 'this document is signed or sent and can''t be changed', 'a sent estimate''s deposit can''t change');
select lives_ok($$ update public.estimates set signed_at = now() $$, 'a sent estimate can be signed');
select throws_ok($$ update public.estimates set signed_at = null $$, 'P0001', 'this document is signed or sent and can''t be changed', 'a signature time can''t be undone');

-- signatures: same business only, and never changed or removed
select throws_ok(
  $$ insert into public.signatures (business_id, document_type, document_id, signer_name, document_hash)
     select b, 'estimate', (select id from public.estimates), 'Pat Doe', repeat('a', 64) from ids $$,
  'P0001', 'a signature must belong to a document of the same business', 'A can''t file a signature under B''s business');
select lives_ok(
  $$ insert into public.signatures (business_id, document_type, document_id, signer_name, document_hash)
     select a, 'estimate', (select id from public.estimates), 'Pat Doe', repeat('a', 64) from ids $$,
  'A records the customer''s signature');
select throws_ok(
  $$ insert into public.signatures (business_id, document_type, document_id, signer_name, document_hash)
     select a, 'estimate', (select id from public.estimates), 'Pat Doe', 'not-a-hash' from ids $$,
  'P0001', 'a signature needs the SHA-256 of the signed document', 'a signature needs the document''s fingerprint');
select lives_ok($$ update public.signatures set signer_name = 'Someone else' $$, 'editing a signature runs but touches nothing');
select lives_ok($$ delete from public.signatures $$, 'deleting a signature runs but touches nothing');
select is((select signer_name from public.signatures), 'Pat Doe', 'the signature is unchanged');

-- a change order, once answered, can't change
insert into public.change_orders (business_id, job_id, number, description, amount_cents, base_cents)
  select ids.a, j.id, 1, 'Replace shutoff valve', 4500, 19000 from ids, public.jobs j;
update public.change_orders set signed_at = now();
select throws_ok($$ update public.change_orders set amount_cents = 1 $$, 'P0001', 'this change order was answered and can''t be changed', 'a signed change order is frozen');

-- work done, typed in on the job
select lives_ok(
  $$ insert into public.work_items (business_id, job_id, description, unit, qty_hundredths, unit_cents)
     select business_id, id, 'Replaced shutoff valve', 'each', 100, 8500 from public.jobs $$,
  'A adds work done to its job');
select throws_ok(
  $$ insert into public.work_items (business_id, job_id, description, qty_hundredths, unit_cents)
     select business_id, id, '  ', 100, 8500 from public.jobs $$,
  '23514', null, 'work done needs a description');

-- an invoice: lines before sending, frozen once sent, paid only after sending
insert into public.invoices (business_id, job_id, number) select ids.a, j.id, '1001' from ids, public.jobs j;
select throws_ok($$ update public.invoices set paid_at = now() $$, 'P0001', 'only a sent invoice can be marked paid', 'an unsent invoice can''t be marked paid');
select throws_ok(
  $$ update public.invoices set sent_at = now(), tax_rate_bps = 0, tax_labor = false, tax_materials = false, issued_on = current_date, due_days = 15 $$,
  'P0001', 'an invoice needs its lines before it is sent', 'an invoice can''t be sent without lines');
insert into public.invoice_lines (business_id, invoice_id, kind, description, qty_hundredths, unit_cents)
  select business_id, id, 'labor', 'Leak repair', 100, 19000 from public.invoices;
update public.invoices set sent_at = now(), tax_rate_bps = 0, tax_labor = false, tax_materials = false, issued_on = current_date, due_days = 15;
select throws_ok($$ update public.invoice_lines set unit_cents = 1 $$, 'P0001', 'this document is signed or sent and can''t be changed', 'sent invoice lines are frozen');
select throws_ok($$ update public.invoices set summary = 'changed' $$, 'P0001', 'this document is signed or sent and can''t be changed', 'a sent invoice can''t be edited');
select lives_ok($$ update public.invoices set paid_at = now() $$, 'a sent invoice can be marked paid');
select throws_ok(
  $$ insert into public.work_items (business_id, job_id, description, qty_hundredths, unit_cents)
     select business_id, id, 'Late extra', 100, 100 from public.jobs $$,
  'P0001', 'this job''s invoice was sent; its work can''t be changed', 'no work can be added once the job''s invoice is sent');
select throws_ok($$ delete from public.work_items $$, 'P0001', 'this job''s invoice was sent; its work can''t be changed', 'invoiced work can''t be removed');

-- hours, notes, and payments stay inside the business
select lives_ok($$ insert into public.time_entries (business_id, job_id, hundredths) select business_id, id, 250 from public.jobs $$, 'A logs hours on its job');
select lives_ok($$ insert into public.notes (business_id, job_id, body) select business_id, id, 'Gate code 1234' from public.jobs $$, 'A adds a note to its job');
select lives_ok($$ insert into public.payments (business_id, invoice_id, amount_cents, method) select business_id, id, 19000, 'cash' from public.invoices $$, 'A records a payment');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.estimates) + (select count(*)::int from public.invoices) + (select count(*)::int from public.time_entries)
  + (select count(*)::int from public.notes) + (select count(*)::int from public.signatures) + (select count(*)::int from public.payments)
  + (select count(*)::int from public.work_items),
  0, 'B sees none of A''s estimates, invoices, hours, notes, signatures, payments, or work');
reset role;
select throws_ok(
  $$ insert into public.payments (business_id, invoice_id, amount_cents, method) select ids.b, i.id, 100, 'cash' from ids, public.invoices i $$,
  'P0001', 'invoices must belong to the same business', 'a payment can''t point at another business''s invoice');
select throws_ok(
  $$ insert into public.work_items (business_id, job_id, description, qty_hundredths, unit_cents) select ids.b, j.id, 'Sneaky', 100, 100 from ids, public.jobs j $$,
  'P0001', 'jobs must belong to the same business', 'work can''t be filed on another business''s job');

-- a job made by accident can be deleted; one with a sent document is kept
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ delete from public.jobs where title = 'Leak repair' $$, 'P0001', 'a job with a sent or signed document can''t be deleted', 'a job with a sent estimate and invoice can''t be deleted');
insert into public.jobs (business_id, customer_id, title)
  select ids.a, c.id, 'Oops' from ids, public.customers c where c.business_id = ids.a;
insert into public.time_entries (business_id, job_id, hundredths) select business_id, id, 100 from public.jobs where title = 'Oops';
insert into public.work_items (business_id, job_id, description, qty_hundredths, unit_cents) select business_id, id, 'Oops work', 100, 100 from public.jobs where title = 'Oops';
select lives_ok($$ delete from public.jobs where title = 'Oops' $$, 'a fresh job can be deleted, with its hours and work');
select is((select count(*)::int from public.jobs where title = 'Oops'), 0, 'the deleted job is gone');
reset role;

-- the activity log can't be rewritten
reset role;
insert into public.audit_log (business_id, actor, action, entity) select a, '00000000-0000-0000-0000-00000000000a', 'invoice.sent', 'invoice' from ids;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ update public.audit_log set action = 'edited' $$, 'updating the log runs but touches nothing');
select is((select action from public.audit_log), 'invoice.sent', 'the activity log entry is unchanged');

-- photos: a row points only at its own file, only the tag changes, and a sent invoice's photos stay
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.jobs (business_id, customer_id, title)
  select ids.a, c.id, 'Photo job' from ids, public.customers c where c.business_id = ids.a;
select lives_ok(
  $$ insert into public.photos (id, business_id, job_id, storage_path, tag, lat, lng)
     select '00000000-0000-0000-0000-0000000000f1', j.business_id, j.id, j.business_id || '/' || j.id || '/00000000-0000-0000-0000-0000000000f1.jpg', 'before', 40.42, -86.91
     from public.jobs j where j.title = 'Photo job' $$,
  'an owner can save a photo of their own job');
select throws_ok(
  $$ insert into public.photos (id, business_id, job_id, storage_path)
     select '00000000-0000-0000-0000-0000000000f2', j.business_id, j.id, (select b from ids) || '/x/y.jpg'
     from public.jobs j where j.title = 'Photo job' $$,
  '23514', null, 'a photo row can''t point at another business''s files');
select throws_ok(
  $$ insert into public.photos (id, business_id, job_id, storage_path, lat)
     select '00000000-0000-0000-0000-0000000000f3', j.business_id, j.id, j.business_id || '/' || j.id || '/00000000-0000-0000-0000-0000000000f3.jpg', 40
     from public.jobs j where j.title = 'Photo job' $$,
  '23514', null, 'a location needs both latitude and longitude');
select lives_ok($$ update public.photos set tag = 'after' $$, 'the owner can change a photo''s tag');
select throws_ok($$ update public.photos set lat = 0, lng = 0 $$, 'P0001', 'only a photo''s tag can change', 'where a photo was taken can''t be rewritten');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.photos), 0, 'B can''t see A''s photos');
reset role;
insert into public.photos (id, business_id, job_id, storage_path)
  select '00000000-0000-0000-0000-0000000000f4', j.business_id, j.id, j.business_id || '/' || j.id || '/00000000-0000-0000-0000-0000000000f4.jpg'
  from public.jobs j where j.title = 'Leak repair';
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ update public.photos set tag = 'during' where id = '00000000-0000-0000-0000-0000000000f4' $$,
  'P0001', 'this job''s invoice was sent; its photos can''t be changed', 'a sent invoice''s photo tags stay');
select throws_ok($$ delete from public.photos where id = '00000000-0000-0000-0000-0000000000f4' $$,
  'P0001', 'this job''s invoice was sent; its photos can''t be changed', 'a sent invoice''s photos can''t be deleted');
select lives_ok($$ delete from public.photos where id = '00000000-0000-0000-0000-0000000000f1' $$, 'a photo on an open job can be deleted');

-- AI helpers: the owner's switch, and a daily limit only the server function's call can count
select is((select ai_write_scope from public.businesses), false, 'writing customer descriptions is off until the owner turns it on');
select lives_ok($$ update public.businesses set ai_write_scope = true $$, 'the owner can turn it on');
select is((select ai_write_scope from public.businesses), true, 'the switch is saved');
select is(public.use_ai_quota(), (select a from ids), 'an AI request counts toward the caller''s own business');
select is((select requests from public.ai_usage), 1, 'one request counted today');
select lives_ok($$ update public.ai_usage set requests = 0 $$, 'resetting the count runs but touches nothing');
select is((select requests from public.ai_usage), 1, 'the owner can''t reset the count');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.ai_usage), 0, 'B can''t see A''s AI use');
select throws_ok($$ insert into public.ai_usage (business_id, requests) select b, 0 from ids $$, '42501', null, 'counts can''t be written directly');
reset role;
update public.ai_usage set requests = 300;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.use_ai_quota() $$, 'KL429', 'daily AI limit reached', 'the daily limit stops more requests');
reset role;
select is((select requests from public.ai_usage), 300, 'a refused request isn''t counted');
set local role anon;
select throws_ok($$ select public.use_ai_quota() $$, '42501', null, 'signed-out visitors can''t use AI');
reset role;

select * from finish();
rollback;
