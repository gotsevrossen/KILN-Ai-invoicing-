-- Work the owner did on a job, typed in by hand ("Replaced shutoff valve, 1 × $85").
-- Each item becomes its own line on the job's invoice. Once that invoice is sent, the
-- items are part of a business record and can't be added, changed, or removed.

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  job_id uuid not null references public.jobs on delete cascade,
  worked_on date not null default current_date,
  -- the price list item it came from, if any (the app's price list ids are text)
  price_item_ref text check (length(price_item_ref) <= 120),
  description text not null check (length(trim(description)) between 1 and 300),
  unit text not null default 'flat' check (unit in ('sq_ft', 'board', 'linear_ft', 'hour', 'flat', 'each', 'cu_yd')),
  qty_hundredths integer not null check (qty_hundredths between 1 and 100000000),
  unit_cents integer not null check (unit_cents between 0 and 100000000),
  kind text not null default 'labor' check (kind in ('labor', 'material', 'fee')),
  created_at timestamptz not null default now()
);

create index on public.work_items (business_id);
create index on public.work_items (job_id);

alter table public.work_items enable row level security;
create policy "members read" on public.work_items for select to authenticated using (public.is_member(business_id));
create policy "members insert" on public.work_items for insert to authenticated with check (public.is_member(business_id));
create policy "members update" on public.work_items for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy "members delete" on public.work_items for delete to authenticated using (public.is_member(business_id));

create trigger work_items_job_same_business before insert or update on public.work_items
  for each row execute function public.same_business_check('jobs', 'job_id');

-- the job's invoice was sent: its work is on record
create function public.block_invoiced_work() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (
    select 1 from public.invoices i
    where i.job_id in (old.job_id, new.job_id) and i.sent_at is not null
  ) then
    raise exception 'this job''s invoice was sent; its work can''t be changed';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger work_items_invoiced before insert or update or delete on public.work_items
  for each row execute function public.block_invoiced_work();
