-- Deleting an account: 30 days to change your mind, an owner's business goes with them,
-- a team member's work stays, and only the scheduled server run can carry it out.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('a7111111-1111-1111-1111-11111111111a','gone-owner@team.test'),
 ('a7111111-1111-1111-1111-11111111111c','gone-crew@team.test'),
 ('a7111111-1111-1111-1111-11111111111d','other-owner@team.test');
insert into public.businesses(id,name) values
 ('a7222222-2222-2222-2222-22222222222a','Leaving Co'),
 ('a7222222-2222-2222-2222-22222222222d','Staying Co');
insert into public.business_members(business_id,user_id,role,status) values
 ('a7222222-2222-2222-2222-22222222222a','a7111111-1111-1111-1111-11111111111a','owner','active'),
 ('a7222222-2222-2222-2222-22222222222d','a7111111-1111-1111-1111-11111111111d','owner','active'),
 ('a7222222-2222-2222-2222-22222222222d','a7111111-1111-1111-1111-11111111111c','crew','active');
insert into public.customers(id,business_id,name) values
 ('a7333333-3333-3333-3333-33333333333a','a7222222-2222-2222-2222-22222222222a','Lee'),
 ('a7333333-3333-3333-3333-33333333333d','a7222222-2222-2222-2222-22222222222d','Kim');
insert into public.jobs(id,business_id,customer_id,title) values
 ('a7444444-4444-4444-4444-44444444444a','a7222222-2222-2222-2222-22222222222a','a7333333-3333-3333-3333-33333333333a','Leaving job'),
 ('a7444444-4444-4444-4444-44444444444d','a7222222-2222-2222-2222-22222222222d','a7333333-3333-3333-3333-33333333333d','Staying job');
-- a sent invoice (locked), and a photo file, on the business that's leaving
insert into public.photos(id,business_id,job_id,storage_path) values
 ('a7666666-6666-6666-6666-66666666666a','a7222222-2222-2222-2222-22222222222a','a7444444-4444-4444-4444-44444444444a',
  'a7222222-2222-2222-2222-22222222222a/a7444444-4444-4444-4444-44444444444a/a7666666-6666-6666-6666-66666666666a.jpg');
insert into public.invoices(id,business_id,job_id,number) values
 ('a7555555-5555-5555-5555-55555555555a','a7222222-2222-2222-2222-22222222222a','a7444444-4444-4444-4444-44444444444a','I-1');
insert into public.invoice_lines(business_id,invoice_id,description,kind,qty_hundredths,unit_cents) values
 ('a7222222-2222-2222-2222-22222222222a','a7555555-5555-5555-5555-55555555555a','Work','labor',100,5000);
update public.businesses set alternative_methods='{"cash":""}' where id='a7222222-2222-2222-2222-22222222222a';
update public.invoices set sent_at=now(),tax_rate_bps=0,tax_labor=false,tax_materials=false,issued_on=current_date,due_days=0
 where id='a7555555-5555-5555-5555-55555555555a';

-- the crew member's hours on the staying business, recorded as theirs
insert into public.time_entries(business_id,job_id,hundredths,worker_user_id)
 values ('a7222222-2222-2222-2222-22222222222d','a7444444-4444-4444-4444-44444444444d',200,'a7111111-1111-1111-1111-11111111111c');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;

-- asking, changing your mind, asking again
select pg_temp.as_user('a7111111-1111-1111-1111-11111111111a');
select is(public.my_account_deletion(),null,'no deletion until asked');
select ok(public.request_account_deletion() between now() + interval '29 days' and now() + interval '31 days','an account is deleted 30 days after asking');
select isnt(public.my_account_deletion(),null,'the app can show when');
select lives_ok($$select public.cancel_account_deletion()$$,'signing back in can cancel it');
select is(public.my_account_deletion(),null,'cancelled');
select lives_ok($$select public.request_account_deletion()$$,'the owner asks again');
select throws_ok($$select * from public.account_deletions$$,'42501',null,'the app can''t read or change the deletion list');
select throws_ok($$select public.purge_account('a7111111-1111-1111-1111-11111111111a')$$,'42501',null,'only the scheduled server run can erase an account');
select throws_ok($$select * from public.account_deletions_due()$$,'42501',null,'only the server sees who is due');

select pg_temp.as_user('a7111111-1111-1111-1111-11111111111c');
select lives_ok($$select public.request_account_deletion()$$,'a crew member asks too');

-- not yet due: nothing happens
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok($$select public.purge_account('a7111111-1111-1111-1111-11111111111a')$$,'42501',null,'nothing is erased before the 30 days are up');
select is((select count(*)::int from public.account_deletions_due()),0,'nobody is due yet');

-- 30 days later
update public.account_deletions set delete_after = now() - interval '1 minute';
select is((select count(*)::int from public.account_deletions_due()),2,'both are due');
select is((public.purge_account('a7111111-1111-1111-1111-11111111111a')->>'files')::int,1,'the owner''s photo files are queued for removal');
select is((select count(*)::int from public.businesses where id='a7222222-2222-2222-2222-22222222222a'),0,'the owner''s business is gone');
select is((select count(*)::int from public.invoices where business_id='a7222222-2222-2222-2222-22222222222a'),0,'even its sent invoice is gone');
select is((select count(*)::int from public.customers where business_id='a7222222-2222-2222-2222-22222222222a'),0,'and its customers');
select is((select count(*)::int from public.job_cleanup_files where business_id='a7222222-2222-2222-2222-22222222222a'),1,'the photo file waits for the cleanup run');
select is(public.purge_account('a7111111-1111-1111-1111-11111111111a')->>'business',null,'running it again is harmless');

select is(public.purge_account('a7111111-1111-1111-1111-11111111111c')->>'business',null,'a crew member''s request erases no business');
-- the server function then deletes the logins
delete from auth.users where id in ('a7111111-1111-1111-1111-11111111111a','a7111111-1111-1111-1111-11111111111c');
select is((select count(*)::int from public.time_entries where business_id='a7222222-2222-2222-2222-22222222222d'),1,'the crew member''s hours stay with the business');
select is((select count(*)::int from public.business_members where business_id='a7222222-2222-2222-2222-22222222222d'),1,'their place on the team is gone');
select is((select count(*)::int from public.jobs where business_id='a7222222-2222-2222-2222-22222222222d'),1,'another business is untouched');
select is((select count(*)::int from public.account_deletions),0,'the deletion list empties as logins go');

select * from finish();
rollback;
