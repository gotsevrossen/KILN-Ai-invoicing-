-- Team roles: owner, manager, crew member, pending and outsider, for each kind of access.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select plan(53);

insert into auth.users(id,email) values
 ('91111111-1111-1111-1111-11111111111a','owner@team.test'),
 ('91111111-1111-1111-1111-11111111111b','manager@team.test'),
 ('91111111-1111-1111-1111-11111111111c','crew@team.test'),
 ('91111111-1111-1111-1111-11111111111d','late@team.test'),
 ('91111111-1111-1111-1111-11111111111e','outsider@team.test');
insert into public.businesses(id,name) values
 ('92222222-2222-2222-2222-22222222222a','Team A'),
 ('92222222-2222-2222-2222-22222222222b','Other B');
insert into public.business_members(business_id,user_id,role) values
 ('92222222-2222-2222-2222-22222222222a','91111111-1111-1111-1111-11111111111a','owner'),
 ('92222222-2222-2222-2222-22222222222b','91111111-1111-1111-1111-11111111111e','owner');
insert into public.customers(id,business_id,name,phone) values('93333333-3333-3333-3333-33333333333a','92222222-2222-2222-2222-22222222222a','Lee','5550141234');
insert into public.jobs(id,business_id,customer_id,title,private_note) values
 ('94444444-4444-4444-4444-44444444444a','92222222-2222-2222-2222-22222222222a','93333333-3333-3333-3333-33333333333a','Assigned job','Gate code 1234'),
 ('94444444-4444-4444-4444-44444444444b','92222222-2222-2222-2222-22222222222a','93333333-3333-3333-3333-33333333333a','Other job','');
insert into public.price_list_items(id,business_id,catalog_id,name,unit,unit_cents) values
 ('95555555-5555-5555-5555-55555555555a','92222222-2222-2222-2222-22222222222a','haul','Haul away and cleanup','flat',15000),
 ('95555555-5555-5555-5555-55555555555b','92222222-2222-2222-2222-22222222222a','outlet','Outlet','each',null);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
create temp table codes(kind text, code text);
grant select,insert on codes to authenticated;

-- invites
select pg_temp.as_user('91111111-1111-1111-1111-11111111111a');
select lives_ok($$insert into codes select 'manager', public.create_team_invite('92222222-2222-2222-2222-22222222222a','Maria','manager')$$,'owner invites a manager');
select matches((select code from codes where kind='manager'),'^KILN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$','invite code is short and readable');
select lives_ok($$insert into codes select 'crew', public.create_team_invite('92222222-2222-2222-2222-22222222222a','Carlos','crew')$$,'owner invites a crew member');
select isnt((select token_hash from public.team_invites where name='Carlos'),(select code from codes where kind='crew'),'only the code''s hash is stored');

-- manager joins and waits
select pg_temp.as_user('91111111-1111-1111-1111-11111111111b');
select is(public.request_to_join((select code from codes where kind='manager')),'Team A','joining names the business');
select is((select status from public.team_me()),'pending','joiner waits for approval');
select is(public.is_manager('92222222-2222-2222-2222-22222222222a'),false,'pending manager has no access yet');
select is((select count(*)::int from public.jobs),0,'pending manager sees no jobs');
select throws_ok($$select public.approve_member('92222222-2222-2222-2222-22222222222a','91111111-1111-1111-1111-11111111111b')$$,'42501',null,'nobody approves themselves');
select pg_temp.as_user('91111111-1111-1111-1111-11111111111a');
select lives_ok($$select public.approve_member('92222222-2222-2222-2222-22222222222a','91111111-1111-1111-1111-11111111111b')$$,'owner approves the manager');

-- manager access
select pg_temp.as_user('91111111-1111-1111-1111-11111111111b');
select is(public.is_manager('92222222-2222-2222-2222-22222222222a'),true,'approved manager runs the business');
select is((select count(*)::int from public.jobs),2,'manager sees every job');
select lives_ok($$update public.businesses set rate_cents=1 where id='92222222-2222-2222-2222-22222222222a'$$,'manager business-settings update changes nothing');
select is((select count(*)::int from public.operations_workers),0,'manager can''t see pay rates by default');
select throws_ok($$select public.create_team_invite('92222222-2222-2222-2222-22222222222a','Boss','manager')$$,'42501',null,'only the owner invites managers');
select lives_ok($$update public.price_list_items set unit_cents=9000 where id='95555555-5555-5555-5555-55555555555b'$$,'manager changes a price');
select throws_ok($$select public.change_member_role('92222222-2222-2222-2222-22222222222a','91111111-1111-1111-1111-11111111111b','crew')$$,'42501',null,'manager can''t change roles');

-- crew joins with a messy-typed code and is approved by the manager
select pg_temp.as_user('91111111-1111-1111-1111-11111111111c');
select lives_ok($$select public.request_to_join(lower(replace((select code from codes where kind='crew'),'-',' ')))$$,'code works with spaces and lower case');
select pg_temp.as_user('91111111-1111-1111-1111-11111111111d');
select throws_ok($$select public.request_to_join((select code from codes where kind='crew'))$$,'42501',null,'a used code can''t be used again');
select pg_temp.as_user('91111111-1111-1111-1111-11111111111b');
select lives_ok($$select public.approve_member('92222222-2222-2222-2222-22222222222a','91111111-1111-1111-1111-11111111111c')$$,'manager approves crew');
select lives_ok($$select public.assign_team_job('92222222-2222-2222-2222-22222222222a','91111111-1111-1111-1111-11111111111c','94444444-4444-4444-4444-44444444444a',true)$$,'manager assigns a job');
select is((select count(*)::int from public.team_members('92222222-2222-2222-2222-22222222222a')),3,'manager sees the team list');

-- crew access
select pg_temp.as_user('91111111-1111-1111-1111-11111111111c');
select is((select count(*)::int from public.jobs),0,'crew read no business tables directly');
select is((select count(*)::int from public.customers),0,'crew can''t list customers');
select is((select count(*)::int from public.price_list_items),0,'crew can''t read raw prices');
select is((select count(*)::int from public.team_assigned_jobs()),1,'crew see only their assigned job');
select is(public.team_job('94444444-4444-4444-4444-44444444444a')->'job'->>'private_note','Gate code 1234','crew see the job''s internal note');
select throws_ok($$select public.team_job('94444444-4444-4444-4444-44444444444b')$$,'42501',null,'crew can''t open other jobs');
select is((select count(*)::int from public.team_price_list() where unit_cents is not null),0,'prices hidden from crew by default');
select lives_ok($$select public.team_add_work('96666666-6666-6666-6666-66666666666a','94444444-4444-4444-4444-44444444444a','95555555-5555-5555-5555-55555555555a',300)$$,'crew add work from the price list');
select throws_ok($$select public.team_add_work('96666666-6666-6666-6666-66666666666b','94444444-4444-4444-4444-44444444444b','95555555-5555-5555-5555-55555555555a',100)$$,'42501',null,'crew can''t add work to other jobs');
select lives_ok($$select public.team_add_price_item('97777777-7777-7777-7777-77777777777a','Gate latch','each',2500)$$,'crew add a price list item');
select lives_ok($$update public.price_list_items set unit_cents=1 where id='95555555-5555-5555-5555-55555555555a'$$,'crew price change affects nothing');
select lives_ok($$select public.team_suggest_change('98888888-8888-8888-8888-88888888888a','94444444-4444-4444-4444-44444444444a','Customer wants a second outlet')$$,'crew suggest a change');
select lives_ok($$select public.team_log_hours('99999999-9999-9999-9999-99999999999a','94444444-4444-4444-4444-44444444444a',150,'')$$,'crew log hours');
select lives_ok($$select public.team_remove_mine('hours','99999999-9999-9999-9999-99999999999a')$$,'crew remove their own hours');
select throws_ok($$select public.use_ai_quota()$$,'P0001',null,'crew don''t use the AI quota');
select throws_ok($$select public.create_team_invite('92222222-2222-2222-2222-22222222222a','Friend','crew')$$,'42501',null,'crew can''t invite');
select throws_ok($$select public.assign_team_job('92222222-2222-2222-2222-22222222222a','91111111-1111-1111-1111-11111111111c','94444444-4444-4444-4444-44444444444b',true)$$,'42501',null,'crew can''t assign themselves');

-- the owner sees who added what
select pg_temp.as_user('91111111-1111-1111-1111-11111111111a');
select is((select qty_hundredths from public.work_items where id='96666666-6666-6666-6666-66666666666a'),100,'haul away is always one');
select is((select created_by from public.work_items where id='96666666-6666-6666-6666-66666666666a'),'91111111-1111-1111-1111-11111111111c'::uuid,'work records the crew member who added it');
select is((select needs_review from public.price_list_items where id='97777777-7777-7777-7777-77777777777a'),true,'crew price item waits for review');
select is((select unit_cents from public.price_list_items where id='95555555-5555-5555-5555-55555555555a'),15000,'crew could not change a price');
select is((select rate_cents from public.businesses where id='92222222-2222-2222-2222-22222222222a'),8500,'manager could not change business settings');
select lives_ok($$insert into public.notes(id,business_id,job_id,body,created_by) values ('9aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','92222222-2222-2222-2222-22222222222a','94444444-4444-4444-4444-44444444444a','Owner note','91111111-1111-1111-1111-11111111111c')$$,'owner adds a note');
select is((select created_by from public.notes where id='9aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),'91111111-1111-1111-1111-11111111111a'::uuid,'the app can''t pretend someone else added it');
update public.businesses set crew_sees_prices=true where id='92222222-2222-2222-2222-22222222222a';
select pg_temp.as_user('91111111-1111-1111-1111-11111111111c');
select is((public.team_job('94444444-4444-4444-4444-44444444444a')->'work'->0->>'unit_cents')::int,15000,'crew see prices when the owner allows it');

-- outsider
select pg_temp.as_user('91111111-1111-1111-1111-11111111111e');
select throws_ok($$select public.team_members('92222222-2222-2222-2222-22222222222a')$$,'42501',null,'another business can''t see the team');
select throws_ok($$select public.remove_member('92222222-2222-2222-2222-22222222222a','91111111-1111-1111-1111-11111111111c')$$,'42501',null,'another business can''t remove anyone');

-- removing and leaving
select pg_temp.as_user('91111111-1111-1111-1111-11111111111b');
select lives_ok($$select public.remove_member('92222222-2222-2222-2222-22222222222a','91111111-1111-1111-1111-11111111111c')$$,'manager removes a crew member');
select pg_temp.as_user('91111111-1111-1111-1111-11111111111c');
select is((select count(*)::int from public.team_assigned_jobs()),0,'removed crew lose access at once');
select pg_temp.as_user('91111111-1111-1111-1111-11111111111b');
select lives_ok($$select public.leave_team()$$,'manager leaves the team');
select pg_temp.as_user('91111111-1111-1111-1111-11111111111a');
select throws_ok($$select public.leave_team()$$,'42501',null,'the owner can''t leave their own business');

select * from finish();
rollback;
