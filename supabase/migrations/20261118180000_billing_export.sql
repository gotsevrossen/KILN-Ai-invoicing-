create function public.billing_export_page(p_business uuid,p_kind text,p_after uuid) returns table(record_id uuid, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner(p_business) then raise sqlstate '42501' using message='Not allowed'; end if;
  if p_kind='invoice' then
    return query select i.id, jsonb_build_object('number',i.number,'customer',c.name,'job',j.title,'issuedOn',i.issued_on,
      'dueOn',i.issued_on+i.due_days,'status',case when i.paid_at is not null then 'paid' when i.sent_at is not null then 'issued' else 'draft' end,
      'total',amount.total,'paid',case when i.paid_at is not null then amount.total else paid.amount end)
    from public.invoices i join public.jobs j on j.id=i.job_id join public.customers c on c.id=j.customer_id
    cross join lateral (select public.invoice_total_cents(i.id) as total) amount
    cross join lateral (select coalesce(sum(p.amount_cents),0) as amount from public.payments p where p.job_id=i.job_id and p.status='succeeded') paid
    where i.business_id=p_business and i.sent_at is not null and (p_after is null or i.id>p_after) order by i.id limit 100;
  elsif p_kind='payment' then
    return query select p.id,jsonb_build_object('number',i.number,'customer',c.name,'job',j.title,'jobId',p.job_id,'date',p.paid_at,
      'amount',p.amount_cents,'method',coalesce(p.alternative_method,p.method))
    from public.payments p left join public.invoices i on i.id=p.invoice_id
    left join public.jobs j on j.id=p.job_id left join public.customers c on c.id=j.customer_id
    where p.business_id=p_business and p.status='succeeded' and (p_after is null or p.id>p_after) order by p.id limit 100;
  elsif p_kind='archived' then
    return query select d.id,d.snapshot || jsonb_build_object('archivedJobId',d.job_id) from public.saved_documents d
    where d.business_id=p_business and d.document_type='invoice' and (p_after is null or d.id>p_after) order by d.id limit 100;
  else raise exception 'Invalid export kind'; end if;
end $$;
revoke all on function public.billing_export_page(uuid,text,uuid) from public, anon;
grant execute on function public.billing_export_page(uuid,text,uuid) to authenticated;

create function public.archive_invoice_payments() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.snapshot := jsonb_set(new.snapshot,'{payments}',coalesce((select jsonb_agg(jsonb_build_object(
    'amountCents',p.amount_cents,'method',coalesce(p.alternative_method,p.method),'paidAt',p.paid_at,'status',p.status) order by p.paid_at,p.id)
    from public.payments p where p.business_id=new.business_id and p.job_id=new.job_id),'[]'::jsonb));
  return new;
end $$;
create trigger archive_invoice_payments before insert on public.saved_documents
  for each row when (new.document_type='invoice') execute function public.archive_invoice_payments();
