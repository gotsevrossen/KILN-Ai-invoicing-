create table public.invoice_email_deliveries (
  id uuid primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  created_at timestamptz not null default now(),
  provider_id uuid unique,
  status text not null default 'sending' check (status in ('sending','accepted','delivered','delayed','failed','unknown'))
);
create index invoice_email_deliveries_latest on public.invoice_email_deliveries(invoice_id, created_at desc);
alter table public.invoice_email_deliveries enable row level security;
revoke all on public.invoice_email_deliveries from public, anon, authenticated;
grant select, insert, update on public.invoice_email_deliveries to service_role;

-- Serialize explicit sends even when two devices are open on the same invoice.
create function public.reserve_invoice_email(p_invoice uuid, p_attempt uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.invoices where id = p_invoice and sent_at is not null for update;
  if not found then raise exception 'invoice must be issued'; end if;
  if exists (select 1 from public.invoice_email_deliveries where id = p_attempt and invoice_id = p_invoice) then
    return false;
  end if;
  if exists (select 1 from public.invoice_email_deliveries
    where invoice_id = p_invoice and created_at > now() - interval '30 seconds') then
    raise sqlstate 'PT429' using message = 'wait before resending';
  end if;
  insert into public.invoice_email_deliveries(id, invoice_id) values (p_attempt, p_invoice);
  return true;
end $$;
revoke all on function public.reserve_invoice_email(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_invoice_email(uuid,uuid) to service_role;
