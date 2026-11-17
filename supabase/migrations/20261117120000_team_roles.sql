-- Team roles: owner, manager and crew member (see docs/team-roles-plan-2026-11-17.md).
--
-- * Owners and managers run the business. Every existing policy and function that called
--   is_owner() or is_member() now means "owner or active manager". Things only the owner may do
--   (business settings, roles, pay rates and job costs, Stripe) use is_business_owner().
-- * Crew members never read business tables directly. They work only on jobs assigned to them,
--   through the narrow team_* functions below, which choose exactly which columns they see.
-- * People join with a one-time invite code, then wait until an owner or manager approves them.
--   A pending person has no access at all.

-- ---------------------------------------------------------------- roles and membership

alter table public.business_members drop constraint business_members_role_check;
update public.business_members set role = 'crew' where role = 'helper';
alter table public.business_members
  add constraint business_members_role_check check (role in ('owner', 'manager', 'crew')),
  add column name text not null default '' check (length(name) <= 120),
  add column status text not null default 'active' check (status in ('pending', 'active')),
  add column invited_by uuid references auth.users on delete set null,
  add column approved_by uuid references auth.users on delete set null,
  add column approved_at timestamptz;
-- an owner is always active
alter table public.business_members add constraint business_members_owner_active check (role <> 'owner' or status = 'active');

alter table public.businesses
  -- the setup answer "Me and a team": shows the Team tab
  add column has_team boolean not null default false,
  -- crew see prices on estimates, invoices and the price list
  add column crew_sees_prices boolean not null default false,
  -- managers see pay rates, labor costs and job profit
  add column managers_see_costs boolean not null default false;

create function public.member_role(bid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.business_members m
  where m.business_id = bid and m.user_id = (select auth.uid()) and m.status = 'active';
$$;

-- The owner alone: business settings, roles, managers, pay rates, Stripe.
create function public.is_business_owner(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.member_role(bid) = 'owner', false);
$$;

-- Owner or active manager: runs the business (jobs, customers, documents, payments, prices).
create function public.is_manager(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.member_role(bid) in ('owner', 'manager'), false);
$$;

-- Existing policies and functions use these two names for "can run the business".
create or replace function public.is_owner(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.is_manager(bid); $$;
create or replace function public.is_member(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.is_manager(bid); $$;
create or replace function public.has_membership(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.member_role(bid) is not null; $$;

-- Pay rates, labor costs and budgets: the owner, or managers when the owner allows it.
create function public.can_see_costs(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_business_owner(bid)
    or (public.is_manager(bid) and coalesce((select b.managers_see_costs from public.businesses b where b.id = bid), false));
$$;

-- Crew work only on jobs assigned to them.
create or replace function public.team_can_work(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.team_job_assignments a join public.business_members m
    on m.business_id = a.business_id and m.user_id = a.user_id
    where a.job_id = p_job and a.user_id = (select auth.uid()) and m.role = 'crew' and m.status = 'active');
$$;

revoke all on function public.member_role(uuid), public.is_business_owner(uuid), public.is_manager(uuid), public.can_see_costs(uuid) from public, anon;
grant execute on function public.member_role(uuid), public.is_business_owner(uuid), public.is_manager(uuid), public.can_see_costs(uuid) to authenticated;

-- Owner-only again after is_owner() widened.
drop policy "owners update their business" on public.businesses;
create policy "owner updates the business" on public.businesses
  for update to authenticated using (public.is_business_owner(id)) with check (public.is_business_owner(id));

do $$ declare t text; begin
  foreach t in array array['operations_workers', 'operations_labor_costs', 'operations_budgets'] loop
    execute format('drop policy "owners manage operations" on public.%I', t);
    execute format('create policy "cost viewers read" on public.%I for select to authenticated using (public.can_see_costs(business_id))', t);
    execute format('create policy "owner changes costs" on public.%I for all to authenticated using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id))', t);
  end loop;
end $$;

-- Managers get the AI helpers too; crew don't (their screens don't use them yet).
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
    where m.user_id = (select auth.uid()) and m.role in ('owner', 'manager') and m.status = 'active'
    order by m.created_at limit 1;
  if bid is null then
    raise exception 'this account has no business yet';
  end if;
  insert into public.ai_usage as u (business_id, day, requests) values (bid, current_date, 1)
    on conflict (business_id, day) do update set requests = u.requests + 1
    returning u.requests into used;
  if used > 300 then
    raise exception 'daily AI limit reached' using errcode = 'KL429';
  end if;
  if (select sum(requests) from public.ai_usage where day = current_date) > 2000 then
    raise exception 'KILN''s daily AI limit reached' using errcode = 'KL429';
  end if;
  return bid;
end;
$$;

-- ---------------------------------------------------------------- who added what

create function public.stamp_created_by() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- the signed-in person, never a value the app sends
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['customers', 'jobs', 'price_list_items', 'time_entries', 'notes', 'photos', 'voice_notes',
    'estimates', 'change_orders', 'receipts', 'invoices', 'work_items'] loop
    execute format('alter table public.%I add column created_by uuid references auth.users on delete set null', t);
    -- filling in the new column isn't an edit of a sent or signed document, so the locks stay out of it
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I x set created_by = (select m.user_id from public.business_members m where m.business_id = x.business_id and m.role = ''owner'' order by m.created_at limit 1)', t);
    if t in ('time_entries', 'notes', 'photos') then
      execute format('update public.%I set created_by = worker_user_id where worker_user_id is not null', t);
    end if;
    execute format('alter table public.%I enable trigger user', t);
    execute format('create trigger stamp_created_by before insert or update on public.%I for each row execute function public.stamp_created_by()', t);
  end loop;
end $$;
create index on public.photos (created_by);
create index on public.notes (created_by);
create index on public.time_entries (created_by);
create index on public.work_items (created_by);

-- a crew member's new price list item waits for a manager to check it
alter table public.price_list_items add column needs_review boolean not null default false;

-- ---------------------------------------------------------------- scope change suggestions

-- Crew suggest a change on site. A manager prices it and sends it as a change order.
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  job_id uuid not null,
  description text not null check (length(btrim(description)) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (job_id, business_id) references public.jobs(id, business_id) on delete cascade
);
create index on public.change_requests (business_id, status);
create index on public.change_requests (job_id);
alter table public.change_requests enable row level security;
revoke all on public.change_requests from anon, authenticated;
grant select, update, delete on public.change_requests to authenticated;
create policy "managers read change requests" on public.change_requests for select to authenticated using (public.is_manager(business_id));
create policy "managers update change requests" on public.change_requests for update to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));
create policy "managers delete change requests" on public.change_requests for delete to authenticated using (public.is_manager(business_id));
create trigger stamp_created_by before insert or update on public.change_requests for each row execute function public.stamp_created_by();

-- ---------------------------------------------------------------- invites and joining

-- The old flow (email-bound link plus an email code) is replaced by a code plus approval.
drop function public.create_team_invite(uuid, uuid, text);
drop function public.accept_team_invite(text, uuid);
drop function public.remove_team_member(uuid, uuid);
drop function public.team_members(uuid);
drop function public.team_assigned_jobs();

update public.team_invites set revoked_at = now() where accepted_at is null and revoked_at is null;
alter table public.team_invites
  alter column worker_id drop not null,
  alter column email drop not null,
  add column role text not null default 'crew' check (role in ('manager', 'crew')),
  add column name text not null default '' check (length(name) <= 120),
  add column created_by uuid references auth.users on delete set null,
  add column requested_user_id uuid references auth.users on delete set null,
  add column requested_at timestamptz;

-- Codes look like KILN-7K4P-2QXM-9TRB: 12 characters from 31 (about 59 random bits), no 0/O/1/I/L.
create function public.normalize_team_code(p_code text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g'), '^KILN', '');
$$;

create function public.create_team_invite(p_business uuid, p_name text, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  code text := '';
  clean text := btrim(coalesce(p_name, ''));
begin
  if not public.is_manager(p_business) then raise exception using errcode = '42501', message = 'managers only'; end if;
  if p_role not in ('manager', 'crew') then raise exception using errcode = '23514', message = 'invalid role'; end if;
  if p_role = 'manager' and not public.is_business_owner(p_business) then raise exception using errcode = '42501', message = 'owner only'; end if;
  if length(clean) not between 1 and 120 then raise exception using errcode = '23514', message = 'invalid name'; end if;
  if (select count(*) from public.team_invites where business_id = p_business and requested_user_id is null
      and revoked_at is null and expires_at > now()) >= 50 then
    raise exception using errcode = '23514', message = 'too many pending invites';
  end if;
  for i in 0..11 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  insert into public.team_invites (business_id, role, name, token_hash, created_by)
    values (p_business, p_role, clean, encode(sha256(convert_to(code, 'UTF8')), 'hex'), (select auth.uid()));
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (p_business, (select auth.uid()), 'team.invited', 'team_invite', null);
  return 'KILN-' || substr(code, 1, 4) || '-' || substr(code, 5, 4) || '-' || substr(code, 9, 4);
end $$;

create or replace function public.revoke_team_invite(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.team_invites set revoked_at = now()
    where id = p_id and requested_user_id is null and revoked_at is null
      and (public.is_business_owner(business_id) or (public.is_manager(business_id) and role = 'crew'));
  if not found then raise exception using errcode = '42501', message = 'invitation unavailable'; end if;
end $$;

-- The invited person, signed in, enters the code. They wait as "pending" until approved.
create function public.request_to_join(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  clean text := public.normalize_team_code(p_code);
  invite record;
  account record;
begin
  if me is null then raise exception using errcode = '42501', message = 'not signed in'; end if;
  if clean !~ '^[A-Z0-9]{12}$' then raise exception using errcode = '42501', message = 'invitation unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  select * into invite from public.team_invites where token_hash = encode(sha256(convert_to(clean, 'UTF8')), 'hex') for update;
  if not found or invite.revoked_at is not null or invite.expires_at <= now() then
    raise exception using errcode = '42501', message = 'invitation unavailable';
  end if;
  if invite.requested_user_id is not null then
    if invite.requested_user_id = me and exists(select 1 from public.business_members where business_id = invite.business_id and user_id = me) then
      return (select name from public.businesses where id = invite.business_id);
    end if;
    raise exception using errcode = '42501', message = 'invitation unavailable';
  end if;
  if exists(select 1 from public.business_members where user_id = me) then
    raise exception using errcode = '23514', message = 'account already has a business';
  end if;
  select email into account from auth.users where id = me;
  insert into public.business_members (business_id, user_id, role, status, name, invited_by)
    values (invite.business_id, me, invite.role, 'pending', coalesce(nullif(invite.name, ''), left(split_part(account.email, '@', 1), 120)), invite.created_by);
  update public.team_invites set requested_user_id = me, requested_at = now(), email = left(account.email, 254) where id = invite.id;
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (invite.business_id, me, 'team.requested', 'team_invite', invite.id);
  return (select name from public.businesses where id = invite.business_id);
end $$;

-- The signed-in person's own membership, with the business name (pending and crew can't read businesses).
create function public.team_me() returns table(business_id uuid, business_name text, role text, status text, name text, crew_sees_prices boolean)
language sql stable security definer set search_path = '' as $$
  select m.business_id, b.name, m.role, m.status, m.name, b.crew_sees_prices
  from public.business_members m join public.businesses b on b.id = m.business_id
  where m.user_id = (select auth.uid());
$$;

-- Approving a manager needs the owner; approving crew needs an owner or manager.
create function public.can_manage_member(p_business uuid, p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_business_owner(p_business) or (p_role = 'crew' and public.is_manager(p_business));
$$;

create function public.approve_member(p_business uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare member record; worker uuid; begin
  select * into member from public.business_members where business_id = p_business and user_id = p_user and status = 'pending' for update;
  if not found or not public.can_manage_member(p_business, member.role) then raise exception using errcode = '42501', message = 'request unavailable'; end if;
  update public.business_members set status = 'active', approved_by = (select auth.uid()), approved_at = now()
    where business_id = p_business and user_id = p_user;
  -- a planning and pay-rate record for the owner, linked to this login (rate starts at zero)
  if not exists(select 1 from public.team_worker_accounts where business_id = p_business and user_id = p_user) then
    insert into public.operations_workers (business_id, name, loaded_rate_cents)
      values (p_business, coalesce(nullif(btrim(member.name), ''), 'Team member'), 0) returning id into worker;
    insert into public.team_worker_accounts (business_id, user_id, worker_id) values (p_business, p_user, worker);
  end if;
  update public.team_invites set accepted_at = now() where business_id = p_business and requested_user_id = p_user and accepted_at is null;
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (p_business, (select auth.uid()), 'team.approved', 'team_member', p_user);
end $$;

create function public.decline_member(p_business uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare member record; begin
  select * into member from public.business_members where business_id = p_business and user_id = p_user and status = 'pending' for update;
  if not found or not public.can_manage_member(p_business, member.role) then raise exception using errcode = '42501', message = 'request unavailable'; end if;
  delete from public.business_members where business_id = p_business and user_id = p_user;
  update public.team_invites set revoked_at = now() where business_id = p_business and requested_user_id = p_user and accepted_at is null;
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (p_business, (select auth.uid()), 'team.declined', 'team_member', p_user);
end $$;

create function public.change_member_role(p_business uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_business_owner(p_business) then raise exception using errcode = '42501', message = 'owner only'; end if;
  if p_role not in ('manager', 'crew') then raise exception using errcode = '23514', message = 'invalid role'; end if;
  update public.business_members set role = p_role
    where business_id = p_business and user_id = p_user and role in ('manager', 'crew');
  if not found then raise exception using errcode = '42501', message = 'member unavailable'; end if;
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (p_business, (select auth.uid()), 'team.role_' || p_role, 'team_member', p_user);
end $$;

-- Removing takes access away at once. Their photos, notes, hours and work stay on the jobs.
create function public.remove_member(p_business uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare member record; begin
  select * into member from public.business_members where business_id = p_business and user_id = p_user for update;
  if not found or member.role = 'owner' or not public.can_manage_member(p_business, member.role) then
    raise exception using errcode = '42501', message = 'member unavailable';
  end if;
  delete from public.business_members where business_id = p_business and user_id = p_user;
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (p_business, (select auth.uid()), 'team.removed', 'team_member', p_user);
end $$;

create function public.leave_team() returns void
language plpgsql security definer set search_path = '' as $$
declare bid uuid; begin
  delete from public.business_members where user_id = (select auth.uid()) and role <> 'owner' returning business_id into bid;
  if bid is null then raise exception using errcode = '42501', message = 'nothing to leave'; end if;
  insert into public.audit_log (business_id, actor, action, entity, entity_id)
    values (bid, (select auth.uid()), 'team.left', 'team_member', (select auth.uid()));
end $$;

-- The Team tab's list: everyone, with their last upload and how many unpaid jobs they're on.
create function public.team_members(p_business uuid)
returns table(user_id uuid, name text, email text, role text, status text, joined_at timestamptz, last_active timestamptz, open_jobs integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_manager(p_business) then raise exception using errcode = '42501', message = 'managers only'; end if;
  return query
  select m.user_id, coalesce(nullif(m.name, ''), u.email::text), u.email::text, m.role, m.status, m.created_at,
    greatest(
      (select max(x.created_at) from public.photos x where x.business_id = p_business and x.created_by = m.user_id),
      (select max(x.created_at) from public.notes x where x.business_id = p_business and x.created_by = m.user_id),
      (select max(x.created_at) from public.time_entries x where x.business_id = p_business and x.created_by = m.user_id),
      (select max(x.created_at) from public.work_items x where x.business_id = p_business and x.created_by = m.user_id)),
    (select count(*)::int from public.team_job_assignments a where a.business_id = p_business and a.user_id = m.user_id
      and not exists(select 1 from public.invoices i where i.job_id = a.job_id and i.paid_at is not null))
  from public.business_members m join auth.users u on u.id = m.user_id
  where m.business_id = p_business
  order by (m.role = 'owner') desc, (m.status = 'pending') desc, m.created_at;
end $$;

create or replace function public.assign_team_job(p_business uuid, p_user uuid, p_job uuid, p_assigned boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_manager(p_business) then raise exception using errcode = '42501', message = 'managers only'; end if;
  if not exists(select 1 from public.business_members where business_id = p_business and user_id = p_user and role = 'crew' and status = 'active')
    or not exists(select 1 from public.jobs where id = p_job and business_id = p_business) then
    raise exception using errcode = '23514', message = 'invalid assignment';
  end if;
  if p_assigned then
    insert into public.team_job_assignments (business_id, user_id, job_id) values (p_business, p_user, p_job) on conflict do nothing;
  else
    delete from public.team_job_assignments where business_id = p_business and user_id = p_user and job_id = p_job;
  end if;
end $$;

-- ---------------------------------------------------------------- crew: reading their jobs

create function public.team_assigned_jobs()
returns table(id uuid, title text, address text, customer_name text, customer_phone text, customer_lang text, is_open boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select j.id, j.title, j.address, c.name, c.phone, c.lang, public.team_job_is_open(j.id), j.created_at
  from public.jobs j join public.customers c on c.id = j.customer_id
  where public.team_can_work(j.id) order by j.created_at desc;
$$;

-- One assigned job for the crew job page. Prices only when the owner allows crew to see them.
create function public.team_job(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare j record; prices boolean; begin
  if not public.team_can_work(p_job) then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  select jb.id, jb.title, jb.address, coalesce(jb.private_note, '') as private_note, jb.business_id,
    c.name as customer_name, c.phone as customer_phone, c.lang as customer_lang
    into j from public.jobs jb join public.customers c on c.id = jb.customer_id where jb.id = p_job;
  select b.crew_sees_prices into prices from public.businesses b where b.id = j.business_id;
  return jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'title', j.title, 'address', j.address, 'private_note', j.private_note,
      'customer_name', j.customer_name, 'customer_phone', j.customer_phone, 'customer_lang', j.customer_lang,
      'is_open', public.team_job_is_open(p_job), 'prices', prices),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', m.name)), '[]'::jsonb)
      from public.business_members m where m.business_id = j.business_id and m.status = 'active'),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'storage_path', p.storage_path, 'tag', p.tag,
      'taken_at', p.taken_at, 'created_by', p.created_by) order by p.taken_at desc), '[]'::jsonb) from public.photos p where p.job_id = p_job),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at,
      'created_by', n.created_by) order by n.created_at desc), '[]'::jsonb) from public.notes n where n.job_id = p_job),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'worked_on', t.worked_on, 'hundredths', t.hundredths,
      'note', t.note, 'created_by', t.created_by) order by t.created_at desc), '[]'::jsonb) from public.time_entries t where t.job_id = p_job),
    'work', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'description', w.description, 'unit', w.unit,
      'qty_hundredths', w.qty_hundredths, 'unit_cents', case when prices then w.unit_cents end, 'kind', w.kind,
      'created_by', w.created_by, 'created_at', w.created_at) order by w.created_at desc), '[]'::jsonb) from public.work_items w where w.job_id = p_job),
    'changes', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'description', r.description, 'status', r.status,
      'created_by', r.created_by, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb) from public.change_requests r where r.job_id = p_job),
    'estimate', (select jsonb_build_object('number', e.number, 'sent', e.sent_at is not null, 'signed', e.signed_at is not null,
      'scope', e.scope, 'lines', (select coalesce(jsonb_agg(jsonb_build_object('description', l.description, 'unit', l.unit,
        'qty_hundredths', l.qty_hundredths, 'unit_cents', case when prices then l.unit_cents end, 'excluded', l.excluded)
        order by l.position), '[]'::jsonb) from public.estimate_lines l where l.estimate_id = e.id))
      from public.estimates e where e.job_id = p_job),
    'invoice', (select jsonb_build_object('number', i.number, 'sent', i.sent_at is not null, 'paid', i.paid_at is not null,
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('description', l.description, 'kind', l.kind,
        'qty_hundredths', l.qty_hundredths, 'unit_cents', case when prices then l.unit_cents end) order by l.position), '[]'::jsonb)
        from public.invoice_lines l where l.invoice_id = i.id))
      from public.invoices i where i.job_id = p_job));
end $$;

-- The shared price list. Crew can add to it, never change it.
create function public.team_price_list()
returns table(id uuid, ref text, name text, unit text, unit_cents integer, priced boolean, needs_review boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(p.catalog_id, p.id::text), p.name, p.unit,
    case when b.crew_sees_prices then p.unit_cents end, p.unit_cents is not null, p.needs_review
  from public.price_list_items p
  join public.business_members m on m.business_id = p.business_id and m.user_id = (select auth.uid()) and m.role = 'crew' and m.status = 'active'
  join public.businesses b on b.id = p.business_id
  order by p.name;
$$;

-- Crew can see every photo on a job assigned to them, not only their own.
create function public.team_photo_read_allowed(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.photos p where p.storage_path = p_name and public.team_can_work(p.job_id));
$$;
create policy "crew read assigned job photos" on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and public.team_photo_read_allowed(name));

-- ---------------------------------------------------------------- crew: adding to their jobs

-- Work done from the price list. The price comes from the list; crew can't type one.
create function public.team_add_work(p_id uuid, p_job uuid, p_item uuid, p_qty integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare bid uuid; item record; qty integer; begin
  if not public.team_job_is_open(p_job) then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  select business_id into bid from public.jobs where id = p_job;
  select * into item from public.price_list_items where id = p_item and business_id = bid;
  if not found then raise exception using errcode = '23514', message = 'invalid item'; end if;
  if item.unit_cents is null then raise exception using errcode = '23514', message = 'item needs a price'; end if;
  -- haul away and cleanup is charged by price alone
  qty := case when item.catalog_id = 'haul' then 100 else p_qty end;
  if qty is null or qty not between 1 and 10000000 then raise exception using errcode = '23514', message = 'invalid quantity'; end if;
  if exists(select 1 from public.work_items where id = p_id and job_id = p_job and created_by = (select auth.uid())) then return p_id; end if;
  insert into public.work_items (id, business_id, job_id, price_item_ref, description, unit, qty_hundredths, unit_cents, kind)
    values (p_id, bid, p_job, coalesce(item.catalog_id, item.id::text), left(item.name, 300), item.unit, qty, item.unit_cents,
      case when item.catalog_id in ('trip', 'diag', 'haul') then 'fee' else 'labor' end);
  return p_id;
end $$;

create function public.team_add_price_item(p_id uuid, p_name text, p_unit text, p_cents integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare bid uuid; begin
  select business_id into bid from public.business_members where user_id = (select auth.uid()) and role = 'crew' and status = 'active';
  if bid is null then raise exception using errcode = '42501', message = 'crew only'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 160
    or p_unit not in ('sq_ft', 'board', 'linear_ft', 'hour', 'flat', 'each', 'cu_yd')
    or (p_cents is not null and p_cents not between 0 and 100000000) then
    raise exception using errcode = '23514', message = 'invalid item';
  end if;
  if exists(select 1 from public.price_list_items where id = p_id and business_id = bid and created_by = (select auth.uid())) then return p_id; end if;
  insert into public.price_list_items (id, business_id, name, unit, unit_cents, needs_review)
    values (p_id, bid, btrim(p_name), p_unit, p_cents, true);
  return p_id;
end $$;

create function public.team_suggest_change(p_id uuid, p_job uuid, p_description text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare bid uuid; begin
  if not public.team_job_is_open(p_job) then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 2000 then raise exception using errcode = '23514', message = 'invalid change'; end if;
  select business_id into bid from public.jobs where id = p_job;
  if exists(select 1 from public.change_requests where id = p_id and job_id = p_job and created_by = (select auth.uid())) then return p_id; end if;
  insert into public.change_requests (id, business_id, job_id, description) values (p_id, bid, p_job, btrim(p_description));
  return p_id;
end $$;

-- Crew remove their own hours, notes, work or suggestions until the invoice is sent.
create function public.team_remove_mine(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); job uuid; begin
  job := case p_kind
    when 'hours' then (select job_id from public.time_entries where id = p_id and created_by = me)
    when 'note' then (select job_id from public.notes where id = p_id and created_by = me)
    when 'work' then (select job_id from public.work_items where id = p_id and created_by = me)
    when 'change' then (select job_id from public.change_requests where id = p_id and created_by = me and status = 'open')
  end;
  if job is null or not public.team_job_is_open(job) then raise exception using errcode = '42501', message = 'entry unavailable'; end if;
  case p_kind
    when 'hours' then delete from public.time_entries where id = p_id;
    when 'note' then delete from public.notes where id = p_id;
    when 'work' then delete from public.work_items where id = p_id;
    else delete from public.change_requests where id = p_id;
  end case;
end $$;

-- ---------------------------------------------------------------- function access

do $$ declare signature text; begin
  foreach signature in array array[
    'public.create_team_invite(uuid,text,text)', 'public.request_to_join(text)', 'public.team_me()',
    'public.can_manage_member(uuid,text)', 'public.approve_member(uuid,uuid)', 'public.decline_member(uuid,uuid)',
    'public.change_member_role(uuid,uuid,text)', 'public.remove_member(uuid,uuid)', 'public.leave_team()',
    'public.team_members(uuid)', 'public.team_assigned_jobs()', 'public.team_job(uuid)', 'public.team_price_list()',
    'public.team_photo_read_allowed(text)', 'public.team_add_work(uuid,uuid,uuid,integer)',
    'public.team_add_price_item(uuid,text,text,integer)', 'public.team_suggest_change(uuid,uuid,text)',
    'public.team_remove_mine(text,uuid)'] loop
    execute 'revoke all on function ' || signature || ' from public, anon';
    execute 'grant execute on function ' || signature || ' to authenticated';
  end loop;
end $$;
revoke all on function public.normalize_team_code(text), public.stamp_created_by() from public, anon, authenticated;
