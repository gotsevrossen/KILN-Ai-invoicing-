-- Optional owner-managed trade worksheets. Foreign job ownership is checked independently of business membership.
create table public.job_trade_worksheets (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 250000)
);
alter table public.job_trade_worksheets enable row level security;
create policy trade_worksheet_read on public.job_trade_worksheets for select to authenticated
using (public.is_owner(business_id));
create policy trade_worksheet_insert on public.job_trade_worksheets for insert to authenticated
with check (public.is_owner(business_id) and exists(select 1 from public.jobs j where j.id = job_trade_worksheets.job_id and j.business_id = job_trade_worksheets.business_id));
create policy trade_worksheet_update on public.job_trade_worksheets for update to authenticated
using (public.is_owner(business_id)) with check (public.is_owner(business_id) and exists(select 1 from public.jobs j where j.id = job_trade_worksheets.job_id and j.business_id = job_trade_worksheets.business_id));
create policy trade_worksheet_delete on public.job_trade_worksheets for delete to authenticated using (public.is_owner(business_id));
create table public.trade_scope_templates (
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 12000),
  primary key (business_id, name)
);
alter table public.trade_scope_templates enable row level security;
create policy trade_template_owner on public.trade_scope_templates for all to authenticated
using (public.is_owner(business_id)) with check (public.is_owner(business_id));
grant select, insert, update, delete on public.job_trade_worksheets, public.trade_scope_templates to authenticated;
