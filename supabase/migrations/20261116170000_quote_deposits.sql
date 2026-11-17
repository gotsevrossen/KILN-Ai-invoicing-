-- A customer can request only the exact deposit of the estimate opened by their valid link.
-- Returning a request never records money; existing payment reservations/ledger handle collection.
create function public.deposit_for_estimate_access(p_hash text,p_request_id uuid,p_token_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.estimate_access_links; e public.estimates; existing public.job_payment_requests;
 subtotal numeric; taxable numeric; amount integer; reserved bigint; total integer;
begin
 select * into l from public.estimate_access_links where token_hash=p_hash and revoked_at is null and expires_at>now();
 if l.id is null then raise exception 'not allowed'; end if;
 select * into e from public.estimates where id=l.estimate_id;
 if e.signed_at is null or not e.deposit_on or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'not allowed'; end if;
 perform 1 from public.jobs where id=e.job_id for update;
 if exists(select 1 from public.invoices where job_id=e.job_id and sent_at is not null) then raise exception 'Use the final invoice'; end if;
 select * into existing from public.job_payment_requests where job_id=e.job_id and kind='deposit';
 if existing.id is not null then
   if exists(select 1 from public.payments where request_id=existing.id and status in ('succeeded','processing')) then raise exception 'Already paid'; end if;
   update public.job_payment_requests set token_hash=p_token_hash,expires_at=now()+interval '30 days' where id=existing.id;
   return existing.id;
 end if;
 select coalesce(sum(round(qty_hundredths::numeric*unit_cents/100)),0),coalesce(sum(case when (kind='material' and e.tax_materials) or (kind<>'material' and e.tax_labor) then round(qty_hundredths::numeric*unit_cents/100) else 0 end),0)
 into subtotal,taxable from public.estimate_lines where estimate_id=e.id and not excluded;
 amount:=round((subtotal+round(taxable*coalesce(e.tax_rate_bps,0)/10000))*e.deposit_bps/10000)::integer;
 total:=public.job_agreed_total(e.job_id);
 select coalesce(sum(amount_cents),0) into reserved from public.job_payment_requests where job_id=e.job_id;
 if amount<1 or reserved+amount>total then raise exception 'Nothing due'; end if;
 insert into public.job_payment_requests(id,business_id,job_id,kind,label,amount_cents,token_hash,expires_at)
 values(p_request_id,e.business_id,e.job_id,'deposit',case when l.snapshot->>'lang'='es' then 'Depósito' else 'Deposit' end,amount,p_token_hash,now()+interval '30 days');
 return p_request_id;
end $$;
revoke all on function public.deposit_for_estimate_access(text,uuid,text) from public,anon,authenticated;
grant execute on function public.deposit_for_estimate_access(text,uuid,text) to service_role;
