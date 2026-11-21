-- Deposits take the same pay options as invoices (Nov 20): Apple Pay / Google Pay, bank, and a
-- typed card. A typed card stays distinct from the wallets in the ledger, as on invoices.
alter table public.job_payment_requests drop constraint job_payment_requests_intent_method_check;
alter table public.job_payment_requests add check (intent_method in ('wallet', 'bank', 'card'));

create or replace function public.reserve_job_payment(p_id uuid,p_method text) returns void
language plpgsql security definer set search_path='' as $$
declare r record; received bigint; total integer;
begin
 select * into r from public.job_payment_requests where id=p_id;
 if not found then raise exception 'Missing request'; end if;
 perform 1 from public.jobs where id=r.job_id for update;
 select * into r from public.job_payment_requests where id=p_id;
 if exists(select 1 from public.invoices where job_id=r.job_id and sent_at is not null) then raise exception 'Use the final invoice'; end if;
 if p_method not in ('wallet','bank','card') or r.expires_at<now() then raise exception 'Invalid request'; end if;
 if exists(select 1 from public.payments where request_id=p_id and status in ('succeeded','processing')) then raise exception 'Already paid'; end if;
 select coalesce(sum(amount_cents),0) into received from public.payments where job_id=r.job_id and status in ('succeeded','processing');
 received:=received+coalesce((select sum(x.amount_cents) from public.job_payment_requests x where x.job_id=r.job_id and x.id<>r.id and x.intent_method is not null and not exists(select 1 from public.payments p where p.request_id=x.id and p.status in ('succeeded','processing'))),0);
 total:=public.job_agreed_total(r.job_id);
 if received+r.amount_cents>total then raise exception 'Nothing due'; end if;
 update public.job_payment_requests set intent_method=coalesce(intent_method,p_method), reserved_at=coalesce(reserved_at,now()) where id=p_id;
 if exists(select 1 from public.job_payment_requests where id=p_id and intent_method<>p_method) then raise exception 'Use the original payment method'; end if;
end $$;
