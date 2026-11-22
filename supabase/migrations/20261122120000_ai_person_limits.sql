-- Per-person AI limits (Nov 22).
--   * ai_person_usage: requests per person, per AI helper, per day. On top of the business's 300 a day,
--     so one person (or one stolen login) can't use up the whole team's AI, and the chat, the most
--     costly helper per request, has its own cap. Only use_ai_quota_for() changes it; each person can
--     read their own counts.
--   * KILN-wide limit raised from 2,000 to 10,000 requests a day: a typical owner makes about 9 a day,
--     so 2,000 would have stopped AI for everyone at roughly 220 active businesses.

create table public.ai_person_usage (
  user_id uuid not null references auth.users on delete cascade,
  business_id uuid not null references public.businesses on delete cascade,
  day date not null default current_date,
  task text not null check (char_length(task) between 1 and 40),
  requests integer not null default 0 check (requests >= 0),
  primary key (user_id, day, task)
);

alter table public.ai_person_usage enable row level security;
create policy "own read" on public.ai_person_usage for select to authenticated using (user_id = (select auth.uid()));
-- no insert, update, or delete policy: counting happens only in use_ai_quota_for()

-- A person's daily limit for one AI helper. Fixed here, never passed in, so the caller can't raise it.
-- Null: not an AI helper KILN has.
create function public.ai_person_limit(p_task text) returns integer
language sql immutable set search_path = '' as $$
  select case p_task
    when 'assistant' then 60      -- KILN chat: the most tokens per request
    when 'command' then 60        -- "Tell KILN" on Capture
    when 'receipt' then 40        -- receipt photos
    when 'receiptReview' then 60
    when 'tags' then 60           -- photo batches
    when 'prices' then 10         -- old invoices, up to 3 photos each
    when 'guess' then 50
    when 'missed' then 50
    when 'scope' then 50
    when 'change' then 50
    when 'invoiceReview' then 50
    when 'findJobs' then 50
  end;
$$;

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

-- The older counter (no longer called by the AI function) keeps the same KILN-wide limit.
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
  if (select sum(requests) from public.ai_usage where day = current_date) > 10000 then
    raise exception 'KILN''s daily AI limit reached' using errcode = 'KL429';
  end if;
  return bid;
end;
$$;

revoke all on function public.ai_person_limit(text) from public, anon;
grant execute on function public.ai_person_limit(text) to authenticated;
revoke all on function public.use_ai_quota_for(text) from public, anon;
grant execute on function public.use_ai_quota_for(text) to authenticated;
