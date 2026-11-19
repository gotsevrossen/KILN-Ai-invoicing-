begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('80000000-0000-0000-0000-000000000001','invoice-owner@example.test'),
 ('80000000-0000-0000-0000-000000000002','invoice-manager@example.test'),
 ('80000000-0000-0000-0000-000000000003','invoice-crew@example.test');
insert into public.businesses(id,name) values ('81000000-0000-0000-0000-000000000001','Invoice business');
insert into public.business_members(business_id,user_id,role,status) values
 ('81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','owner','active'),
 ('81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','manager','active'),
 ('81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000003','crew','active');
insert into public.customers(id,business_id,name) values
 ('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','Customer');
insert into public.jobs(id,business_id,customer_id,title,private_note) values
 ('83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','Site','PRIVATE JOB NOTE');
insert into public.invoices(id,business_id,job_id,number) values
 ('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001','I-ACCEPT');
insert into public.invoice_lines(business_id,invoice_id,description,kind,qty_hundredths,unit_cents) values
 ('81000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001','Completed work','labor',100,5000);

select throws_ok($$update public.invoices set sent_at=now(),tax_rate_bps=0,tax_labor=false,tax_materials=false,issued_on=current_date,due_days=0$$,
 'PT422','alternative_methods_required','invoice issuance needs a configured alternative');
select ok(not public.valid_alternative_methods('{"crypto":"unsupported"}'),'unsupported methods are rejected');
update public.businesses set alternative_methods='{"zelle":"Use the business number","cash":""}' where id='81000000-0000-0000-0000-000000000001';
update public.invoices set sent_at=now(),tax_rate_bps=0,tax_labor=false,tax_materials=false,issued_on=current_date,due_days=0;
update public.businesses set alternative_methods='{"check":""}' where id='81000000-0000-0000-0000-000000000001';
select is((select issued_alternative_methods from public.invoices where number='I-ACCEPT'),'{"cash":"","zelle":"Use the business number"}'::jsonb,'issuance freezes payment methods and instructions');
insert into public.share_links(business_id,document_id,document_type,token_hash,expires_at) values
 ('81000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001','invoice',repeat('a',64),now()+interval '1 day'),
 ('81000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001','invoice',repeat('b',64),now()-interval '1 day');
create function pg_temp.invoice_hash() returns text language sql as $$
 select public.invoice_acceptance_view('84000000-0000-0000-0000-000000000001')->>'hash';
$$;
select ok(not has_function_privilege('authenticated','public.accept_invoice_link(text,text,text,jsonb,text)','execute'),'client cannot bypass the Edge Function');
select throws_ok($$select public.accept_invoice_link(repeat('b',64),pg_temp.invoice_hash(),'Customer','[[[0,0],[1,1]]]','zelle')$$,
 'P0001','invalid invoice link','expired invoice link cannot sign');
select throws_ok($$select public.accept_invoice_link(repeat('a',64),repeat('0',64),'Customer','[[[0,0],[1,1]]]','zelle')$$,
 'P0001','invoice or payment options changed','signature must bind the displayed snapshot');
select throws_ok($$select public.accept_invoice_link(repeat('a',64),pg_temp.invoice_hash(),'Customer','[[[0,0],[1,1]]]','check')$$,
 'P0001','invoice or payment options changed','customer cannot use a method enabled after issuance');
select throws_ok($$select public.accept_invoice_link(repeat('a',64),pg_temp.invoice_hash(),'Customer','[]','zelle')$$,
 'P0001','invalid invoice acceptance','drawn signature is required');
select lives_ok($$select public.accept_invoice_link(repeat('a',64),pg_temp.invoice_hash(),'Customer','[[[0,0],[1,1]]]','zelle')$$,'customer returns signed invoice and selects Zelle');
select lives_ok($$select public.accept_invoice_link(repeat('a',64),pg_temp.invoice_hash(),'Customer','[[[0,0],[1,1]]]','zelle')$$,'same signature can be retried');
select throws_ok($$select public.accept_invoice_link(repeat('a',64),pg_temp.invoice_hash(),'Another Signer','[[[0,0],[1,1]]]','zelle')$$,
 'P0001','invoice already accepted','acceptance cannot be overwritten');
select is((select count(*)::int from public.payments),0,'signing creates no payment');
select ok(not exists(select 1 from public.invoices where paid_at is not null),'signing does not mark invoice paid');
select ok((select snapshot::text not like '%PRIVATE JOB NOTE%' from public.invoice_acceptances),'signed customer copy excludes private job notes');
select public.save_job_documents('83000000-0000-0000-0000-000000000001');
select is((select snapshot #>> '{signatures,0,alternativeMethod}' from public.saved_documents where document_type='invoice'),'zelle','archived invoice keeps the returned signature');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is((select signer_name from public.invoice_acceptances),'Customer','manager can read the customer signature');
select throws_ok($$select public.mark_invoice_alternative_paid('84000000-0000-0000-0000-000000000001',5000,'check')$$,
 'P0001','Choose an invoice payment method','owner or manager must record an issued method');
select lives_ok($$select public.mark_invoice_alternative_paid('84000000-0000-0000-0000-000000000001',5000,'zelle')$$,'manager can confirm an actual Zelle payment');
select is((select alternative_method from public.payments),'zelle','payment ledger records the actual method');
select set_config('request.jwt.claims','{"sub":"80000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.invoice_acceptances),0,'crew cannot read the signature');
reset role;

insert into public.jobs(id,business_id,customer_id,title) values
 ('83000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','Second site'),
 ('83000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','Third site');
insert into public.invoices(id,business_id,job_id,number) values
 ('84000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000002','I-PARTIAL');
insert into public.invoice_lines(business_id,invoice_id,description,kind,qty_hundredths,unit_cents) values
 ('81000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000002','Completed work','labor',100,5000);
insert into public.photos(id,business_id,job_id,storage_path,tag) values
 ('85000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000002',
 '81000000-0000-0000-0000-000000000001/83000000-0000-0000-0000-000000000002/85000000-0000-0000-0000-000000000001.jpg','after');
select throws_ok($$update public.invoices set proof_photo_ids=array['85000000-0000-0000-0000-000000000001']::uuid[] where number='I-ACCEPT'$$,
 'P0001','this document is signed or sent and can''t be changed','issued proof cannot be replaced');
select throws_ok($$update public.invoices set proof_photo_ids=array['85000000-0000-0000-0000-000000000099']::uuid[] where number='I-PARTIAL'$$,
 'P0001','Choose up to 12 before or after photos from this job','only a photo that belongs to the invoice job may be selected');
update public.invoices set sent_at=now(),tax_rate_bps=0,tax_labor=false,tax_materials=false,issued_on=current_date,due_days=7 where number='I-PARTIAL';
select is((select proof_photo_ids from public.invoices where number='I-PARTIAL'),array['85000000-0000-0000-0000-000000000001']::uuid[],
 'issuance freezes the default proof photos');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.record_invoice_alternative_payment('84000000-0000-0000-0000-000000000002',1000,'check','86000000-0000-0000-0000-000000000001')$$,'record a partial check payment');
select lives_ok($$select public.record_invoice_alternative_payment('84000000-0000-0000-0000-000000000002',1000,'check','86000000-0000-0000-0000-000000000001')$$,'retry does not duplicate receipt');
select is((select count(*)::integer from public.payments where invoice_id='84000000-0000-0000-0000-000000000002'),1,'one payment after a retry');
select is((select data->>'paid' from public.billing_export_page('81000000-0000-0000-0000-000000000001','invoice',null) where data->>'number'='I-PARTIAL'),'1000','invoice export includes partial payments');
reset role;

select is((public.reserve_invoice_checkout('84000000-0000-0000-0000-000000000002','card',1500)->>'amount')::integer,1500,'customer reserves a partial card payment');
select throws_ok($$select public.reserve_invoice_checkout('84000000-0000-0000-0000-000000000002','card',2000)$$,'P0001','Use the original payment amount','a retry cannot change the reserved amount');
select is(public.release_unbound_invoice_checkout('84000000-0000-0000-0000-000000000002',gen_random_uuid()),false,'a stale release cannot cancel a new reservation');
select ok(public.release_unbound_invoice_checkout('84000000-0000-0000-0000-000000000002',
  (select attempt_key from public.invoice_payment_reservations where invoice_id='84000000-0000-0000-0000-000000000002')),
  'unbound checkout can be released before a client secret is returned');
select is((public.reserve_invoice_checkout('84000000-0000-0000-0000-000000000002','card',1500)->>'amount')::integer,1500,'customer can retry with a fresh attempt after release');
update public.invoice_payment_reservations set intent_id='pi_partialA12345' where invoice_id='84000000-0000-0000-0000-000000000002';
select is(public.release_unbound_invoice_checkout('84000000-0000-0000-0000-000000000002',
  (select attempt_key from public.invoice_payment_reservations where invoice_id='84000000-0000-0000-0000-000000000002')),
  false,'a bound checkout must be canceled with Stripe first');
select public.record_stripe_payment('81000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000002','pi_partialA12345',1500,'card','succeeded',5000);
select ok((select paid_at is null from public.invoices where number='I-PARTIAL'),'partial settlement leaves the invoice open');
select is((public.reserve_invoice_checkout('84000000-0000-0000-0000-000000000002','wallet',2500)->>'amount')::integer,2500,'next checkout can pay the remaining balance');
update public.invoice_payment_reservations set intent_id='pi_partialB12345' where invoice_id='84000000-0000-0000-0000-000000000002';
select lives_ok($$select public.record_stripe_payment('81000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000002','pi_partialA12345',1500,'card','processing',5000)$$,'late notification does not affect the next reservation');
select public.release_canceled_invoice_payment('84000000-0000-0000-0000-000000000002','pi_partialB12345');
select ok((select canceled_at is not null from public.payments where stripe_payment_intent='pi_partialB12345'),'canceling checkout preserves evidence');
set local role authenticated;
select lives_ok($$select public.record_invoice_alternative_payment('84000000-0000-0000-0000-000000000002',2500,'check','86000000-0000-0000-0000-000000000002')$$,'confirmed cancellation permits an alternate payment');
select ok((select paid_at is not null from public.invoices where number='I-PARTIAL'),'invoice closes after all funds are received');
reset role;

insert into public.change_orders(id,business_id,job_id,number,description,amount_cents,base_cents,sent_at) values
 ('87000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000003',1,'Additional trim',1000,6000,now());
insert into public.share_links(business_id,document_id,document_type,token_hash,expires_at) values
 ('81000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000001','change_order',repeat('c',64),now()+interval '1 day');
select throws_ok($$select public.answer_change_order_link(repeat('c',64),repeat('0',64),'Customer',true)$$,'P0001','Document changed','change order signature binds the reviewed text and amount');
select is((public.answer_change_order_link(repeat('c',64),public.view_change_order_link(repeat('c',64))->>'hash','Customer',true) #>> '{signature,name}'),
 'Customer','remote acceptance saves a customer signature');
select is((public.answer_change_order_link(repeat('c',64),public.view_change_order_link(repeat('c',64))->>'hash',null,false) #>> '{signature,name}'),
 'Customer','a later decline cannot erase the acceptance');

select * from finish();
rollback;
