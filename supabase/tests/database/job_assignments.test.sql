-- Owners and managers can be assigned jobs by the owner, by a manager, or by themselves.
-- Crew still can't assign anyone, and pending people can't be assigned.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select plan(14);

insert into auth.users(id,email) values
 ('a1111111-1111-1111-1111-11111111111a','owner@assign.test'),
 ('a1111111-1111-1111-1111-11111111111b','manager1@assign.test'),
 ('a1111111-1111-1111-1111-11111111111c','manager2@assign.test'),
 ('a1111111-1111-1111-1111-11111111111d','crew@assign.test'),
 ('a1111111-1111-1111-1111-11111111111e','pending@assign.test');
insert into public.businesses(id,name) values
 ('a2222222-2222-2222-2222-22222222222a','Assign A'),
 ('a2222222-2222-2222-2222-22222222222b','Other B');
insert into public.business_members(business_id,user_id,role,status) values
 ('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111a','owner','active'),
 ('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111b','manager','active'),
 ('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111c','manager','active'),
 ('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111d','crew','active'),
 ('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111e','manager','pending');
insert into public.customers(id,business_id,name) values('a3333333-3333-3333-3333-33333333333a','a2222222-2222-2222-2222-22222222222a','Lee');
insert into public.customers(id,business_id,name) values('a3333333-3333-3333-3333-33333333333b','a2222222-2222-2222-2222-22222222222b','Kim');
insert into public.jobs(id,business_id,customer_id,title) values
 ('a4444444-4444-4444-4444-44444444444a','a2222222-2222-2222-2222-22222222222a','a3333333-3333-3333-3333-33333333333a','Job one'),
 ('a4444444-4444-4444-4444-44444444444b','a2222222-2222-2222-2222-22222222222a','a3333333-3333-3333-3333-33333333333a','Job two'),
 ('a4444444-4444-4444-4444-44444444444c','a2222222-2222-2222-2222-22222222222b','a3333333-3333-3333-3333-33333333333b','Other business job');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
create function pg_temp.assigned(uid uuid, job uuid) returns boolean language sql security definer as $$
 select exists(select 1 from public.team_job_assignments where user_id = uid and job_id = job);
$$;
grant execute on function pg_temp.assigned(uuid, uuid) to authenticated;

-- the owner assigns a manager
select pg_temp.as_user('a1111111-1111-1111-1111-11111111111a');
select lives_ok($$select public.assign_team_job('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111b','a4444444-4444-4444-4444-44444444444a',true)$$,'owner assigns a manager');
select is(pg_temp.assigned('a1111111-1111-1111-1111-11111111111b','a4444444-4444-4444-4444-44444444444a'),true,'the manager is on the job');
select lives_ok($$select public.assign_team_job('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111a','a4444444-4444-4444-4444-44444444444a',true)$$,'owner assigns themselves');
select is(pg_temp.assigned('a1111111-1111-1111-1111-11111111111a','a4444444-4444-4444-4444-44444444444a'),true,'the owner is on the job');
select throws_ok($$select public.assign_team_job('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111e','a4444444-4444-4444-4444-44444444444a',true)$$,'23514',null,'a pending manager can''t be assigned');

-- a manager assigns another manager and themselves
select pg_temp.as_user('a1111111-1111-1111-1111-11111111111b');
select lives_ok($$select public.assign_team_job('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111c','a4444444-4444-4444-4444-44444444444b',true)$$,'manager assigns another manager');
select lives_ok($$select public.assign_team_job('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111b','a4444444-4444-4444-4444-44444444444b',true)$$,'manager assigns themselves');
select lives_ok($$select public.assign_team_job('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111a','a4444444-4444-4444-4444-44444444444b',true)$$,'manager assigns the owner');
select lives_ok($$select public.assign_team_job('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111b','a4444444-4444-4444-4444-44444444444a',false)$$,'manager takes themselves off a job');
select is(pg_temp.assigned('a1111111-1111-1111-1111-11111111111b','a4444444-4444-4444-4444-44444444444a'),false,'the manager is off the job');
select throws_ok($$select public.assign_team_job('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111b','a4444444-4444-4444-4444-44444444444c',true)$$,'23514',null,'no assigning to another business''s job');

-- a manager's assignment doesn't open the crew-only functions
select is(public.team_can_work('a4444444-4444-4444-4444-44444444444b'),false,'manager assignment is not crew access');
select pg_temp.as_user('a1111111-1111-1111-1111-11111111111a');
select is(public.team_can_work('a4444444-4444-4444-4444-44444444444a'),false,'owner assignment is not crew access');

-- crew still can't assign
select pg_temp.as_user('a1111111-1111-1111-1111-11111111111d');
select throws_ok($$select public.assign_team_job('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111b','a4444444-4444-4444-4444-44444444444a',true)$$,'42501',null,'crew can''t assign a manager');

select * from finish();
rollback;
