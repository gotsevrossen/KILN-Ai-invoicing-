-- KILN subscriptions (Nov 22). Plan: docs/subscription-paywall-plan-2026-11-22.md.
--   * Priced by team size (owner, managers and crew with an active place): 1-3 people, 4-6, 7 or more.
--     Monthly or yearly, bought in the App Store or Google Play through RevenueCat.
--   * business_subscriptions: one row per business, written only by the subscriptions server function
--     (save_business_subscription, service role). Members can read their own business's row.
--   * Without access, a business can't add new work (jobs, estimates, invoices, lines, change orders,
--     work, hours, receipts, photos, notes) or use AI. Reading, exports, recording payments and every
--     customer link keep working.
--   * A team bigger than its plan can't approve anyone new. After 7 days over the size, the people
--     beyond it (newest first, never the owner) become read only.
--   * Turned off until the store setup has been tested: subscriptions_enforced() returns false, so
--     nothing changes yet. Switching it on is a one-line migration.
--   * Businesses that exist today belong to the interview testers: free ('comped') until public launch.

create table public.business_subscriptions (
  business_id uuid primary key references public.businesses on delete cascade,
  status text not null check (status in ('comped', 'trial', 'active', 'grace', 'expired')),
  store text check (store in ('apple', 'google', 'web', 'kiln')),
  product_id text check (char_length(product_id) <= 120),
  expires_at timestamptz,
  -- people the plan covers; null means no limit (7+ plan, or free for testers)
  team_limit integer check (team_limit > 0),
  -- when the team first grew past team_limit; cleared once it fits again
  over_limit_since timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.business_subscriptions enable row level security;
create policy "members read" on public.business_subscriptions for select to authenticated using (public.is_member(business_id));
-- no insert, update, or delete policy: only save_business_subscription() writes it

insert into public.business_subscriptions (business_id, status, store)
  select id, 'comped', 'kiln' from public.businesses
  on conflict (business_id) do nothing;

-- ---------------------------------------------------------------- the rules

-- Off until the store setup is tested. Switch on with a migration that returns true.
create function public.subscriptions_enforced() returns boolean
language sql stable set search_path = '' as $$ select false $$;

-- How many people a store product covers. Fixed here, never taken from the app.
-- Google Play ids look like "kiln_team_4_6:monthly", so only the start is compared.
create function public.team_limit_for(p_product text) returns integer
language sql immutable set search_path = '' as $$
  select case
    when p_product like 'kiln_team_7_plus%' then null
    when p_product like 'kiln_team_4_6%' then 6
    else 3
  end;
$$;

create function public.business_team_size(bid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.business_members where business_id = bid and status = 'active';
$$;

-- Trial, paid, in the store's billing grace period, or free for testers. A few hours of slack covers
-- a renewal that the stores haven't reported yet.
create function public.business_has_access(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not public.subscriptions_enforced() or exists (
    select 1 from public.business_subscriptions s
    where s.business_id = bid and (
      s.status = 'comped'
      or (s.status in ('trial', 'active', 'grace') and s.expires_at > now() - interval '6 hours')));
$$;

-- Access, and not one of the people beyond the plan's size once the team has been too big for 7 days.
-- Order: the owner first, then everyone else by when they were approved.
create function public.member_can_write(bid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.business_has_access(bid) and not (public.subscriptions_enforced() and exists (
    select 1 from public.business_subscriptions s
    where s.business_id = bid and s.team_limit is not null
      and s.over_limit_since is not null and s.over_limit_since < now() - interval '7 days'
      and uid in (
        select m.user_id from public.business_members m
        where m.business_id = bid and m.status = 'active'
        order by (m.role = 'owner') desc, coalesce(m.approved_at, m.created_at), m.user_id
        offset s.team_limit)));
$$;

-- Keeps over_limit_since right whenever the plan or the team changes.
create function public.subscription_team_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.over_limit_since := case
    -- an update that doesn't set it keeps the old value, so the 7 days count from the first time
    when new.team_limit is not null and public.business_team_size(new.business_id) > new.team_limit
      then coalesce(new.over_limit_since, now())
  end;
  return new;
end $$;
create trigger subscription_team_check before insert or update on public.business_subscriptions
  for each row execute function public.subscription_team_check();

create function public.subscription_members_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- touching the row re-runs subscription_team_check()
  update public.business_subscriptions set over_limit_since = over_limit_since
    where business_id = coalesce(new.business_id, old.business_id);
  return null;
end $$;
create trigger subscription_members_changed after insert or update of status or delete on public.business_members
  for each row execute function public.subscription_members_changed();

-- New work needs access. Only people signed in to the app are checked: server functions and
-- customer links (service role or no sign-in) never are, so customers can always sign and pay.
create function public.require_subscription() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select auth.role()), '') <> 'authenticated' then return new; end if;
  if not public.member_can_write(new.business_id, (select auth.uid())) then
    raise exception using errcode = 'KL402', message = 'subscription_needed';
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['jobs', 'estimates', 'estimate_lines', 'invoices', 'invoice_lines', 'change_orders',
    'work_items', 'time_entries', 'receipts', 'receipt_items', 'photos', 'notes'] loop
    execute format('create trigger require_subscription before insert on public.%I for each row execute function public.require_subscription()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- written by the server only

-- The subscriptions server function saves what RevenueCat reports. A tester's free access stays
-- until a real purchase replaces it.
create function public.save_business_subscription(p_business uuid, p_status text, p_store text, p_product text, p_expires timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('trial', 'active', 'grace', 'expired') then
    raise exception using errcode = '23514', message = 'invalid status';
  end if;
  if not exists (select 1 from public.businesses where id = p_business) then
    raise exception using errcode = 'P0002', message = 'unknown business';
  end if;
  insert into public.business_subscriptions as s (business_id, status, store, product_id, expires_at, team_limit, updated_at)
    values (p_business, p_status, p_store, p_product, p_expires, public.team_limit_for(p_product), now())
    on conflict (business_id) do update set status = excluded.status, store = excluded.store, product_id = excluded.product_id,
      expires_at = excluded.expires_at, team_limit = excluded.team_limit, updated_at = now()
    where s.status <> 'comped' or excluded.status in ('trial', 'active', 'grace');
end $$;

-- ---------------------------------------------------------------- for the app

-- The caller's business's plan, team size and what they may do. Crew can call it too.
create function public.my_subscription() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m record; s record;
begin
  select bm.business_id, bm.role into m from public.business_members bm
    where bm.user_id = (select auth.uid()) and bm.status = 'active' order by bm.created_at limit 1;
  if m.business_id is null then raise exception using errcode = '42501', message = 'no business'; end if;
  select * into s from public.business_subscriptions where business_id = m.business_id;
  return jsonb_build_object(
    'businessId', m.business_id, 'enforced', public.subscriptions_enforced(),
    'hasAccess', public.business_has_access(m.business_id),
    'canWrite', public.member_can_write(m.business_id, (select auth.uid())),
    'status', s.status, 'store', s.store, 'productId', s.product_id, 'expiresAt', s.expires_at,
    'teamLimit', s.team_limit, 'teamSize', public.business_team_size(m.business_id),
    'overLimitSince', s.over_limit_since, 'role', m.role);
end $$;

-- ---------------------------------------------------------------- existing steps that now check the plan

-- Approving someone: the business needs access, and the team must still fit the plan.
create or replace function public.approve_member(p_business uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare member record; worker uuid; plan_limit integer; begin
  select * into member from public.business_members where business_id = p_business and user_id = p_user and status = 'pending' for update;
  if not found or not public.can_manage_member(p_business, member.role) then raise exception using errcode = '42501', message = 'request unavailable'; end if;
  if not public.business_has_access(p_business) then
    raise exception using errcode = 'KL402', message = 'subscription_needed';
  end if;
  select team_limit into plan_limit from public.business_subscriptions where business_id = p_business;
  if public.subscriptions_enforced() and plan_limit is not null and public.business_team_size(p_business) + 1 > plan_limit then
    raise exception using errcode = 'KL403', message = 'plan_full';
  end if;
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

-- AI needs access too (same function as 20261122120000, plus the subscription check).
create or replace function public.use_ai_quota_for(p_task text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  bid uuid;
  member_role text;
  person_limit integer := public.ai_person_limit(p_task);
  used integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  if person_limit is null then
    raise exception using errcode = '22023', message = 'unknown AI helper';
  end if;
  select m.business_id, m.role into bid, member_role from public.business_members m
    where m.user_id = (select auth.uid()) and m.status = 'active'
    order by m.created_at limit 1;
  if bid is null then
    raise exception 'this account has no business yet';
  end if;
  if member_role = 'crew' and p_task not in ('receipt', 'receiptReview', 'assistant') then
    raise exception using errcode = '42501', message = 'not allowed for crew';
  end if;
  if not public.member_can_write(bid, (select auth.uid())) then
    raise exception using errcode = 'KL402', message = 'subscription_needed';
  end if;
  -- a refused request rolls back, so it isn't counted anywhere
  insert into public.ai_person_usage as p (user_id, business_id, day, task, requests)
    values ((select auth.uid()), bid, current_date, p_task, 1)
    on conflict (user_id, day, task) do update set requests = p.requests + 1, business_id = excluded.business_id
    returning p.requests into used;
  if used > person_limit then
    raise exception 'your daily limit for this AI helper is reached' using errcode = 'KL430';
  end if;
  insert into public.ai_usage as u (business_id, day, requests) values (bid, current_date, 1)
    on conflict (business_id, day) do update set requests = u.requests + 1
    returning u.requests into used;
  if used > 300 then
    raise exception 'daily AI limit reached' using errcode = 'KL429';
  end if;
  if (select sum(requests) from public.ai_usage where day = current_date) > 10000 then
    raise exception 'KILN''s daily AI limit reached' using errcode = 'KL429';
  end if;
  return bid;
end;
$$;

-- ---------------------------------------------------------------- who may call what

revoke all on function public.subscriptions_enforced(), public.team_limit_for(text), public.business_team_size(uuid),
  public.business_has_access(uuid), public.member_can_write(uuid, uuid), public.subscription_team_check(),
  public.subscription_members_changed(), public.require_subscription(),
  public.save_business_subscription(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.save_business_subscription(uuid, text, text, text, timestamptz) to service_role;
revoke all on function public.my_subscription() from public, anon;
grant execute on function public.my_subscription() to authenticated;
