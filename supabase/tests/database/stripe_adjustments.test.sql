begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select no_plan();

insert into public.businesses(id,name,email,address,alternative_methods,auto_save_documents)
values ('9a000000-0000-0000-0000-000000000001','Stripe adjustment fixture','office@example.test','1 Main Street','{"cash":""}',true);
insert into public.customers(id,business_id,name)
values ('9a000000-0000-0000-0000-000000000002','9a000000-0000-0000-0000-000000000001','Customer');
insert into public.jobs(id,business_id,customer_id,title)
values ('9a000000-0000-0000-0000-000000000003','9a000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000002','Fixture site');
insert into public.invoices(id,business_id,job_id,number)
values ('9a000000-0000-0000-0000-000000000004','9a000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000003','I-ADJUST');
insert into public.invoice_lines(business_id,invoice_id,description,kind,qty_hundredths,unit_cents)
values ('9a000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000004','Fixture work','labor',100,5000);
update public.invoices set sent_at=now()-interval '40 days',tax_rate_bps=0,tax_labor=false,tax_materials=false,issued_on=current_date-40,due_days=0 where number='I-ADJUST';
update public.invoices set paid_at=now()-interval '35 days' where number='I-ADJUST';
insert into public.stripe_accounts(account_id,business_id,test_mode)
values ('acct_adjustments','9a000000-0000-0000-0000-000000000001',true);
insert into public.payments(business_id,invoice_id,job_id,amount_cents,method,status,stripe_payment_intent)
values ('9a000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000004','9a000000-0000-0000-0000-000000000003',5000,'card','succeeded','pi_adjustments');

select ok(not has_function_privilege('authenticated','public.reconcile_stripe_adjustment(text,boolean,text,text,text,integer,text,bigint)','execute'),'clients cannot record Stripe adjustments');
select ok(not has_function_privilege('authenticated','public.scheduled_jobs_due_for_removal()','execute'),'clients cannot list all businesses for cleanup');
select ok(public.reconcile_stripe_adjustment('acct_adjustments',true,'pi_adjustments','du_fixture','dispute',4000,'pending',100),'open dispute is recorded');
select ok(not public.job_removal_due('9a000000-0000-0000-0000-000000000003'),'open dispute keeps a paid job out of cleanup');
select ok(public.reconcile_stripe_adjustment('acct_adjustments',true,'pi_adjustments','du_fixture','dispute',4000,'closed',200),'won dispute resolves the hold');
select ok(public.job_removal_due('9a000000-0000-0000-0000-000000000003'),'a resolved dispute leaves the paid date intact');
select ok(public.reconcile_stripe_adjustment('acct_adjustments',true,'pi_adjustments','re_fixture','refund',1500,'debit',300),'partial refund reconciles');
select ok(public.reconcile_stripe_adjustment('acct_adjustments',true,'pi_adjustments','re_fixture','refund',1500,'debit',300),'duplicate event is safe');
select is((select sum(amount_cents)::integer from public.payments where job_id='9a000000-0000-0000-0000-000000000003'),3500,'the partial refund reduces the balance exactly once');
select ok((select paid_at is null from public.invoices where number='I-ADJUST'),'refund reopens the invoice balance');
select is((select amount_cents from public.payments where stripe_payment_intent='pi_adjustments'),5000,'original Stripe amount remains intact');
select ok(public.reconcile_stripe_adjustment('acct_adjustments',true,'pi_adjustments','du_chargeback','dispute',4000,'debit',400),'lost dispute is recorded');
select is((select sum(amount_cents)::integer from public.payments where job_id='9a000000-0000-0000-0000-000000000003'),0,'refund and chargeback cannot debit more than the original receipt');
select public.save_job_documents('9a000000-0000-0000-0000-000000000003');
select is((select snapshot#>>'{business,email}' from public.saved_documents where number='I-ADJUST'),'office@example.test','archive keeps business email');
select is((select snapshot#>>'{business,address}' from public.saved_documents where number='I-ADJUST'),'1 Main Street','archive keeps the business address');

insert into public.jobs(id,business_id,customer_id,title)
values ('9a000000-0000-0000-0000-000000000005','9a000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000002','Archived site');
insert into public.invoices(id,business_id,job_id,number)
values ('9a000000-0000-0000-0000-000000000006','9a000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000005','I-ARCHIVE-ADJUST');
insert into public.invoice_lines(business_id,invoice_id,description,kind,qty_hundredths,unit_cents)
values ('9a000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000006','Fixture work','labor',100,5000);
insert into public.photos(id,business_id,job_id,storage_path,tag)
values ('9a000000-0000-0000-0000-000000000007','9a000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000005',
  '9a000000-0000-0000-0000-000000000001/9a000000-0000-0000-0000-000000000005/9a000000-0000-0000-0000-000000000007.jpg','after');
update public.invoices set sent_at=now()-interval '40 days',tax_rate_bps=0,tax_labor=false,tax_materials=false,issued_on=current_date-40,due_days=0 where number='I-ARCHIVE-ADJUST';
update public.invoices set paid_at=now()-interval '35 days' where number='I-ARCHIVE-ADJUST';
insert into public.payments(business_id,invoice_id,job_id,amount_cents,method,status,stripe_payment_intent)
values ('9a000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000006','9a000000-0000-0000-0000-000000000005',5000,'card','succeeded','pi_archiveadjustments');
select is((select public.scheduled_jobs_due_for_removal()),'9a000000-0000-0000-0000-000000000005'::uuid,'scheduled and Home cleanup use the same eligibility rules');
select lives_ok($$select public.purge_job_and_queue_files('9a000000-0000-0000-0000-000000000005')$$,'paid job is archived by cleanup');
select ok(exists(select 1 from public.job_cleanup_files where bucket='job-photos'
  and path='9a000000-0000-0000-0000-000000000001/9a000000-0000-0000-0000-000000000005/9a000000-0000-0000-0000-000000000007.jpg'),
  'storage removal survives the database purge');
select ok(public.reconcile_stripe_adjustment('acct_adjustments',true,'pi_archiveadjustments','re_archived','refund',1000,'debit',500),'refund reconciles after the job is archived');
select is((select sum((item->>'amountCents')::integer)::integer from public.saved_documents d
  cross join lateral jsonb_array_elements(d.snapshot->'payments') item where d.number='I-ARCHIVE-ADJUST'),4000,'archived receipt reflects the refund');
select * from finish();
rollback;
