-- Owner planning and internal job costs. Workers here are not authenticated logins.
-- Financial costs never use the customer selling rate and are never exposed to helpers.
alter table public.jobs add constraint operations_job_business unique (id, business_id);
alter table public.time_entries add constraint operations_time_business unique (id, business_id);

create table public.operations_workers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  loaded_rate_cents integer not null check (loaded_rate_cents between 0 and 999999999),
  archived boolean not null default false,
  unique (id, business_id)
);
create table public.operations_visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  job_id uuid not null,
  worker_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default '' check (length(note) <= 1000),
  check (ends_at > starts_at and ends_at <= starts_at + interval '7 days'),
  foreign key (job_id, business_id) references public.jobs(id, business_id) on delete cascade,
  foreign key (worker_id, business_id) references public.operations_workers(id, business_id) on delete restrict
);
create table public.operations_labor_costs (
  time_entry_id uuid primary key,
  business_id uuid not null references public.businesses on delete cascade,
  worker_id uuid not null,
  loaded_rate_cents integer not null check (loaded_rate_cents between 0 and 999999999),
  foreign key (time_entry_id, business_id) references public.time_entries(id, business_id) on delete cascade,
  foreign key (worker_id, business_id) references public.operations_workers(id, business_id) on delete restrict
);
create table public.operations_budgets (
  job_id uuid primary key,
  business_id uuid not null references public.businesses on delete cascade,
  labor_cents integer not null default 0 check (labor_cents between 0 and 999999999),
  material_cents integer not null default 0 check (material_cents between 0 and 999999999),
  other_cents integer not null default 0 check (other_cents between 0 and 999999999),
  actual_other_cents integer not null default 0 check (actual_other_cents between 0 and 999999999),
  foreign key (job_id, business_id) references public.jobs(id, business_id) on delete cascade
);
create index on public.operations_visits (business_id, starts_at);
create index on public.operations_visits (worker_id, starts_at, ends_at);
create index on public.operations_labor_costs (business_id);

-- RLS is the boundary, not the owner-only label in the app.
do $$ declare table_name text; begin
  foreach table_name in array array['operations_workers', 'operations_visits', 'operations_labor_costs', 'operations_budgets'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy "owners manage operations" on public.%I for all to authenticated using (public.is_owner(business_id)) with check (public.is_owner(business_id))', table_name);
  end loop;
end $$;

-- Serializing on the worker row makes concurrent overlapping visits safe too.
create function public.check_operations_visit() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.operations_workers where id = new.worker_id and business_id = new.business_id and not archived for update;
  if not found then raise exception using errcode = '23514', message = 'worker unavailable'; end if;
  if exists (select 1 from public.operations_visits v where v.worker_id = new.worker_id
      and v.id <> new.id and v.starts_at < new.ends_at and v.ends_at > new.starts_at) then
    raise exception using errcode = '23P01', message = 'visit overlaps';
  end if;
  return new;
end $$;
create trigger operations_visit_window before insert or update on public.operations_visits
for each row execute function public.check_operations_visit();

-- Freeze the worker's internal loaded rate at attribution. Changing a worker's
-- rate later does not rewrite past costs. Reassigning explicitly takes the new rate.
create function public.snapshot_operations_labor_rate() returns trigger
language plpgsql set search_path = '' as $$
declare worker_rate integer; begin
  if tg_op = 'INSERT' then
    select loaded_rate_cents into worker_rate from public.operations_workers
      where id = new.worker_id and business_id = new.business_id and not archived;
  elsif new.worker_id is distinct from old.worker_id then
    select loaded_rate_cents into worker_rate from public.operations_workers
      where id = new.worker_id and business_id = new.business_id and not archived;
  else
    new.loaded_rate_cents := old.loaded_rate_cents;
    return new;
  end if;
  if worker_rate is null then raise exception using errcode = '23514', message = 'worker unavailable'; end if;
  new.loaded_rate_cents := worker_rate;
  return new;
end $$;
create trigger operations_labor_rate before insert or update on public.operations_labor_costs
for each row execute function public.snapshot_operations_labor_rate();
