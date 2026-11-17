-- Reusable owner-priced service packages. Copies on estimates remain independent.
create function public.valid_service_package_lines(lines jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if jsonb_typeof(lines) <> 'array' then return false; end if;
  if jsonb_array_length(lines) < 1 or jsonb_array_length(lines) > 100 then return false; end if;
  for item in select value from jsonb_array_elements(lines) loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'description') is distinct from 'string'
      or length(btrim(item->>'description')) not between 1 and 300
      or coalesce(item->>'unit','') not in ('sq_ft','board','linear_ft','hour','flat','each','cu_yd')
      or jsonb_typeof(item->'qtyHundredths') is distinct from 'number'
      or (item->>'qtyHundredths')::numeric not between 1 and 999999
      or trunc((item->>'qtyHundredths')::numeric) <> (item->>'qtyHundredths')::numeric
      or not (item ? 'unitCents') then return false; end if;
    if item->'unitCents' <> 'null'::jsonb then
      if jsonb_typeof(item->'unitCents') <> 'number'
        or (item->>'unitCents')::numeric not between 0 and 99999999
        or trunc((item->>'unitCents')::numeric) <> (item->>'unitCents')::numeric then return false; end if;
    end if;
    if item ? 'kind' and coalesce(item->>'kind','') not in ('labor','material','fee') then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create function public.valid_service_package_scope(scope jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare entry record;
begin
  if jsonb_typeof(scope) <> 'object' then return false; end if;
  for entry in select key, value from jsonb_each(scope) loop
    if entry.key not in ('notes','details','exclusions','location')
      or jsonb_typeof(entry.value) <> 'string' or length(entry.value #>> '{}') > 2000 then return false; end if;
  end loop;
  return true;
end $$;

create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  lines jsonb not null check (public.valid_service_package_lines(lines)),
  scope jsonb not null default '{}'::jsonb check (public.valid_service_package_scope(scope)),
  minimum_cents integer not null default 0 check (minimum_cents between 0 and 99999999),
  after_hours_cents integer not null default 0 check (after_hours_cents between 0 and 99999999),
  created_at timestamptz not null default now()
);
create index on public.service_packages(business_id);
alter table public.service_packages enable row level security;
create policy "members read packages" on public.service_packages for select to authenticated using (public.is_member(business_id));
create policy "owners insert packages" on public.service_packages for insert to authenticated with check (public.is_owner(business_id));
create policy "owners update packages" on public.service_packages for update to authenticated using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owners delete packages" on public.service_packages for delete to authenticated using (public.is_owner(business_id));
grant select, insert, update, delete on public.service_packages to authenticated;
