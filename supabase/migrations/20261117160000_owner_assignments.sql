-- Owners can be assigned jobs too (Nov 17 2026).
--
-- The owner or any active manager can put any active team member on a job: the owner, a manager
-- or a crew member, including themselves. For the owner and managers an assignment only says who
-- looks after the job; they already see and edit every job. Crew access is unchanged:
-- team_can_work() still requires the crew role.

create or replace function public.assign_team_job(p_business uuid, p_user uuid, p_job uuid, p_assigned boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_manager(p_business) then raise exception using errcode = '42501', message = 'managers only'; end if;
  if not exists(select 1 from public.business_members where business_id = p_business and user_id = p_user
      and role in ('owner', 'manager', 'crew') and status = 'active')
    or not exists(select 1 from public.jobs where id = p_job and business_id = p_business) then
    raise exception using errcode = '23514', message = 'invalid assignment';
  end if;
  if p_assigned then
    insert into public.team_job_assignments (business_id, user_id, job_id) values (p_business, p_user, p_job) on conflict do nothing;
  else
    delete from public.team_job_assignments where business_id = p_business and user_id = p_user and job_id = p_job;
  end if;
end $$;

revoke all on function public.assign_team_job(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.assign_team_job(uuid, uuid, uuid, boolean) to authenticated;
