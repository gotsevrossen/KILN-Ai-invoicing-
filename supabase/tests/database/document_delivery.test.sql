begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public,extensions;
select no_plan();
insert into auth.users(id,email) values('10000000-0000-0000-0000-000000000001','quote-a@example.test'),('10000000-0000-0000-0000-000000000002','quote-b@example.test');
insert into public.businesses(id,name) values('20000000-0000-0000-0000-000000000001','Quote business');
insert into public.business_members(business_id,user_id) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into public.customers(id,business_id,name) values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Homeowner');
insert into public.jobs(id,business_id,customer_id,title,private_note) values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Paint room','PRIVATE DO NOT SHARE'),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Second room',null);
insert into public.estimates(id,business_id,job_id,number) values
 ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','E-Q1'),
 ('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','E-Q2');
insert into public.estimate_lines(business_id,estimate_id,description,unit,qty_hundredths,unit_cents) values
 ('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Paint walls','flat',100,50000),
 ('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','Paint ceiling','flat',100,20000);
create function pg_temp.quote_owner(uid uuid) returns void language sql as $$
  select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.quote_owner('10000000-0000-0000-0000-000000000001');
select throws_ok($$select public.prepare_estimate_access('40000000-0000-0000-0000-000000000001',repeat('a',64))$$,'P0001','not allowed','draft quote cannot get a public link');
update public.estimates set sent_at=now(),tax_rate_bps=0,tax_labor=false,tax_materials=false where business_id='20000000-0000-0000-0000-000000000001';
select lives_ok($$select public.prepare_estimate_access('40000000-0000-0000-0000-000000000001',repeat('a',64))$$,'owner prepares issued quote');
select is((select count(*)::int from public.document_delivery_events where stage='link_prepared'),1,'preparing records link preparation');
select is((select count(*)::int from public.document_delivery_events where stage='owner_confirmed_shared'),0,'preparing never records delivery');
select lives_ok($$select public.record_delivery_event('estimate','50000000-0000-0000-0000-000000000001','share_opened','text')$$,'owner can record composer opened');
select throws_ok($$select public.record_delivery_event('estimate','50000000-0000-0000-0000-000000000001','customer_viewed','text')$$,'P0001','not allowed','owner cannot assert customer view');
select pg_temp.quote_owner('10000000-0000-0000-0000-000000000002');
select throws_ok($$select public.prepare_estimate_access('40000000-0000-0000-0000-000000000001',repeat('b',64))$$,'P0001','not allowed','other owner cannot create link');
select throws_ok($$select public.record_delivery_event('estimate','50000000-0000-0000-0000-000000000001','owner_confirmed_shared','text')$$,'P0001','not allowed','other owner cannot write events');
select is((select count(*)::int from public.estimate_access_links),0,'other account cannot read quote link rows');
reset role;
select ok(not has_function_privilege('anon','public.view_estimate_access(text)','execute'),'anonymous users cannot bypass token-checking function');
select ok(not has_function_privilege('authenticated','public.accept_estimate_access(text,text,text,text,text,text)','execute'),'signed-in users cannot call public acceptance RPC directly');
select ok((public.view_estimate_access(repeat('a',64))->'snapshot')::text not like '%PRIVATE DO NOT SHARE%','public snapshot excludes private notes');
select is((select count(*)::int from public.document_delivery_events where stage='customer_viewed'),1,'first view records a view event');
select public.view_estimate_access(repeat('a',64));
select is((select count(*)::int from public.document_delivery_events where stage='customer_viewed'),1,'repeat views do not duplicate first-open event');
select throws_ok($$select public.accept_estimate_access(repeat('a',64),repeat('0',64),'Home Owner','test device','127.0.0.1','I accept this exact estimate and use my typed name as my electronic signature.')$$,'P0001','not allowed','stale or substituted snapshot hash cannot be accepted');
select throws_ok($$select public.accept_estimate_access(repeat('a',64),(select snapshot_hash from public.estimate_access_links limit 1),'Home Owner','test device','127.0.0.1','')$$,'P0001','not allowed','acceptance requires exact explicit consent');
select lives_ok($$select public.accept_estimate_access(repeat('a',64),(select snapshot_hash from public.estimate_access_links limit 1),'Home Owner','test device','127.0.0.1','I accept this exact estimate and use my typed name as my electronic signature.')$$,'customer accepts exact frozen quote');
select is((select signature_method from public.signatures where document_id='50000000-0000-0000-0000-000000000001'),'typed_name','approval records actual signing method');
select is((select approval_snapshot from public.signatures where document_id='50000000-0000-0000-0000-000000000001'),(select snapshot from public.estimate_access_links limit 1),'approval retains exact snapshot displayed');
select ok((select public.signature_matches(id) from public.signatures where document_id='50000000-0000-0000-0000-000000000001'),'signature document hash matches frozen quote rows');
select is((select count(*)::int from public.payments where business_id='20000000-0000-0000-0000-000000000001'),0,'acceptance never records a payment');
select lives_ok($$select public.accept_estimate_access(repeat('a',64),(select snapshot_hash from public.estimate_access_links limit 1),'Other Name','test device','127.0.0.1','I accept this exact estimate and use my typed name as my electronic signature.')$$,'acceptance retry is idempotent');
select is((select signer_name from public.signatures where document_id='50000000-0000-0000-0000-000000000001'),'Home Owner','retry cannot replace signer');
select throws_ok($$update public.signatures set signer_name='Changed'$$,'P0001','Approval evidence cannot be changed or removed','evidence cannot be edited');
select throws_ok($$delete from public.signatures$$,'P0001','Approval evidence cannot be changed or removed','evidence cannot be removed');
select ok(not has_function_privilege('authenticated','public.deposit_for_estimate_access(text,uuid,text)','execute'),'app cannot invoke customer deposit RPC directly');
select lives_ok($$select public.deposit_for_estimate_access(repeat('a',64),'60000000-0000-0000-0000-000000000001',repeat('d',64))$$,'accepted quote can open exact deposit');
select is((select amount_cents from public.job_payment_requests limit 1),15000,'remote deposit is exactly thirty percent of frozen total');
select is((select count(*)::int from public.payments where business_id='20000000-0000-0000-0000-000000000001'),0,'opening deposit payment never counts as money received');
select lives_ok($$select public.deposit_for_estimate_access(repeat('a',64),'60000000-0000-0000-0000-000000000002',repeat('e',64))$$,'reopening deposit reuses the same request');
select is((select count(*)::int from public.job_payment_requests),1,'reopening never duplicates requested amount');
update public.estimate_access_links set expires_at=now()-interval '1 second' where business_id='20000000-0000-0000-0000-000000000001';
select throws_ok($$select public.view_estimate_access(repeat('a',64))$$,'P0001','not found','expired links cannot view quote');
select throws_ok($$select public.accept_estimate_access(repeat('a',64),(select snapshot_hash from public.estimate_access_links limit 1),'Home Owner','test device','127.0.0.1','I accept this exact estimate and use my typed name as my electronic signature.')$$,'P0001','not allowed','expired links cannot accept quote');
select pg_temp.quote_owner('10000000-0000-0000-0000-000000000001');
select throws_ok($$select public.sign_estimate('40000000-0000-0000-0000-000000000002','Home Owner','test','[]'::jsonb)$$,'P0001','not allowed','on-phone acceptance refuses empty ink');
select lives_ok($$select public.sign_estimate('40000000-0000-0000-0000-000000000002','Home Owner','test','[[[0.1,0.2],[0.3,0.4]]]'::jsonb)$$,'on-phone acceptance persists actual ink atomically');
select is((select ink from public.signatures where document_id='50000000-0000-0000-0000-000000000002'),'[[[0.1,0.2],[0.3,0.4]]]'::jsonb,'actual normalized strokes are retained');
select lives_ok($$select public.sign_estimate('40000000-0000-0000-0000-000000000002','Home Owner','test','[[[0.1,0.2],[0.3,0.4]]]'::jsonb)$$,'lost acknowledgment retry with exact same evidence succeeds');
select throws_ok($$select public.sign_estimate('40000000-0000-0000-0000-000000000002','Different Person','test','[[[0.1,0.2],[0.3,0.4]]]'::jsonb)$$,'P0001','already accepted','retry cannot replace the signer');
select throws_ok($$select public.sign_estimate('40000000-0000-0000-0000-000000000002','Home Owner','test','[[[0.1,0.2],[0.5,0.6]]]'::jsonb)$$,'P0001','already accepted','retry cannot replace the ink');
select ok(not public.valid_signature_ink('[[[-0.1,0.2],[0.3,0.4]]]'::jsonb),'out of bounds ink is rejected');
select ok(not public.valid_signature_ink('[[[0.1,0.2]]]'::jsonb),'single dot is insufficient signature evidence');
select is((select count(*)::int from public.signatures where document_id='50000000-0000-0000-0000-000000000002'),1,'signing retries retain one immutable evidence row');
reset role;
update public.estimate_access_links set expires_at=now()+interval '1 day',revoked_at=now() where business_id='20000000-0000-0000-0000-000000000001';
select throws_ok($$select public.view_estimate_access(repeat('a',64))$$,'P0001','not found','revoked links cannot view quote');
select throws_ok($$select public.accept_estimate_access(repeat('a',64),(select snapshot_hash from public.estimate_access_links limit 1),'Home Owner','test device','127.0.0.1','I accept this exact estimate and use my typed name as my electronic signature.')$$,'P0001','not allowed','revoked links cannot approve quote');

insert into public.jobs(id,business_id,customer_id,title) values
 ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Third room');
insert into public.estimates(id,business_id,job_id,number) values
 ('50000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','E-Q3');
insert into public.estimate_lines(business_id,estimate_id,description,unit,qty_hundredths,unit_cents) values
 ('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','Paint trim','flat',100,25000);
select pg_temp.quote_owner('10000000-0000-0000-0000-000000000001');
update public.estimates set sent_at=now(),tax_rate_bps=0,tax_labor=false,tax_materials=false where number='E-Q3';
select public.prepare_estimate_access('40000000-0000-0000-0000-000000000003',repeat('c',64));
select throws_ok($$update public.estimates set declined_at=now() where number='E-Q3'$$,'P0001','estimate decline requires a valid customer link','owner cannot create a customer decline');
reset role;
select ok(not has_function_privilege('authenticated','public.decline_estimate_access(text,text)','execute'),'decline RPC is server-only');
select throws_ok($$select public.decline_estimate_access(repeat('c',64),repeat('0',64))$$,'P0001','not allowed','decline must match the viewed estimate');
select lives_ok($$select public.decline_estimate_access(repeat('c',64),(select snapshot_hash from public.estimate_access_links where token_hash=repeat('c',64)))$$,'customer can decline an open estimate');
select lives_ok($$select public.decline_estimate_access(repeat('c',64),(select snapshot_hash from public.estimate_access_links where token_hash=repeat('c',64)))$$,'decline retry succeeds');
select is((select count(*)::int from public.audit_log where action='estimate.declined_by_link'),1,'decline retry does not duplicate the audit record');
select ok((public.view_estimate_access(repeat('c',64))->>'declinedAt') is not null,'the customer link reports the saved decline');
select throws_ok($$select public.accept_estimate_access(repeat('c',64),(select snapshot_hash from public.estimate_access_links where token_hash=repeat('c',64)),'Home Owner','test','127.0.0.1','I accept this exact estimate and use my typed name as my electronic signature.')$$,'P0001','a declined estimate cannot be signed','declined estimate cannot later be accepted');
select pg_temp.quote_owner('10000000-0000-0000-0000-000000000001');
select throws_ok($$select public.sign_estimate('40000000-0000-0000-0000-000000000003','Home Owner','test','[[[0.1,0.2],[0.3,0.4]]]'::jsonb)$$,'P0001','a declined estimate cannot be signed','declined estimate cannot be signed in person');
reset role;
select finish();
rollback;
