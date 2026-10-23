-- KILN's AI helpers (Claude, called only from the `ai` Edge Function).
--   * ai_write_scope: the owner's switch for "write customer descriptions for me". Off until turned on.
--   * ai_usage: requests per business per day, so a stolen login or a bug can't run up the AI bill.
--     Only use_ai_quota() changes it; owners can read their own count.

alter table public.businesses
  add column ai_write_scope boolean not null default false;

create table public.ai_usage (
  business_id uuid not null references public.businesses on delete cascade,
  day date not null default current_date,
  requests integer not null default 0 check (requests >= 0),
  primary key (business_id, day)
);

alter table public.ai_usage enable row level security;
create policy "members read" on public.ai_usage for select to authenticated using (public.is_member(business_id));
-- no insert, update, or delete policy: counting happens only in use_ai_quota()

-- Counts one AI request for the caller's business and returns the business id.
-- Refuses when the caller has no business or the business is over today's limit.
-- The limit is fixed here, never passed in, so the caller can't raise it.
create function public.use_ai_quota() returns uuid
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
    where m.user_id = (select auth.uid()) order by m.created_at limit 1;
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
  return bid;
end;
$$;

revoke execute on function public.use_ai_quota() from public, anon;
grant execute on function public.use_ai_quota() to authenticated;
