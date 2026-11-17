-- Owner-only financial data, tenant integrity, scheduling, frozen internal rates.
-- Run against local migrations: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select plan(24);
insert into auth.users(id, email) values
 ('11111111-1111-1111-1111-11111111111a', 'ops-owner-a@example.test'),
 ('11111111-1111-1111-1111-11111111111b', 'ops-owner-b@example.test'),
 ('11111111-1111-1111-1111-11111111111c', 'ops-helper@example.test');
insert into public.businesses(id, name) values
 ('22222222-2222-2222-2222-22222222222a', 'Operations A'),
 ('22222222-2222-2222-2222-22222222222b', 'Operations B');
insert into public.business_members(business_id,user_id,role) values
 ('22222222-2222-2222-2222-22222222222a','11111111-1111-1111-1111-11111111111a','owner'),
 ('22222222-2222-2222-2222-22222222222b','11111111-1111-1111-1111-11111111111b','owner'),
 ('22222222-2222-2222-2222-22222222222a','11111111-1111-1111-1111-11111111111c','helper');
insert into public.customers(id,business_id,name) values
 ('33333333-3333-3333-3333-33333333333a','22222222-2222-2222-2222-22222222222a','A'),
 ('33333333-3333-3333-3333-33333333333b','22222222-2222-2222-2222-22222222222b','B');
insert into public.jobs(id,business_id,customer_id,title) values
 ('44444444-4444-4444-4444-44444444444a','22222222-2222-2222-2222-22222222222a','33333333-3333-3333-3333-33333333333a','A job'),
 ('44444444-4444-4444-4444-44444444444b','22222222-2222-2222-2222-22222222222b','33333333-3333-3333-3333-33333333333b','B job');
insert into public.time_entries(id,business_id,job_id,hundredths) values
 ('55555555-5555-5555-5555-55555555555a','22222222-2222-2222-2222-22222222222a','44444444-4444-4444-4444-44444444444a',200),
 ('55555555-5555-5555-5555-55555555555b','22222222-2222-2222-2222-22222222222b','44444444-4444-4444-4444-44444444444b',100);
insert into public.operations_workers(id,business_id,name,loaded_rate_cents) values
 ('66666666-6666-6666-6666-66666666666a','22222222-2222-2222-2222-22222222222a','A worker',3200),
 ('66666666-6666-6666-6666-66666666666b','22222222-2222-2222-2222-22222222222b','B worker',4000);
create function pg_temp.ops_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true), set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.ops_as('11111111-1111-1111-1111-11111111111a');
select is((select count(*)::int from public.operations_workers),1,'owner sees own workers only');
select lives_ok($$insert into public.operations_budgets(job_id,business_id,labor_cents) values ('44444444-4444-4444-4444-44444444444a','22222222-2222-2222-2222-22222222222a',10000)$$,'owner saves budget');
select lives_ok($$insert into public.operations_labor_costs(time_entry_id,business_id,worker_id,loaded_rate_cents) values ('55555555-5555-5555-5555-55555555555a','22222222-2222-2222-2222-22222222222a','66666666-6666-6666-6666-66666666666a',1)$$,'owner attributes hours');
select is((select loaded_rate_cents from public.operations_labor_costs),3200,'server takes actual loaded rate instead of client guess');
select lives_ok($$update public.operations_workers set loaded_rate_cents=5000 where id='66666666-6666-6666-6666-66666666666a'$$,'owner changes future loaded rate');
select is((select loaded_rate_cents from public.operations_labor_costs),3200,'historical cost unchanged after rate change');
select lives_ok($$update public.operations_labor_costs set loaded_rate_cents=5 where time_entry_id='55555555-5555-5555-5555-55555555555a'$$,'same worker attribution update succeeds');
select is((select loaded_rate_cents from public.operations_labor_costs),3200,'same worker update preserves snapshot');
select throws_ok($$insert into public.operations_labor_costs(time_entry_id,business_id,worker_id,loaded_rate_cents) values ('55555555-5555-5555-5555-55555555555b','22222222-2222-2222-2222-22222222222a','66666666-6666-6666-6666-66666666666a',1)$$,'23503',null,'cannot attach another business time entry');
select lives_ok($$insert into public.operations_visits(business_id,job_id,worker_id,starts_at,ends_at) values ('22222222-2222-2222-2222-22222222222a','44444444-4444-4444-4444-44444444444a','66666666-6666-6666-6666-66666666666a','2026-11-20 09:00Z','2026-11-20 10:00Z')$$,'owner plans visit');
select throws_ok($$insert into public.operations_visits(business_id,job_id,worker_id,starts_at,ends_at) values ('22222222-2222-2222-2222-22222222222a','44444444-4444-4444-4444-44444444444a','66666666-6666-6666-6666-66666666666a','2026-11-20 09:30Z','2026-11-20 10:30Z')$$,'23P01',null,'overlap blocked');
select lives_ok($$insert into public.operations_visits(business_id,job_id,worker_id,starts_at,ends_at) values ('22222222-2222-2222-2222-22222222222a','44444444-4444-4444-4444-44444444444a','66666666-6666-6666-6666-66666666666a','2026-11-20 10:00Z','2026-11-20 11:00Z')$$,'adjacent visits allowed');
select throws_ok($$insert into public.operations_visits(business_id,job_id,worker_id,starts_at,ends_at) values ('22222222-2222-2222-2222-22222222222a','44444444-4444-4444-4444-44444444444a','66666666-6666-6666-6666-66666666666a','2026-11-20 12:00Z','2026-11-20 11:00Z')$$,'23514',null,'reversed visit rejected');
select throws_ok($$insert into public.operations_visits(business_id,job_id,worker_id,starts_at,ends_at) values ('22222222-2222-2222-2222-22222222222a','44444444-4444-4444-4444-44444444444b','66666666-6666-6666-6666-66666666666a','2026-11-20 12:00Z','2026-11-20 13:00Z')$$,'23503',null,'cross-business job rejected');
select throws_ok($$insert into public.operations_visits(business_id,job_id,worker_id,starts_at,ends_at) values ('22222222-2222-2222-2222-22222222222a','44444444-4444-4444-4444-44444444444a','66666666-6666-6666-6666-66666666666b','2026-11-20 12:00Z','2026-11-20 13:00Z')$$,'23514',null,'cross-business worker rejected');
select pg_temp.ops_as('11111111-1111-1111-1111-11111111111c');
select is((select count(*)::int from public.operations_workers),0,'helper cannot read internal rates');
select is((select count(*)::int from public.operations_labor_costs),0,'helper cannot read cost attributions');
select is((select count(*)::int from public.operations_budgets),0,'helper cannot read budgets');
select is((select count(*)::int from public.operations_visits),0,'owner planning is not exposed to helper logins');
select throws_ok($$insert into public.operations_workers(business_id,name,loaded_rate_cents) values ('22222222-2222-2222-2222-22222222222a','Helper-created',1)$$,'42501',null,'helper cannot write workers');
select pg_temp.ops_as('11111111-1111-1111-1111-11111111111b');
select is((select count(*)::int from public.operations_workers),1,'other owner reads only their own worker');
select throws_ok($$insert into public.operations_workers(business_id,name,loaded_rate_cents) values ('22222222-2222-2222-2222-22222222222a','Other business',1)$$,'42501',null,'other owner cannot insert A workers');
select is((select count(*)::int from public.operations_budgets),0,'other owner cannot read A budget');
set local role anon;
select throws_ok($$select * from public.operations_labor_costs$$,'42501',null,'anonymous cannot read financial data');
select * from finish();
rollback;
