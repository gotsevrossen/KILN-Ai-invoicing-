begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(12);
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-00000000000a','packages-a@example.test'),
 ('10000000-0000-0000-0000-00000000000b','packages-b@example.test');
create function pg_temp.packages_act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true), set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.packages_act_as('10000000-0000-0000-0000-00000000000a');
select public.create_business('Packages A','','{electrical}','hourly',10000);
select pg_temp.packages_act_as('10000000-0000-0000-0000-00000000000b');
select public.create_business('Packages B','','{plumbing}','hourly',10000);
reset role;
create temp table package_ids as select
 (select business_id from public.business_members where user_id='10000000-0000-0000-0000-00000000000a') as a,
 (select business_id from public.business_members where user_id='10000000-0000-0000-0000-00000000000b') as b;
grant select on package_ids to authenticated;
select pg_temp.packages_act_as('10000000-0000-0000-0000-00000000000a');
select lives_ok($$insert into public.service_packages(business_id,name,lines)
 select a,'Fan install','[{"description":"Install fan","unit":"each","qtyHundredths":100,"unitCents":null}]' from package_ids$$,'owner saves an unpriced template');
select is((select count(*)::int from public.service_packages),1,'owner sees own package');
select throws_ok($$insert into public.service_packages(business_id,name,lines)
 select b,'Cross account','[{"description":"Repair","unit":"flat","qtyHundredths":100,"unitCents":100}]' from package_ids$$,'42501',null,'cannot insert another business package');
select throws_ok($$update public.service_packages set business_id=(select b from package_ids)$$,'42501',null,'cannot move package to another business');
select throws_ok($$update public.service_packages set lines='[{"description":"Bad","unit":"flat","qtyHundredths":0,"unitCents":100}]'$$,'23514',null,'reject zero quantity');
select throws_ok($$update public.service_packages set minimum_cents=-1$$,'23514',null,'reject negative minimum');
select throws_ok($$update public.service_packages set scope='{"privateNote":"Secret"}'$$,'23514',null,'scope rejects private-note fields');
select pg_temp.packages_act_as('10000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.service_packages),0,'other business cannot read package');
update public.service_packages set name='Changed';
delete from public.service_packages;
select pg_temp.packages_act_as('10000000-0000-0000-0000-00000000000a');
select is((select name from public.service_packages),'Fan install','other business could not update or delete');
select lives_ok($$update public.service_packages set after_hours_cents=5000, minimum_cents=15000$$,'owner edits callout settings');
select lives_ok($$delete from public.service_packages$$,'owner deletes package');
select is((select count(*)::int from public.service_packages),0,'package deleted');
select * from finish();
rollback;
