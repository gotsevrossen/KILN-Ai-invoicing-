-- Permission rules: a business only ever sees and changes its own data.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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

-- a signed estimate can't be edited
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.jobs (business_id, customer_id, title)
  select ids.a, c.id, 'Leak repair' from ids, public.customers c where c.business_id = ids.a;
insert into public.estimates (business_id, job_id, number, signed_at)
  select ids.a, j.id, 'E-1', now() from ids, public.jobs j;
reset role;
insert into public.estimate_lines (business_id, estimate_id, description, unit, qty_hundredths, unit_cents)
  select business_id, id, 'Labor', 'hour', 200, 9500 from public.estimates;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ update public.estimate_lines set unit_cents = 1 $$, 'P0001', 'this document is signed or sent and can''t be changed', 'signed estimate lines are frozen');

-- the activity log can't be rewritten
reset role;
insert into public.audit_log (business_id, actor, action, entity) select a, '00000000-0000-0000-0000-00000000000a', 'invoice.sent', 'invoice' from ids;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ update public.audit_log set action = 'edited' $$, 'updating the log runs but touches nothing');
select is((select action from public.audit_log), 'invoice.sent', 'the activity log entry is unchanged');

select * from finish();
rollback;
