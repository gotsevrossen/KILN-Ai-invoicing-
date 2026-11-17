-- Crew Capture: receipts on assigned jobs, and crew AI limited to receipt tasks.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select plan(19);

insert into auth.users(id,email) values
 ('a1111111-1111-1111-1111-11111111111a','cap-owner@team.test'),
 ('a1111111-1111-1111-1111-11111111111c','cap-crew@team.test');
insert into public.businesses(id,name) values ('a2222222-2222-2222-2222-22222222222a','Capture Co');
insert into public.business_members(business_id,user_id,role) values
 ('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111a','owner'),
 ('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111c','crew');
insert into public.customers(id,business_id,name) values('a3333333-3333-3333-3333-33333333333a','a2222222-2222-2222-2222-22222222222a','Lee');
insert into public.jobs(id,business_id,customer_id,title) values
 ('a4444444-4444-4444-4444-44444444444a','a2222222-2222-2222-2222-22222222222a','a3333333-3333-3333-3333-33333333333a','Assigned'),
 ('a4444444-4444-4444-4444-44444444444b','a2222222-2222-2222-2222-22222222222a','a3333333-3333-3333-3333-33333333333a','Other');
insert into public.team_job_assignments(business_id,user_id,job_id) values
 ('a2222222-2222-2222-2222-22222222222a','a1111111-1111-1111-1111-11111111111c','a4444444-4444-4444-4444-44444444444a');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;

select pg_temp.as_user('a1111111-1111-1111-1111-11111111111c');
select lives_ok($$select public.team_add_receipt('a5555555-5555-5555-5555-55555555555a','a4444444-4444-4444-4444-44444444444a','Home Depot','',current_date,150,
  '[{"id":"a6666666-6666-6666-6666-66666666666a","name":"PVC elbow","cost_cents":250},{"id":"a6666666-6666-6666-6666-66666666666b","name":"Primer","cost_cents":1000}]'::jsonb)$$,'crew add a receipt to their job');
select lives_ok($$select public.team_add_receipt('a5555555-5555-5555-5555-55555555555a','a4444444-4444-4444-4444-44444444444a','Home Depot','',current_date,150,
  '[{"id":"a6666666-6666-6666-6666-66666666666a","name":"PVC elbow","cost_cents":250},{"id":"a6666666-6666-6666-6666-66666666666b","name":"Primer","cost_cents":1000}]'::jsonb)$$,'retrying the same receipt saves it once');
select throws_ok($$select public.team_add_receipt('a5555555-5555-5555-5555-55555555555b','a4444444-4444-4444-4444-44444444444b','Lowes','',current_date,0,
  '[{"id":"a6666666-6666-6666-6666-66666666666c","name":"Nails","cost_cents":500}]'::jsonb)$$,'42501',null,'crew can''t add a receipt to another job');
select throws_ok($$select public.team_add_receipt('a5555555-5555-5555-5555-55555555555c','a4444444-4444-4444-4444-44444444444a','Lowes','',current_date,0,
  '[{"id":"a6666666-6666-6666-6666-66666666666d","name":"Nails","cost_cents":-5}]'::jsonb)$$,'23514',null,'negative prices are refused');
select throws_ok($$select public.team_add_receipt('a5555555-5555-5555-5555-55555555555c','a4444444-4444-4444-4444-44444444444a','Lowes','',current_date,0,null)$$,
  '23514',null,'null items cannot save an empty receipt');
select throws_ok($$select public.team_add_receipt('a5555555-5555-5555-5555-55555555555c','a4444444-4444-4444-4444-44444444444a','Lowes','',current_date,0,
  '[{"id":"a6666666-6666-6666-6666-66666666666d","name":"Nails"}]'::jsonb)$$,'23514',null,'missing prices are refused');
select throws_ok($$select public.team_add_receipt('a5555555-5555-5555-5555-55555555555a','a4444444-4444-4444-4444-44444444444a','Different store','',current_date,0,
  '[{"id":"a6666666-6666-6666-6666-66666666666d","name":"Different item","cost_cents":500}]'::jsonb)$$,'23514',null,'a changed retry cannot silently claim the original receipt was updated');
select is((select count(*)::int from public.receipts),0,'crew still can''t read receipts directly');
select is(jsonb_array_length(public.team_job('a4444444-4444-4444-4444-44444444444a')->'receipts'),1,'the receipt shows on the crew job page');
select ok(not ((public.team_job('a4444444-4444-4444-4444-44444444444a')->'receipts'->0) ? 'total_cents'),'crew receipt summaries do not expose a whole mixed-job receipt total');
select lives_ok($$select public.use_ai_quota_for('receipt')$$,'crew may have KILN read a receipt');
select lives_ok($$select public.use_ai_quota_for('receiptReview')$$,'crew may have KILN check receipt items');
select throws_ok($$select public.use_ai_quota_for('scope')$$,'42501',null,'crew can''t use other AI tasks');

select pg_temp.as_user('a1111111-1111-1111-1111-11111111111a');
select is((select count(*)::int from public.receipt_item_jobs where job_id='a4444444-4444-4444-4444-44444444444a'),2,'every item went to the job');
select is((select total_cents from public.receipts where id='a5555555-5555-5555-5555-55555555555a'),1400,'total is items plus tax');
select is((select created_by from public.receipts where id='a5555555-5555-5555-5555-55555555555a'),
  'a1111111-1111-1111-1111-11111111111c'::uuid,'receipt records the crew member who added it');
select ok((select last_active is not null from public.team_members('a2222222-2222-2222-2222-22222222222a')
  where user_id='a1111111-1111-1111-1111-11111111111c'),'a receipt updates the crew member activity timestamp');
select is((select count(*)::int from public.receipts),1,'refused and retried receipts never leave partial headers');
select lives_ok($$select public.use_ai_quota_for('scope')$$,'owners use every AI task');

select * from finish();
rollback;
