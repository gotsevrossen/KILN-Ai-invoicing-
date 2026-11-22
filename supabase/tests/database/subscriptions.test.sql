-- Subscriptions: who can read and write the plan, what a business without access can still do,
-- and team size against the plan. Enforcement is switched on inside this test only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('f1111111-1111-1111-1111-11111111111a','sub-owner@team.test'),
 ('f1111111-1111-1111-1111-11111111111b','sub-manager@team.test'),
 ('f1111111-1111-1111-1111-11111111111c','sub-crew1@team.test'),
 ('f1111111-1111-1111-1111-11111111111d','sub-crew2@team.test'),
 ('f1111111-1111-1111-1111-11111111111e','sub-late-manager@team.test');
insert into public.businesses(id,name) values ('f2222222-2222-2222-2222-22222222222a','Sub Co');
insert into public.business_members(business_id,user_id,role,status,approved_at) values
 ('f2222222-2222-2222-2222-22222222222a','f1111111-1111-1111-1111-11111111111a','owner','active',now() - interval '30 days'),
 ('f2222222-2222-2222-2222-22222222222a','f1111111-1111-1111-1111-11111111111b','manager','active',now() - interval '20 days'),
 ('f2222222-2222-2222-2222-22222222222a','f1111111-1111-1111-1111-11111111111c','crew','active',now() - interval '10 days');
insert into public.business_members(business_id,user_id,role,status) values
 ('f2222222-2222-2222-2222-22222222222a','f1111111-1111-1111-1111-11111111111d','crew','pending');
insert into public.customers(id,business_id,name) values ('f3333333-3333-3333-3333-33333333333a','f2222222-2222-2222-2222-22222222222a','Lee');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
create function pg_temp.new_job(title text) returns void language sql as $$
 insert into public.jobs(business_id,customer_id,title) values ('f2222222-2222-2222-2222-22222222222a','f3333333-3333-3333-3333-33333333333a',title);
$$;

-- switched off (as deployed): a business with no plan works as before
select pg_temp.as_user('f1111111-1111-1111-1111-11111111111a');
select lives_ok($$select pg_temp.new_job('Before the paywall')$$,'with the paywall off, nothing changes');
select is((public.my_subscription()->>'hasAccess')::boolean,true,'with the paywall off, everyone has access');
select is((public.my_subscription()->>'teamSize')::int,3,'the team size counts active people only');

-- nobody in the app can write a plan
select throws_ok($$insert into public.business_subscriptions(business_id,status) values ('f2222222-2222-2222-2222-22222222222a','comped')$$,'42501',null,'the app can''t give itself a plan');
select throws_ok($$select public.save_business_subscription('f2222222-2222-2222-2222-22222222222a','active','apple','kiln_team_7_plus',now() + interval '1 month')$$,
 '42501',null,'only the server can save a plan');
select throws_ok($$select public.subscriptions_enforced()$$,'42501',null,'the switch is internal');

-- switch it on for the rest of this test
reset role;
create or replace function public.subscriptions_enforced() returns boolean language sql stable set search_path = '' as $$ select true $$;

select pg_temp.as_user('f1111111-1111-1111-1111-11111111111a');
select is((public.my_subscription()->>'hasAccess')::boolean,false,'a business that never subscribed has no access');
select throws_ok($$select pg_temp.new_job('Blocked')$$,'KL402','subscription_needed','without a plan, new jobs are refused');
select is((select count(*)::int from public.jobs where business_id='f2222222-2222-2222-2222-22222222222a'),1,'without a plan, jobs can still be read');
select throws_ok($$select public.use_ai_quota_for('scope')$$,'KL402','subscription_needed','without a plan, AI is refused');
select throws_ok($$select public.approve_member('f2222222-2222-2222-2222-22222222222a','f1111111-1111-1111-1111-11111111111d')$$,
 'KL402','subscription_needed','without a plan, nobody new is approved');

-- the server saves a trial on the 1-3 plan
reset role;
select public.save_business_subscription('f2222222-2222-2222-2222-22222222222a','trial','apple','kiln_team_1_3',now() + interval '14 days');
select pg_temp.as_user('f1111111-1111-1111-1111-11111111111a');
select is(public.my_subscription()->>'status','trial','the trial is saved');
select is((public.my_subscription()->>'teamLimit')::int,3,'the 1-3 plan covers 3 people');
select lives_ok($$select pg_temp.new_job('In the trial')$$,'during the trial, new jobs work');
select throws_ok($$select public.approve_member('f2222222-2222-2222-2222-22222222222a','f1111111-1111-1111-1111-11111111111d')$$,
 'KL403','plan_full','a 1-3 plan can''t approve a 4th person');

-- upgrading lets them in
reset role;
select public.save_business_subscription('f2222222-2222-2222-2222-22222222222a','active','google','kiln_team_4_6:monthly',now() + interval '1 month');
select pg_temp.as_user('f1111111-1111-1111-1111-11111111111a');
select is((public.my_subscription()->>'teamLimit')::int,6,'a Google Play 4-6 product covers 6');
select lives_ok($$select public.approve_member('f2222222-2222-2222-2222-22222222222a','f1111111-1111-1111-1111-11111111111d')$$,'after upgrading, the 4th person is approved');

-- downgrading with 4 people: the owner keeps working, the newest person goes read only after 7 days
reset role;
select public.save_business_subscription('f2222222-2222-2222-2222-22222222222a','active','apple','kiln_team_1_3_yearly',now() + interval '1 year');
select isnt((select over_limit_since from public.business_subscriptions where business_id='f2222222-2222-2222-2222-22222222222a'),null,'a team bigger than its plan is noticed');
insert into public.business_members(business_id,user_id,role,status,approved_at) values
 ('f2222222-2222-2222-2222-22222222222a','f1111111-1111-1111-1111-11111111111e','manager','active',now());
select pg_temp.as_user('f1111111-1111-1111-1111-11111111111e');
select lives_ok($$select pg_temp.new_job('Within the 7 days')$$,'for 7 days, everyone still works');
reset role;
update public.business_subscriptions set over_limit_since = now() - interval '8 days' where business_id='f2222222-2222-2222-2222-22222222222a';
select pg_temp.as_user('f1111111-1111-1111-1111-11111111111e');
select throws_ok($$select pg_temp.new_job('Over the plan')$$,'KL402','subscription_needed','after 7 days, the newest person beyond the plan is read only');
select is((public.my_subscription()->>'canWrite')::boolean,false,'the app knows that person is read only');
select pg_temp.as_user('f1111111-1111-1111-1111-11111111111a');
select lives_ok($$select pg_temp.new_job('Owner keeps working')$$,'the owner is never cut off by team size');
select pg_temp.as_user('f1111111-1111-1111-1111-11111111111b');
select lives_ok($$select pg_temp.new_job('Earlier manager')$$,'people approved earlier stay within the plan');

-- removing people clears it
reset role;
delete from public.business_members where business_id='f2222222-2222-2222-2222-22222222222a'
  and user_id in ('f1111111-1111-1111-1111-11111111111d','f1111111-1111-1111-1111-11111111111e');
select is((select over_limit_since from public.business_subscriptions where business_id='f2222222-2222-2222-2222-22222222222a'),null,'a team that fits again is clear');

-- lapsed: read only, but payments and customer-side work go on
select public.save_business_subscription('f2222222-2222-2222-2222-22222222222a','expired','apple','kiln_team_1_3',now() - interval '2 days');
select pg_temp.as_user('f1111111-1111-1111-1111-11111111111a');
select throws_ok($$select pg_temp.new_job('Lapsed')$$,'KL402','subscription_needed','a lapsed business can''t add new work');
select is((select count(*)::int from public.jobs where business_id='f2222222-2222-2222-2222-22222222222a'),5,'a lapsed business still sees all its jobs');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok($$select pg_temp.new_job('Server work')$$,'server functions and customer links are never blocked');

-- crew can see their plan through my_subscription but not read the table
select pg_temp.as_user('f1111111-1111-1111-1111-11111111111c');
select is((select count(*)::int from public.business_subscriptions),0,'crew can''t read the plan row');
select is(public.my_subscription()->>'status','expired','crew see whether the business is subscribed');

-- testers' free access isn't taken away by a store report without a purchase
reset role;
insert into public.businesses(id,name) values ('f2222222-2222-2222-2222-22222222222b','Tester Co');
insert into public.business_subscriptions(business_id,status,store) values ('f2222222-2222-2222-2222-22222222222b','comped','kiln');
select public.save_business_subscription('f2222222-2222-2222-2222-22222222222b','expired',null,null,null);
select is((select status from public.business_subscriptions where business_id='f2222222-2222-2222-2222-22222222222b'),'comped','a tester stays free');
select public.save_business_subscription('f2222222-2222-2222-2222-22222222222b','active','apple','kiln_team_7_plus',now() + interval '1 month');
select is((select team_limit from public.business_subscriptions where business_id='f2222222-2222-2222-2222-22222222222b'),null,'a real purchase replaces it; 7+ has no size limit');
select throws_ok($$select public.save_business_subscription('f9999999-9999-9999-9999-999999999999','active','apple','kiln_team_1_3',now())$$,
 'P0002','unknown business','a plan can''t be saved for a business that doesn''t exist');

select * from finish();
rollback;
