-- Per-person AI limits: each person has a daily cap per AI helper, on top of the business's 300.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select plan(11);

insert into auth.users(id,email) values
 ('e1111111-1111-1111-1111-11111111111a','limit-owner@team.test'),
 ('e1111111-1111-1111-1111-11111111111b','limit-manager@team.test');
insert into public.businesses(id,name) values ('e2222222-2222-2222-2222-22222222222a','Limit Co');
insert into public.business_members(business_id,user_id,role) values
 ('e2222222-2222-2222-2222-22222222222a','e1111111-1111-1111-1111-11111111111a','owner'),
 ('e2222222-2222-2222-2222-22222222222a','e1111111-1111-1111-1111-11111111111b','manager');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;

select pg_temp.as_user('e1111111-1111-1111-1111-11111111111a');
select is(public.use_ai_quota_for('assistant'),'e2222222-2222-2222-2222-22222222222a'::uuid,'a chat message counts for the owner''s business');
select is((select requests from public.ai_person_usage where task = 'assistant'),1,'and for the owner personally');
select throws_ok($$select public.use_ai_quota_for('poem')$$,'22023',null,'only KILN''s own AI helpers can be counted');
select lives_ok($$update public.ai_person_usage set requests = 0$$,'resetting a personal count runs but touches nothing');
select is((select requests from public.ai_person_usage where task = 'assistant'),1,'nobody can reset their own count');
select throws_ok($$insert into public.ai_person_usage(user_id,business_id,task,requests) values ('e1111111-1111-1111-1111-11111111111a','e2222222-2222-2222-2222-22222222222a','scope',0)$$,
 '42501',null,'personal counts can''t be written directly');

-- the owner uses up today's chat
reset role;
update public.ai_person_usage set requests = 60 where task = 'assistant';
select pg_temp.as_user('e1111111-1111-1111-1111-11111111111a');
select throws_ok($$select public.use_ai_quota_for('assistant')$$,'KL430',null,'the chat stops at 60 messages a day per person');
select lives_ok($$select public.use_ai_quota_for('scope')$$,'other AI helpers still work for that person');
reset role;
select is((select requests from public.ai_usage where business_id = 'e2222222-2222-2222-2222-22222222222a'),2,
 'a refused request isn''t counted for the business');

-- a manager on the same team keeps their own chat
select pg_temp.as_user('e1111111-1111-1111-1111-11111111111b');
select lives_ok($$select public.use_ai_quota_for('assistant')$$,'one person''s limit doesn''t stop the rest of the team');
select is((select count(*)::int from public.ai_person_usage),1,'each person sees only their own counts');

select * from finish();
rollback;
