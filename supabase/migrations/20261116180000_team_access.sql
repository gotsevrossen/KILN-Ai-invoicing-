-- Helpers use narrow RPCs. Legacy business data and billing permissions remain owner-only.
-- is_member historically meant "can operate the whole business"; keep that boundary
-- owner-only now that real helper memberships can exist. has_membership checks actual membership.
create function public.has_membership(bid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.business_members where business_id=bid and user_id=(select auth.uid()));
$$;
create or replace function public.is_member(bid uuid) returns boolean
language sql stable security definer set search_path='' as $$ select public.is_owner(bid); $$;

create table public.team_worker_accounts (
 business_id uuid not null references public.businesses on delete cascade,
 user_id uuid not null,
 worker_id uuid not null unique,
 primary key (business_id,user_id),
 foreign key (business_id,user_id) references public.business_members(business_id,user_id) on delete cascade,
 foreign key (worker_id,business_id) references public.operations_workers(id,business_id) on delete cascade
);
create table public.team_job_assignments (
 business_id uuid not null,
 user_id uuid not null,
 job_id uuid not null,
 primary key (business_id,user_id,job_id),
 foreign key (business_id,user_id) references public.business_members(business_id,user_id) on delete cascade,
 foreign key (job_id,business_id) references public.jobs(id,business_id) on delete cascade
);
create table public.team_invites (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses on delete cascade,
 worker_id uuid not null,
 email text not null check (length(email) between 3 and 254),
 token_hash text not null unique,
 expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key (worker_id,business_id) references public.operations_workers(id,business_id) on delete cascade
);
create index on public.team_job_assignments(user_id,job_id);
create index on public.team_invites(business_id,created_at);
alter table public.time_entries add column worker_user_id uuid references auth.users;
alter table public.notes add column worker_user_id uuid references auth.users;
alter table public.photos add column worker_user_id uuid references auth.users;

do $$ declare t text; begin
 foreach t in array array['team_worker_accounts','team_job_assignments','team_invites'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy "owners read team" on public.%I for select to authenticated using(public.is_owner(business_id))',t);
 end loop;
end $$;
-- Only the validated owner RPC can assign a job; no direct membership mutation policy.

create function public.team_can_work(p_job uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.team_job_assignments a join public.business_members m
 on m.business_id=a.business_id and m.user_id=a.user_id
 where a.job_id=p_job and a.user_id=(select auth.uid()) and m.role='helper');
$$;
create function public.team_job_is_open(p_job uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.team_can_work(p_job) and not exists(select 1 from public.invoices where job_id=p_job and sent_at is not null);
$$;

create function public.create_team_invite(p_business uuid,p_worker uuid,p_email text) returns text
language plpgsql security definer set search_path='' as $$
declare code text; normalized text:=lower(btrim(p_email)); begin
 if not public.is_owner(p_business) then raise exception using errcode='42501',message='owner only'; end if;
 if normalized is null or length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception using errcode='23514',message='invalid email'; end if;
 perform 1 from public.operations_workers where id=p_worker and business_id=p_business and not archived for update;
 if not found or exists(select 1 from public.team_worker_accounts where worker_id=p_worker) then raise exception using errcode='23514',message='worker unavailable'; end if;
 if (select count(*) from public.team_invites where business_id=p_business and accepted_at is null and revoked_at is null and expires_at>now())>=50 then raise exception using errcode='23514',message='too many pending invites'; end if;
 code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.team_invites(business_id,worker_id,email,token_hash) values(p_business,p_worker,normalized,encode(sha256(convert_to(code,'UTF8')),'hex'));
 return code;
end $$;

-- Service-only: team-join verifies a fresh EMAIL OTP for this exact Auth user first.
-- Hosted email auto-confirmation alone is intentionally insufficient for client acceptance.
create function public.accept_team_invite(p_token text,p_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare invitation record; account record; begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception using errcode='42501',message='invitation unavailable'; end if;
 select id,lower(email) as email,email_confirmed_at into account from auth.users where id=p_user;
 if not found or account.email_confirmed_at is null then raise exception using errcode='42501',message='verified email required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into invitation from public.team_invites where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or invitation.expires_at<=now() or invitation.revoked_at is not null or invitation.email<>account.email then raise exception using errcode='42501',message='invitation unavailable'; end if;
 if invitation.accepted_at is not null then
  if exists(select 1 from public.team_worker_accounts where business_id=invitation.business_id and user_id=p_user and worker_id=invitation.worker_id) then return invitation.business_id; end if;
  raise exception using errcode='42501',message='invitation unavailable';
 end if;
 if exists(select 1 from public.business_members where user_id=p_user) then raise exception using errcode='23514',message='account already has a business'; end if;
 perform 1 from public.operations_workers where id=invitation.worker_id and business_id=invitation.business_id and not archived for update;
 if not found or exists(select 1 from public.team_worker_accounts where worker_id=invitation.worker_id) then raise exception using errcode='23514',message='worker unavailable'; end if;
 insert into public.business_members(business_id,user_id,role) values(invitation.business_id,p_user,'helper');
 insert into public.team_worker_accounts(business_id,user_id,worker_id) values(invitation.business_id,p_user,invitation.worker_id);
 update public.team_invites set accepted_at=now() where id=invitation.id;
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(invitation.business_id,p_user,'team.joined','team_invite',invitation.id);
 return invitation.business_id;
end $$;

create function public.revoke_team_invite(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.team_invites set revoked_at=now() where id=p_id and public.is_owner(business_id) and accepted_at is null;
 if not found then raise exception using errcode='42501',message='invitation unavailable'; end if;
end $$;
create function public.remove_team_member(p_business uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_owner(p_business) then raise exception using errcode='42501',message='owner only'; end if;
 delete from public.business_members where business_id=p_business and user_id=p_user and role='helper';
 if not found then raise exception using errcode='42501',message='helper unavailable'; end if;
 insert into public.audit_log(business_id,actor,action,entity,entity_id) values(p_business,(select auth.uid()),'team.removed','team_member',p_user);
end $$;
create function public.assign_team_job(p_business uuid,p_user uuid,p_job uuid,p_assigned boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_owner(p_business) then raise exception using errcode='42501',message='owner only'; end if;
 if not exists(select 1 from public.business_members where business_id=p_business and user_id=p_user and role='helper') or not exists(select 1 from public.jobs where id=p_job and business_id=p_business) then raise exception using errcode='23514',message='invalid assignment'; end if;
 if p_assigned then insert into public.team_job_assignments(business_id,user_id,job_id) values(p_business,p_user,p_job) on conflict do nothing;
 else delete from public.team_job_assignments where business_id=p_business and user_id=p_user and job_id=p_job; end if;
end $$;
create function public.team_members(p_business uuid) returns table(user_id uuid,worker_id uuid,name text,email text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_owner(p_business) then raise exception using errcode='42501',message='owner only'; end if;
 return query select a.user_id,a.worker_id,w.name,u.email::text from public.team_worker_accounts a join public.operations_workers w on w.id=a.worker_id join auth.users u on u.id=a.user_id where a.business_id=p_business;
end $$;

-- Explicit result columns keep rates, private notes, payment data, and customer history out.
create function public.team_assigned_jobs() returns table(id uuid,title text,address text,customer_name text,customer_phone text,customer_lang text,is_open boolean)
language sql stable security definer set search_path='' as $$
 select j.id,j.title,j.address,c.name,c.phone,c.lang,public.team_job_is_open(j.id)
 from public.jobs j join public.customers c on c.id=j.customer_id where public.team_can_work(j.id) order by j.created_at desc;
$$;
create function public.team_my_hours() returns table(id uuid,job_id uuid,worked_on date,hundredths integer,note text)
language sql stable security definer set search_path='' as $$
 select t.id,t.job_id,t.worked_on,t.hundredths,t.note from public.time_entries t where t.worker_user_id=(select auth.uid()) and public.team_can_work(t.job_id) order by t.created_at desc;
$$;
create function public.team_my_notes() returns table(id uuid,job_id uuid,body text)
language sql stable security definer set search_path='' as $$
 select n.id,n.job_id,n.body from public.notes n where n.worker_user_id=(select auth.uid()) and public.team_can_work(n.job_id) order by n.created_at desc;
$$;
create function public.team_log_hours(p_id uuid,p_job uuid,p_hundredths integer,p_note text) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; worker uuid; begin
 if not public.team_job_is_open(p_job) then raise exception using errcode='42501',message='job unavailable'; end if;
 if p_hundredths is null or p_hundredths not between 1 and 2400 or length(coalesce(p_note,''))>1000 then raise exception using errcode='23514',message='invalid hours'; end if;
 select j.business_id,a.worker_id into bid,worker from public.jobs j join public.team_worker_accounts a on a.business_id=j.business_id and a.user_id=(select auth.uid()) where j.id=p_job;
 if worker is null then raise exception using errcode='42501',message='worker unavailable'; end if;
 -- Stable client id makes a retry after a dropped connection safe.
 if exists(select 1 from public.time_entries t where t.id=p_id and t.worker_user_id=(select auth.uid()) and t.job_id=p_job and t.hundredths=p_hundredths and t.note=coalesce(p_note,'')) then return p_id; end if;
 insert into public.time_entries(id,business_id,job_id,hundredths,note,worker_user_id) values(p_id,bid,p_job,p_hundredths,coalesce(p_note,''),(select auth.uid()));
 insert into public.operations_labor_costs(time_entry_id,business_id,worker_id,loaded_rate_cents) values(p_id,bid,worker,0);
 return p_id;
end $$;
create function public.team_add_note(p_id uuid,p_job uuid,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; begin
 if not public.team_job_is_open(p_job) then raise exception using errcode='42501',message='job unavailable'; end if;
 if p_body is null or length(btrim(p_body)) not between 1 and 4000 then raise exception using errcode='23514',message='invalid note'; end if;
 select business_id into bid from public.jobs where id=p_job;
 if exists(select 1 from public.notes where id=p_id and worker_user_id=(select auth.uid()) and job_id=p_job and body=btrim(p_body)) then return p_id; end if;
 insert into public.notes(id,business_id,job_id,body,worker_user_id) values(p_id,bid,p_job,btrim(p_body),(select auth.uid()));
 return p_id;
end $$;

-- Fresh email OTP acceptance is service-only. No client can bypass the email check.
revoke all on function public.accept_team_invite(text,uuid) from public,anon,authenticated;
grant execute on function public.accept_team_invite(text,uuid) to service_role;
do $$ declare signature text; begin
 foreach signature in array array[
 'public.has_membership(uuid)','public.team_can_work(uuid)','public.team_job_is_open(uuid)',
 'public.create_team_invite(uuid,uuid,text)','public.revoke_team_invite(uuid)',
 'public.remove_team_member(uuid,uuid)','public.assign_team_job(uuid,uuid,uuid,boolean)',
 'public.team_members(uuid)','public.team_assigned_jobs()','public.team_my_hours()','public.team_my_notes()',
 'public.team_log_hours(uuid,uuid,integer,text)','public.team_add_note(uuid,uuid,text)'] loop
  execute 'revoke all on function '||signature||' from public,anon';
  execute 'grant execute on function '||signature||' to authenticated';
 end loop;
end $$;

-- Helpers cannot consume the owner AI quota or call owner AI tasks.
create or replace function public.use_ai_quota() returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  bid uuid;
  used integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  select m.business_id into bid from public.business_members m
    where m.user_id = (select auth.uid()) and m.role = 'owner' order by m.created_at limit 1;
  if bid is null then
    raise exception 'this account has no business yet';
  end if;
  insert into public.ai_usage as u (business_id, day, requests) values (bid, current_date, 1)
    on conflict (business_id, day) do update set requests = u.requests + 1
    returning u.requests into used;
  if used > 300 then
    -- its own code, so the Edge Function can tell "over the limit" from other errors
    raise exception 'daily AI limit reached' using errcode = 'KL429';
  end if;
  if (select sum(requests) from public.ai_usage where day = current_date) > 2000 then
    raise exception 'KILN''s daily AI limit reached' using errcode = 'KL429';
  end if;
  return bid;
end;
$$;

-- Helpers may upload new JPEG evidence only to their assigned, open jobs.
-- They cannot list company files, overwrite existing objects or delete evidence.
create function public.team_photo_upload_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare bid uuid; jid uuid; begin
 if p_name !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.jpg$' then return false; end if;
 bid:=split_part(p_name,'/',1)::uuid; jid:=split_part(p_name,'/',2)::uuid;
 return public.team_job_is_open(jid) and exists(select 1 from public.jobs where id=jid and business_id=bid);
 exception when invalid_text_representation then return false;
end $$;
create policy "helpers upload assigned job photos" on storage.objects for insert to authenticated
 with check(bucket_id='job-photos' and public.team_photo_upload_allowed(name));
create function public.team_my_photos() returns table(id uuid,job_id uuid,storage_path text,tag text,taken_at timestamptz)
language sql stable security definer set search_path='' as $$
 select p.id,p.job_id,p.storage_path,p.tag,p.taken_at from public.photos p where p.worker_user_id=(select auth.uid()) and public.team_can_work(p.job_id) order by p.taken_at desc;
$$;
create policy "helpers read their assigned job photos" on storage.objects for select to authenticated
 using(bucket_id='job-photos' and exists(select 1 from public.team_my_photos() p where p.storage_path=name));

create function public.team_save_photo(p_id uuid,p_job uuid,p_taken_at timestamptz,p_tag text) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid; file_path text; begin
 if not public.team_job_is_open(p_job) then raise exception using errcode='42501',message='job unavailable'; end if;
 if p_tag is null or p_tag not in ('before','during','after') or p_taken_at is null then raise exception using errcode='23514',message='invalid photo'; end if;
 select business_id into bid from public.jobs where id=p_job;
 file_path:=bid::text||'/'||p_job::text||'/'||p_id::text||'.jpg';
 if exists(select 1 from public.photos where id=p_id and job_id=p_job and worker_user_id=(select auth.uid())) then return p_id; end if;
 if not exists(select 1 from storage.objects where bucket_id='job-photos' and name=file_path and owner_id=(select auth.uid())::text) then raise exception using errcode='42501',message='photo unavailable'; end if;
 insert into public.photos(id,business_id,job_id,storage_path,tag,taken_at,worker_user_id) values(p_id,bid,p_job,file_path,p_tag,p_taken_at,(select auth.uid()));
 return p_id;
end $$;
revoke all on function public.team_photo_upload_allowed(text),public.team_my_photos(),public.team_save_photo(uuid,uuid,timestamptz,text) from public,anon;
grant execute on function public.team_photo_upload_allowed(text),public.team_my_photos(),public.team_save_photo(uuid,uuid,timestamptz,text) to authenticated;
