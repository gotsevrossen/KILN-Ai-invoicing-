-- KILN chat for crew: crew may chat, only about their assigned jobs; the server learns that from the database.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select plan(8);

insert into auth.users(id,email) values
 ('c1111111-1111-1111-1111-11111111111a','chat-owner@team.test'),
 ('c1111111-1111-1111-1111-11111111111c','chat-crew@team.test');
insert into public.businesses(id,name) values ('c2222222-2222-2222-2222-22222222222a','Chat Co');
insert into public.business_members(business_id,user_id,role) values
 ('c2222222-2222-2222-2222-22222222222a','c1111111-1111-1111-1111-11111111111a','owner'),
 ('c2222222-2222-2222-2222-22222222222a','c1111111-1111-1111-1111-11111111111c','crew');
insert into public.customers(id,business_id,name) values('c3333333-3333-3333-3333-33333333333a','c2222222-2222-2222-2222-22222222222a','Lee');
insert into public.jobs(id,business_id,customer_id,title) values
 ('c4444444-4444-4444-4444-44444444444a','c2222222-2222-2222-2222-22222222222a','c3333333-3333-3333-3333-33333333333a','Assigned'),
 ('c4444444-4444-4444-4444-44444444444b','c2222222-2222-2222-2222-22222222222a','c3333333-3333-3333-3333-33333333333a','Other');
insert into public.team_job_assignments(business_id,user_id,job_id) values
 ('c2222222-2222-2222-2222-22222222222a','c1111111-1111-1111-1111-11111111111c','c4444444-4444-4444-4444-44444444444a');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;

select pg_temp.as_user('c1111111-1111-1111-1111-11111111111c');
select lives_ok($$select public.use_ai_quota_for('assistant')$$,'crew may use the KILN chat');
select throws_ok($$select public.use_ai_quota_for('scope')$$,'42501',null,'crew still can''t use other AI tasks');
select is(public.ai_chat_scope()->>'role','crew','the chat knows a crew member is crew');
select is(public.ai_chat_scope()->'jobIds','["c4444444-4444-4444-4444-44444444444a"]'::jsonb,'crew chat covers only their assigned job');
select is(public.ai_chat_scope()->>'prices','false','crew don''t see prices unless the owner allows it');

select pg_temp.as_user('c1111111-1111-1111-1111-11111111111a');
select is(public.ai_chat_scope()->>'role','owner','owners are owners');
select ok(public.ai_chat_scope()->'jobIds' = 'null'::jsonb,'owners may ask about every job');

select set_config('request.jwt.claims',json_build_object('sub','c1111111-1111-1111-1111-1111111111ff','role','authenticated')::text,true);
select throws_ok($$select public.ai_chat_scope()$$,'42501',null,'someone outside the business gets nothing');

select * from finish();
rollback;
