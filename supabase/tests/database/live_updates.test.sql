-- Local-only transactional fixtures; no real users, jobs or events survive this test.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select plan(15);

-- Requires today's Realtime partition (the running local service creates it).
-- The isolated validation harness provides a test-only default partition instead.

insert into auth.users(id,email) values
 ('b1111111-1111-1111-1111-11111111111a','live-owner@example.test'),
 ('b1111111-1111-1111-1111-11111111111b','live-crew@example.test'),
 ('b1111111-1111-1111-1111-11111111111c','live-pending@example.test'),
 ('b1111111-1111-1111-1111-11111111111d','live-outsider@example.test');
insert into public.businesses(id,name) values
 ('b2222222-2222-2222-2222-22222222222a','Live A'), ('b2222222-2222-2222-2222-22222222222b','Live B');
insert into public.business_members(business_id,user_id,role,status) values
 ('b2222222-2222-2222-2222-22222222222a','b1111111-1111-1111-1111-11111111111a','owner','active'),
 ('b2222222-2222-2222-2222-22222222222a','b1111111-1111-1111-1111-11111111111b','crew','active'),
 ('b2222222-2222-2222-2222-22222222222a','b1111111-1111-1111-1111-11111111111c','crew','pending'),
 ('b2222222-2222-2222-2222-22222222222b','b1111111-1111-1111-1111-11111111111d','owner','active');

create function pg_temp.as_live_user(uid uuid, channel text) returns void language sql as $$
 select set_config('role','authenticated',true),
   set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true),
   set_config('realtime.topic',channel,true);
$$;

select pg_temp.as_live_user('b1111111-1111-1111-1111-11111111111a','kiln:business:b2222222-2222-2222-2222-22222222222a');
select is((select count(*)::int from realtime.messages),1,'owner receives one business invalidation per transaction');
select ok((select bool_and(private) from realtime.messages),'all updates are private');
select ok((select bool_and(payload - 'id' = '{}'::jsonb) from realtime.messages),'notices expose no receipt, job or price data');
select ok((select bool_and(event = 'changed') from realtime.messages),'notices use the client event');
select throws_ok($$select public.kiln_notify_live('kiln:business:b2222222-2222-2222-2222-22222222222b')$$,
 '42501',null,'clients cannot invoke the privileged notifier');

select pg_temp.as_live_user('b1111111-1111-1111-1111-11111111111b','kiln:business:b2222222-2222-2222-2222-22222222222a');
select is((select count(*)::int from realtime.messages),1,'active crew receive invalidations without broad table access');
select is((select count(*)::int from public.receipts),0,'crew still have no direct receipt read access');
select throws_ok($$insert into realtime.messages(topic,event,extension,payload,private)
 values('kiln:business:b2222222-2222-2222-2222-22222222222a','changed','broadcast','{}',true)$$,
 '42501',null,'crew cannot forge change broadcasts');

select pg_temp.as_live_user('b1111111-1111-1111-1111-11111111111d','kiln:business:b2222222-2222-2222-2222-22222222222a');
select is((select count(*)::int from realtime.messages),0,'another business cannot subscribe to these events');
select pg_temp.as_live_user('b1111111-1111-1111-1111-11111111111c','kiln:business:b2222222-2222-2222-2222-22222222222a');
select is((select count(*)::int from realtime.messages),0,'pending people cannot subscribe to business events');
select set_config('realtime.topic','kiln:user:b1111111-1111-1111-1111-11111111111c',true);
select is((select count(*)::int from realtime.messages),1,'pending people receive their own approval notice');
select set_config('realtime.topic','kiln:user:b1111111-1111-1111-1111-11111111111b',true);
select is((select count(*)::int from realtime.messages),0,'people cannot subscribe to another person''s access notices');

reset role;
select set_config('kiln.live_topics','[]',true);
delete from public.business_members where user_id='b1111111-1111-1111-1111-11111111111b';
select pg_temp.as_live_user('b1111111-1111-1111-1111-11111111111b','kiln:business:b2222222-2222-2222-2222-22222222222a');
select is((select count(*)::int from realtime.messages),0,'removed members lose business subscription access');
select set_config('realtime.topic','kiln:user:b1111111-1111-1111-1111-11111111111b',true);
select is((select count(*)::int from realtime.messages),2,'removed members can hear their own revocation notice');
reset role;
select ok((select count(*) = 2 from pg_trigger where tgname='kiln_live_change' and tgrelid in ('public.receipts'::regclass,'public.team_job_assignments'::regclass)),
 'receipts and job assignments both publish changes');
select * from finish();
rollback;
