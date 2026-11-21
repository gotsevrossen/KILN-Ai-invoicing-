-- KILN chat for crew (Nov 21): crew may use the 'assistant' AI task, limited to their assigned jobs.
-- The AI function asks ai_chat_scope() who is calling, and never trusts the app's own job list for crew.

create or replace function public.use_ai_quota_for(p_task text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  bid uuid;
  member_role text;
  used integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  select m.business_id, m.role into bid, member_role from public.business_members m
    where m.user_id = (select auth.uid()) and m.status = 'active'
    order by m.created_at limit 1;
  if bid is null then
    raise exception 'this account has no business yet';
  end if;
  if member_role = 'crew' and coalesce(p_task, '') not in ('receipt', 'receiptReview', 'assistant') then
    raise exception using errcode = '42501', message = 'not allowed for crew';
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

-- Who is chatting: their role, and for crew the only jobs they may ask about and whether the
-- owner lets crew see prices. Owners and managers get every job (jobIds null).
create function public.ai_chat_scope() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m record; prices boolean;
begin
  select bm.business_id, bm.role into m from public.business_members bm
    where bm.user_id = (select auth.uid()) and bm.status = 'active' order by bm.created_at limit 1;
  if m.business_id is null then raise exception using errcode = '42501', message = 'no business'; end if;
  if m.role <> 'crew' then return jsonb_build_object('role', m.role, 'jobIds', null, 'prices', true); end if;
  select b.crew_sees_prices into prices from public.businesses b where b.id = m.business_id;
  return jsonb_build_object('role', 'crew', 'prices', coalesce(prices, false), 'jobIds', coalesce((
    select jsonb_agg(a.job_id) from public.team_job_assignments a
    where a.user_id = (select auth.uid()) and a.business_id = m.business_id and public.team_can_work(a.job_id)), '[]'::jsonb));
end $$;
revoke all on function public.ai_chat_scope() from public, anon;
grant execute on function public.ai_chat_scope() to authenticated;
