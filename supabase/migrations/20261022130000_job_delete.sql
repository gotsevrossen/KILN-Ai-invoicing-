-- Deleting a job made by accident. Its hours, notes, drafts, and unanswered change orders
-- go with it (they cascade). A job with a sent or signed document is a business record:
-- the estimate, invoice, or change order the customer saw must stay, so it can't be deleted.

create function public.check_job_delete() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.estimates e where e.job_id = old.id and e.sent_at is not null)
     or exists (select 1 from public.invoices i where i.job_id = old.id and i.sent_at is not null)
     or exists (select 1 from public.change_orders c where c.job_id = old.id and (c.signed_at is not null or c.declined_at is not null)) then
    raise exception 'a job with a sent or signed document can''t be deleted';
  end if;
  return old;
end;
$$;

create trigger jobs_delete_check before delete on public.jobs
  for each row execute function public.check_job_delete();
