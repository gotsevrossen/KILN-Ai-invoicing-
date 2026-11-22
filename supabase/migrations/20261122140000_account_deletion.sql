-- Deleting your KILN account (Nov 22). Required by the App Store and Google Play.
--   * Anyone can ask from Settings or the web page /delete-account. The account is removed 30 days
--     later (Rossen's call): signing back in and tapping "Keep my account" before then cancels it.
--   * An owner's request takes the whole business with it: jobs, customers, documents, photos,
--     receipts, team links and payment records. A manager's or crew member's request removes only
--     their own login; the work they did stays with the business.
--   * The hourly job-cleanup run (functions/job-cleanup, scheduled) carries it out: purge_account()
--     below erases the business's rows and queues its files, then the function deletes the login.
--   * An owner's own Stripe account stays theirs (it's with Stripe); KILN only forgets the link to it.

create table public.account_deletions (
  user_id uuid primary key references auth.users on delete cascade,
  -- set for an owner: the business that goes too
  business_id uuid references public.businesses on delete set null,
  requested_at timestamptz not null default now(),
  delete_after timestamptz not null
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from public, anon, authenticated;
-- no policies: only the functions below read or change it

-- "Who did this" columns (created_by, worker_user_id, approved_by...) must not stop a person's login
-- from being deleted. Clearing them would count as editing sent documents, which the locks refuse,
-- so the link to the login is dropped and the id stays as a plain value nobody can trace once the
-- login is gone. Links that delete with the login (team membership, AI counts) stay.
do $$ declare c record; begin
  for c in
    select con.conname, rel.relname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where con.contype = 'f' and con.confrelid = 'auth.users'::regclass and ns.nspname = 'public'
      and con.confdeltype <> 'c' and rel.relname <> 'account_deletions'
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;

-- ---------------------------------------------------------------- for the app

-- Asks to delete the caller's account in 30 days. Asking again keeps the first date.
create function public.request_account_deletion() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); m record; due timestamptz;
begin
  if uid is null then raise exception using errcode = '42501', message = 'not signed in'; end if;
  select bm.business_id, bm.role into m from public.business_members bm
    where bm.user_id = uid order by (bm.status = 'active') desc, bm.created_at limit 1;
  insert into public.account_deletions (user_id, business_id, delete_after)
    values (uid, case when m.role = 'owner' then m.business_id end, now() + interval '30 days')
    on conflict (user_id) do nothing;
  select delete_after into due from public.account_deletions where user_id = uid;
  if m.business_id is not null then
    insert into public.audit_log (business_id, actor, action, entity, entity_id)
      values (m.business_id, uid, 'account.deletion_requested', 'account', uid);
  end if;
  return due;
end $$;

create function public.cancel_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); bid uuid;
begin
  if uid is null then raise exception using errcode = '42501', message = 'not signed in'; end if;
  delete from public.account_deletions where user_id = uid;
  select business_id into bid from public.business_members where user_id = uid order by created_at limit 1;
  if found and bid is not null then
    insert into public.audit_log (business_id, actor, action, entity, entity_id)
      values (bid, uid, 'account.deletion_cancelled', 'account', uid);
  end if;
end $$;

-- When the caller's account will be deleted, or null.
create function public.my_account_deletion() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select delete_after from public.account_deletions where user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------- for the scheduled run only

create function public.account_deletions_due() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.account_deletions where delete_after <= now() order by delete_after limit 10;
$$;

-- Erases an owner's business (rows now, files queued for the cleanup run) and returns what was done.
-- For a manager or crew member there's nothing to erase here: their membership goes with their login.
-- Safe to run again if deleting the login failed the first time.
create function public.purge_account(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare req record; bid uuid; queued integer := 0;
begin
  select * into req from public.account_deletions where user_id = p_user and delete_after <= now() for update;
  if not found then raise exception using errcode = '42501', message = 'account not due for deletion'; end if;
  -- only while they're still its owner (an ownership change since then means the business stays)
  select bm.business_id into bid from public.business_members bm
    where bm.user_id = p_user and bm.business_id = req.business_id and bm.role = 'owner';
  if bid is null then return jsonb_build_object('business', null, 'files', 0); end if;

  perform set_config('kiln.purge', 'on', true);
  insert into public.job_cleanup_files (business_id, bucket, path)
    select bid, f.bucket, f.path from (
      select 'job-photos' as bucket, storage_path as path from public.photos where business_id = bid
      union all select 'voice-notes', storage_path from public.voice_notes where business_id = bid
      union all select 'receipts', storage_path from public.receipts where business_id = bid
    ) f where f.path is not null and public.owned_storage_path(bid, f.path)
    on conflict do nothing;
  get diagnostics queued = row_count;

  -- rows that don't go away with the business on their own, and evidence the locks keep
  delete from public.signatures where business_id = bid;
  delete from public.document_delivery_events where business_id = bid;
  delete from public.estimate_access_links where business_id = bid;
  delete from public.share_links where business_id = bid;
  delete from public.invoice_payment_reservations r using public.invoices i where r.invoice_id = i.id and i.business_id = bid;
  delete from public.payments where business_id = bid;
  delete from public.job_payment_requests where business_id = bid;
  delete from public.businesses where id = bid;
  perform set_config('kiln.purge', 'off', true);
  return jsonb_build_object('business', bid, 'files', queued);
end $$;

revoke all on function public.request_account_deletion(), public.cancel_account_deletion(), public.my_account_deletion(),
  public.account_deletions_due(), public.purge_account(uuid) from public, anon, authenticated;
grant execute on function public.request_account_deletion(), public.cancel_account_deletion(), public.my_account_deletion() to authenticated;
grant execute on function public.account_deletions_due(), public.purge_account(uuid) to service_role;
