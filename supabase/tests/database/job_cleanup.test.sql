-- Paid jobs leave 30 days after payment: warning first, documents saved only when asked
-- (or when the owner turned on saving automatically), and nothing else can get past the
-- rules that keep sent documents.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select plan(32);

insert into auth.users(id,email) values
 ('c1111111-1111-1111-1111-11111111111a','owner@cleanup.test'),
 ('c1111111-1111-1111-1111-11111111111b','manager@cleanup.test'),
 ('c1111111-1111-1111-1111-11111111111e','outsider@cleanup.test');
insert into public.businesses(id,name) values
 ('c2222222-2222-2222-2222-22222222222a','Cleanup A'),
 ('c2222222-2222-2222-2222-22222222222b','Other B');
update public.businesses set alternative_methods='{"cash":""}' where id='c2222222-2222-2222-2222-22222222222a';
insert into public.business_members(business_id,user_id,role,status) values
 ('c2222222-2222-2222-2222-22222222222a','c1111111-1111-1111-1111-11111111111a','owner','active'),
 ('c2222222-2222-2222-2222-22222222222a','c1111111-1111-1111-1111-11111111111b','manager','active'),
 ('c2222222-2222-2222-2222-22222222222b','c1111111-1111-1111-1111-11111111111e','owner','active');
insert into public.customers(id,business_id,name,lang) values('c3333333-3333-3333-3333-33333333333a','c2222222-2222-2222-2222-22222222222a','Lee','en');

-- old: paid 31 days ago, with a signed estimate, a sent invoice, a payment, a photo, a note and a receipt item
-- recent: paid 10 days ago; open: not paid; quiet: paid 40 days ago, warned 2 days ago, no choice
insert into public.jobs(id,business_id,customer_id,title) values
 ('c4444444-4444-4444-4444-44444444444a','c2222222-2222-2222-2222-22222222222a','c3333333-3333-3333-3333-33333333333a','Old sink job'),
 ('c4444444-4444-4444-4444-44444444444b','c2222222-2222-2222-2222-22222222222a','c3333333-3333-3333-3333-33333333333a','Recent job'),
 ('c4444444-4444-4444-4444-44444444444c','c2222222-2222-2222-2222-22222222222a','c3333333-3333-3333-3333-33333333333a','Open job'),
 ('c4444444-4444-4444-4444-44444444444d','c2222222-2222-2222-2222-22222222222a','c3333333-3333-3333-3333-33333333333a','Quiet job'),
 ('c4444444-4444-4444-4444-44444444444e','c2222222-2222-2222-2222-22222222222a','c3333333-3333-3333-3333-33333333333a','Auto job');
insert into public.estimates(id,business_id,job_id,number) values('c5555555-5555-5555-5555-55555555555a','c2222222-2222-2222-2222-22222222222a','c4444444-4444-4444-4444-44444444444a','E-1');
insert into public.estimate_lines(business_id,estimate_id,description,unit,qty_hundredths,unit_cents,position,kind)
 values('c2222222-2222-2222-2222-22222222222a','c5555555-5555-5555-5555-55555555555a','Replace trap','each',100,12000,0,'labor');
insert into public.invoices(id,business_id,job_id,number) values
 ('c6666666-6666-6666-6666-66666666666a','c2222222-2222-2222-2222-22222222222a','c4444444-4444-4444-4444-44444444444a','I-1'),
 ('c6666666-6666-6666-6666-66666666666b','c2222222-2222-2222-2222-22222222222a','c4444444-4444-4444-4444-44444444444b','I-2'),
 ('c6666666-6666-6666-6666-66666666666c','c2222222-2222-2222-2222-22222222222a','c4444444-4444-4444-4444-44444444444c','I-3'),
 ('c6666666-6666-6666-6666-66666666666d','c2222222-2222-2222-2222-22222222222a','c4444444-4444-4444-4444-44444444444d','I-4'),
 ('c6666666-6666-6666-6666-66666666666e','c2222222-2222-2222-2222-22222222222a','c4444444-4444-4444-4444-44444444444e','I-5');
insert into public.invoice_lines(business_id,invoice_id,kind,description,qty_hundredths,unit_cents,position)
 select 'c2222222-2222-2222-2222-22222222222a', id::uuid, 'labor', 'Replace trap', 100, 12000, 0
 from unnest(array['c6666666-6666-6666-6666-66666666666a','c6666666-6666-6666-6666-66666666666b','c6666666-6666-6666-6666-66666666666c','c6666666-6666-6666-6666-66666666666d','c6666666-6666-6666-6666-66666666666e']) id;
-- what sending saves
update public.invoices set tax_rate_bps = 0, tax_labor = false, tax_materials = false, issued_on = current_date - 35, due_days = 14;
update public.estimates set tax_rate_bps = 0, tax_labor = false, tax_materials = false;
insert into public.photos(id,business_id,job_id,storage_path) values('c7777777-7777-7777-7777-77777777777a','c2222222-2222-2222-2222-22222222222a','c4444444-4444-4444-4444-44444444444a','c2222222-2222-2222-2222-22222222222a/c4444444-4444-4444-4444-44444444444a/c7777777-7777-7777-7777-77777777777a.jpg');
insert into public.notes(business_id,job_id,body) values('c2222222-2222-2222-2222-22222222222a','c4444444-4444-4444-4444-44444444444a','Gate code 1234');
insert into public.receipts(id,business_id,store) values('c8888888-8888-8888-8888-88888888888a','c2222222-2222-2222-2222-22222222222a','Hardware');
insert into public.receipt_items(id,business_id,receipt_id,line,name,cost_cents) values
 ('c9999999-9999-9999-9999-99999999999a','c2222222-2222-2222-2222-22222222222a','c8888888-8888-8888-8888-88888888888a',1,'P-trap',900),
 ('c9999999-9999-9999-9999-99999999999b','c2222222-2222-2222-2222-22222222222a','c8888888-8888-8888-8888-88888888888a',2,'Tape',300);
insert into public.receipt_item_jobs(receipt_item_id,job_id,business_id,weight) values
 ('c9999999-9999-9999-9999-99999999999a','c4444444-4444-4444-4444-44444444444a','c2222222-2222-2222-2222-22222222222a',1),
 ('c9999999-9999-9999-9999-99999999999b','c4444444-4444-4444-4444-44444444444a','c2222222-2222-2222-2222-22222222222a',1),
 ('c9999999-9999-9999-9999-99999999999b','c4444444-4444-4444-4444-44444444444b','c2222222-2222-2222-2222-22222222222a',1);
update public.estimates set sent_at = now() - interval '60 days', signed_at = now() - interval '59 days' where id='c5555555-5555-5555-5555-55555555555a';
insert into public.signatures(business_id,document_type,document_id,signer_name,document_hash,signature_method)
 values('c2222222-2222-2222-2222-22222222222a','estimate','c5555555-5555-5555-5555-55555555555a','Lee Park',repeat('a',64),'typed_name');
update public.invoices set sent_at = now() - interval '35 days', paid_at = now() - interval '31 days' where id='c6666666-6666-6666-6666-66666666666a';
update public.invoices set sent_at = now() - interval '12 days', paid_at = now() - interval '10 days' where id='c6666666-6666-6666-6666-66666666666b';
update public.invoices set sent_at = now() - interval '12 days' where id='c6666666-6666-6666-6666-66666666666c';
update public.invoices set sent_at = now() - interval '45 days', paid_at = now() - interval '40 days' where id='c6666666-6666-6666-6666-66666666666d';
update public.invoices set sent_at = now() - interval '35 days', paid_at = now() - interval '31 days' where id='c6666666-6666-6666-6666-66666666666e';
update public.jobs set removal_warned_at = now() - interval '2 days' where id='c4444444-4444-4444-4444-44444444444d';
insert into public.payments(business_id,invoice_id,amount_cents,method,paid_at,status)
 values('c2222222-2222-2222-2222-22222222222a','c6666666-6666-6666-6666-66666666666a',12000,'cash',now() - interval '31 days','succeeded');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;

-- the warning
select pg_temp.as_user('c1111111-1111-1111-1111-11111111111a');
select is((select count(*)::int from public.jobs_leaving()),3,'owner is warned about jobs paid 29+ days ago only');
select is((select count(*)::int from public.jobs_leaving() where id='c4444444-4444-4444-4444-44444444444b'),0,'a job paid 10 days ago isn''t leaving');
select is((select count(*)::int from public.jobs_leaving() where id='c4444444-4444-4444-4444-44444444444c'),0,'an unpaid job never leaves');
select is((select array_agg(x) from public.jobs_due_for_removal() x),array['c4444444-4444-4444-4444-44444444444d'::uuid],'a job the owner never saw a warning for waits; one warned 2 days ago is due');
select lives_ok($$select public.see_jobs_leaving(array['c4444444-4444-4444-4444-44444444444a','c4444444-4444-4444-4444-44444444444b']::uuid[])$$,'owner sees the warning');
select isnt((select warned_at from public.jobs_leaving() where id='c4444444-4444-4444-4444-44444444444a'),null,'seeing the warning is recorded');
select ok((select leaves_at from public.jobs_leaving() where id='c4444444-4444-4444-4444-44444444444a') > now() + interval '23 hours','after the warning the owner gets one more day');
select is((select count(*)::int from public.jobs_due_for_removal() x where x='c4444444-4444-4444-4444-44444444444a'),0,'not due during that day');
select throws_ok($$select public.choose_job_documents('c4444444-4444-4444-4444-44444444444b','save')$$,'42501',null,'no choice for a job that isn''t leaving');
select lives_ok($$select public.choose_job_documents('c4444444-4444-4444-4444-44444444444a','save')$$,'owner chooses to save the documents');
select is((select count(*)::int from public.jobs_due_for_removal() x where x='c4444444-4444-4444-4444-44444444444a'),1,'a choice makes it due');

-- the rules that keep sent documents still hold for everyone in the app
select throws_ok($$delete from public.jobs where id='c4444444-4444-4444-4444-44444444444a'$$,'P0001',null,'owner still can''t delete a job with sent documents');
select results_eq($$with d as (delete from public.signatures returning 1) select count(*)::int from d$$,array[0],'owner still can''t delete a signature');
select throws_ok($$select set_config('kiln.purge','on',true); delete from public.invoices where id='c6666666-6666-6666-6666-66666666666a'$$,'P0001',null,'setting the flag from the app doesn''t open the rules');
select throws_ok($$select public.purge_job('c4444444-4444-4444-4444-44444444444a')$$,'42501',null,'the app can''t remove a job itself');

-- other people
select pg_temp.as_user('c1111111-1111-1111-1111-11111111111b');
select is((select count(*)::int from public.jobs_leaving()),0,'managers get no warning');
select throws_ok($$select public.choose_job_documents('c4444444-4444-4444-4444-44444444444a','discard')$$,'42501',null,'managers don''t choose');
select pg_temp.as_user('c1111111-1111-1111-1111-11111111111e');
select is((select count(*)::int from public.jobs_due_for_removal()),0,'another business sees nothing due');

-- the server removes it
reset role;
set local role service_role;
select is((public.purge_job('c4444444-4444-4444-4444-44444444444a')->>'saved')::int,2,'the signed estimate and the paid invoice are saved');
reset role;
select is((select count(*)::int from public.jobs where id='c4444444-4444-4444-4444-44444444444a'),0,'the job is gone');
select is((select count(*)::int from public.notes where job_id='c4444444-4444-4444-4444-44444444444a'),0,'its notes are gone');
select is((select count(*)::int from public.signatures),0,'its signature record is gone');
select is((select count(*)::int from public.payments),0,'its payments are gone');
select is((select array_agg(id order by id) from public.receipt_items),array['c9999999-9999-9999-9999-99999999999b'::uuid],'a receipt item shared with another job stays; one only for this job goes');
select is((select snapshot->'signatures'->0->>'name' from public.saved_documents where document_type='estimate'),'Lee Park','the saved estimate keeps who signed');
select is((select (snapshot->'payments'->0->>'amountCents')::int from public.saved_documents where document_type='invoice'),12000,'the saved invoice keeps its payment');

set local role service_role;
select is((public.purge_job('c4444444-4444-4444-4444-44444444444d')->>'saved')::int,0,'a job nobody chose to save keeps nothing');
select throws_ok($$select public.purge_job('c4444444-4444-4444-4444-44444444444b')$$,'42501',null,'a job that isn''t due can''t be removed');
reset role;

-- saving automatically: no warning, saved anyway
update public.businesses set auto_save_documents = true where id='c2222222-2222-2222-2222-22222222222a';
select pg_temp.as_user('c1111111-1111-1111-1111-11111111111a');
select is((select count(*)::int from public.jobs_leaving()),0,'with automatic saving the owner isn''t warned');
select is((select array_agg(x) from public.jobs_due_for_removal() x),array['c4444444-4444-4444-4444-44444444444e'::uuid],'with automatic saving a job is due without a warning');
reset role;
set local role service_role;
select is((public.purge_job('c4444444-4444-4444-4444-44444444444e')->>'saved')::int,1,'automatic saving keeps its invoice');
reset role;
select pg_temp.as_user('c1111111-1111-1111-1111-11111111111b');
select is((select count(*)::int from public.saved_documents),3,'managers can read saved documents');

select * from finish();
rollback;
