-- The email OTP exchange is tested by the Edge contract; SQL additionally denies
-- client acceptance, binds invitations to verified Auth email, and enforces helper scope.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select plan(30);
insert into auth.users(id,email,email_confirmed_at) values
 ('81111111-1111-1111-1111-11111111111a','team-owner@example.test',now()),
 ('81111111-1111-1111-1111-11111111111b','team-helper@example.test',now()),
 ('81111111-1111-1111-1111-11111111111c','team-wrong@example.test',now()),
 ('81111111-1111-1111-1111-11111111111d','team-helper@example.invalid',null);
insert into public.businesses(id,name) values('82222222-2222-2222-2222-22222222222a','Team A');
insert into public.business_members(business_id,user_id,role) values('82222222-2222-2222-2222-22222222222a','81111111-1111-1111-1111-11111111111a','owner');
insert into public.customers(id,business_id,name,phone) values('83333333-3333-3333-3333-33333333333a','82222222-2222-2222-2222-22222222222a','Customer','5550141234');
insert into public.jobs(id,business_id,customer_id,title,private_note) values
 ('84444444-4444-4444-4444-44444444444a','82222222-2222-2222-2222-22222222222a','83333333-3333-3333-3333-33333333333a','Assigned job','Owner secret'),
 ('84444444-4444-4444-4444-44444444444b','82222222-2222-2222-2222-22222222222a','83333333-3333-3333-3333-33333333333a','Unassigned job','Other secret');
insert into public.operations_workers(id,business_id,name,loaded_rate_cents) values('86666666-6666-6666-6666-66666666666a','82222222-2222-2222-2222-22222222222a','Invited worker',3200);
create function pg_temp.team_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
create temp table team_tokens(token text);
grant select,insert on team_tokens to authenticated;
select pg_temp.team_as('81111111-1111-1111-1111-11111111111a');
select lives_ok($$insert into team_tokens select public.create_team_invite('82222222-2222-2222-2222-22222222222a','86666666-6666-6666-6666-66666666666a',' TEAM-HELPER@example.test ')$$,'owner creates email-bound invitation');
select is(length((select token from team_tokens)),64,'invitation has a long random token');
select is((select email from public.team_invites),'team-helper@example.test','invitation normalizes email');
select isnt((select token_hash from public.team_invites),(select token from team_tokens),'only token hash is stored');
select throws_ok($$select public.accept_team_invite((select token from team_tokens),'81111111-1111-1111-1111-11111111111b')$$,'42501',null,'client cannot bypass fresh email OTP acceptance');
reset role;
select throws_ok($$select public.accept_team_invite((select token from team_tokens),'81111111-1111-1111-1111-11111111111c')$$,'42501',null,'invitation refuses different verified email');
select throws_ok($$select public.accept_team_invite((select token from team_tokens),'81111111-1111-1111-1111-11111111111d')$$,'42501',null,'invitation refuses unverified account');
select lives_ok($$select public.accept_team_invite((select token from team_tokens),'81111111-1111-1111-1111-11111111111b')$$,'trusted email-verified acceptance creates helper');
select lives_ok($$select public.accept_team_invite((select token from team_tokens),'81111111-1111-1111-1111-11111111111b')$$,'same-account acceptance is idempotent');
select pg_temp.team_as('81111111-1111-1111-1111-11111111111a');
select lives_ok($$select public.assign_team_job('82222222-2222-2222-2222-22222222222a','81111111-1111-1111-1111-11111111111b','84444444-4444-4444-4444-44444444444a',true)$$,'owner assigns one job');
select pg_temp.team_as('81111111-1111-1111-1111-11111111111b');
select is((select role from public.business_members),'helper','helper can load their own role');
select is(public.has_membership('82222222-2222-2222-2222-22222222222a'),true,'helper remains a real member');
select is(public.is_member('82222222-2222-2222-2222-22222222222a'),false,'legacy financial boundary does not grant helper ownership');
select is((select count(*)::int from public.jobs),0,'helper cannot read raw jobs with prices or private notes');
select is((select count(*)::int from public.operations_workers),0,'helper cannot read loaded labor rates');
select is((select count(*)::int from public.team_assigned_jobs()),1,'helper sees only assigned job safe projection');
select lives_ok($$update public.businesses set rate_cents=1 where id='82222222-2222-2222-2222-22222222222a'$$,'helper pricing update affects no rows');
-- UPDATE without a visible owner row affects zero rows, rather than raising.
-- The unchanged rate is verified again below in owner context.
select lives_ok($$select public.team_log_hours('85555555-5555-5555-5555-55555555555a','84444444-4444-4444-4444-44444444444a',250,'Own hours')$$,'helper logs own assigned-job hours');
select lives_ok($$select public.team_log_hours('85555555-5555-5555-5555-55555555555a','84444444-4444-4444-4444-44444444444a',250,'Own hours')$$,'stable id retries do not duplicate hours');
select is((select count(*)::int from public.team_my_hours()),1,'helper reads own hours only');
select throws_ok($$select public.team_log_hours('85555555-5555-5555-5555-55555555555b','84444444-4444-4444-4444-44444444444b',100,'Other job')$$,'42501',null,'helper cannot log unassigned job');
select lives_ok($$select public.team_add_note('87777777-7777-7777-7777-77777777777a','84444444-4444-4444-4444-44444444444a','Work completed')$$,'helper captures note for assigned job');
select throws_ok($$select public.use_ai_quota()$$,'P0001',null,'helper cannot call owner AI tasks');
select throws_ok($$select public.assign_team_job('82222222-2222-2222-2222-22222222222a','81111111-1111-1111-1111-11111111111b','84444444-4444-4444-4444-44444444444b',true)$$,'42501',null,'helper cannot assign own additional jobs');
select pg_temp.team_as('81111111-1111-1111-1111-11111111111a');
select is((select loaded_rate_cents from public.operations_labor_costs where time_entry_id='85555555-5555-5555-5555-55555555555a'),3200,'helper hours snapshot loaded cost for owner');
select is((select rate_cents from public.businesses),8500,'helper could not change customer selling rate');
select lives_ok($$select public.remove_team_member('82222222-2222-2222-2222-22222222222a','81111111-1111-1111-1111-11111111111b')$$,'owner revokes helper membership');
select is((select count(*)::int from public.time_entries where worker_user_id='81111111-1111-1111-1111-11111111111b'),1,'past attributed hours remain after access removal');
select pg_temp.team_as('81111111-1111-1111-1111-11111111111b');
select is((select count(*)::int from public.team_assigned_jobs()),0,'revoked helper loses job access immediately');
select throws_ok($$select public.team_add_note('87777777-7777-7777-7777-77777777777b','84444444-4444-4444-4444-44444444444a','After revoke')$$,'42501',null,'revoked helper cannot capture new evidence');
select * from finish();
rollback;
