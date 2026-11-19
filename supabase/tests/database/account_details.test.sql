-- Business details (owner only) and a person's own team name.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to "$user", public, extensions;
select plan(9);

insert into auth.users(id,email) values
 ('d1111111-1111-1111-1111-11111111111a','owner@details.test'),
 ('d1111111-1111-1111-1111-11111111111b','manager@details.test'),
 ('d1111111-1111-1111-1111-11111111111c','crew@details.test');
insert into public.businesses(id,name) values ('d2222222-2222-2222-2222-22222222222a','Details A');
insert into public.business_members(business_id,user_id,role,status,name) values
 ('d2222222-2222-2222-2222-22222222222a','d1111111-1111-1111-1111-11111111111a','owner','active','Owner'),
 ('d2222222-2222-2222-2222-22222222222a','d1111111-1111-1111-1111-11111111111b','manager','active','Maria'),
 ('d2222222-2222-2222-2222-22222222222a','d1111111-1111-1111-1111-11111111111c','crew','active','Carlos');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;

select pg_temp.as_user('d1111111-1111-1111-1111-11111111111a');
select lives_ok($$update public.businesses set name='Mike''s Plumbing', phone='555-0100', email='office@mikes.test', address='1 Main St' where id='d2222222-2222-2222-2222-22222222222a'$$,'owner edits the business details');
select is((select email from public.businesses),'office@mikes.test','the email is saved');
select throws_ok($$update public.businesses set email='not an email' where id='d2222222-2222-2222-2222-22222222222a'$$,'23514',null,'a bad email is refused');
select throws_ok($$update public.businesses set name='  ' where id='d2222222-2222-2222-2222-22222222222a'$$,'23514',null,'the business needs a name');

select pg_temp.as_user('d1111111-1111-1111-1111-11111111111b');
select lives_ok($$update public.businesses set email='hacked@x.test' where id='d2222222-2222-2222-2222-22222222222a'$$,'a manager''s edit changes nothing');
select lives_ok($$select public.update_my_name('  Maria Lopez ')$$,'a manager changes their own name');

select pg_temp.as_user('d1111111-1111-1111-1111-11111111111c');
select throws_ok($$select public.update_my_name('')$$,'23514',null,'a name can''t be empty');

reset role;
select is((select email from public.businesses),'office@mikes.test','only the owner changed the business');
select is((select string_agg(name, ',' order by name) from public.business_members),'Carlos,Maria Lopez,Owner','only the person''s own name changed');

select * from finish();
rollback;
