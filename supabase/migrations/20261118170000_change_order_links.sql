create function public.change_order_link_snapshot(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select public.signed_document('change_order',co.id) || jsonb_build_object(
    'business_name',b.name,'business_phone',b.phone,'customer_name',c.name,'lang',c.lang,
    'job_title',j.title,'address',j.address,'work_order',j.work_order,'issued_at',co.sent_at)
  from public.change_orders co join public.businesses b on b.id=co.business_id
  join public.jobs j on j.id=co.job_id join public.customers c on c.id=j.customer_id
  where co.id=p_id and co.sent_at is not null;
$$;

create function public.view_change_order_link(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.share_links; co public.change_orders; snap jsonb; evidence public.signatures;
begin
  select * into l from public.share_links where token_hash=p_hash and document_type='change_order'
    and revoked_at is null and expires_at>now();
  if not found then raise exception 'not found'; end if;
  select * into co from public.change_orders where id=l.document_id and business_id=l.business_id and sent_at is not null;
  if not found then raise exception 'not found'; end if;
  snap:=public.change_order_link_snapshot(co.id);
  select * into evidence from public.signatures where document_type='change_order' and document_id=co.id;
  if evidence.approval_snapshot ? 'customer_name' then snap:=evidence.approval_snapshot; end if;
  return jsonb_build_object('snapshot',snap,'hash',encode(sha256(convert_to(snap::text,'UTF8')),'hex'),
    'signedAt',co.signed_at,'declinedAt',co.declined_at,'signature',case when evidence.id is not null then
      jsonb_build_object('name',evidence.signer_name,'method',evidence.signature_method,'ink',evidence.ink) end);
end $$;

create function public.answer_change_order_link(p_hash text,p_snapshot_hash text,p_name text,p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.share_links; co public.change_orders; snap jsonb; signed_time timestamptz; consent_text text;
begin
  select * into l from public.share_links where token_hash=p_hash and document_type='change_order'
    and revoked_at is null and expires_at>now() for share;
  if not found then raise exception 'not found'; end if;
  select * into co from public.change_orders where id=l.document_id and business_id=l.business_id and sent_at is not null;
  if not found or p_accept is null then raise exception 'not found'; end if;
  perform 1 from public.jobs where id=co.job_id for update;
  select * into co from public.change_orders where id=l.document_id for update;
  if not found then raise exception 'not found'; end if;
  if co.signed_at is not null or co.declined_at is not null then return public.view_change_order_link(p_hash); end if;
  if exists(select 1 from public.invoices where job_id=co.job_id and sent_at is not null) then raise exception 'Invoice already sent'; end if;
  snap:=public.change_order_link_snapshot(co.id);
  if p_snapshot_hash is distinct from encode(sha256(convert_to(snap::text,'UTF8')),'hex') then raise exception 'Document changed'; end if;
  if p_accept then
    if length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Signer name required'; end if;
    consent_text:=case when snap->>'lang'='es' then 'Acepto esta orden de cambio y uso mi nombre escrito como firma electrónica.'
      else 'I accept this change order and use my typed name as my electronic signature.' end;
    signed_time:=now();
    update public.change_orders set signed_at=signed_time where id=co.id;
    insert into public.signatures(business_id,document_type,document_id,signer_name,signed_at,document_hash,
      approval_snapshot,approval_snapshot_hash,signature_method,consent_text)
      values(co.business_id,'change_order',co.id,trim(p_name),signed_time,public.document_fingerprint('change_order',co.id),
        snap,p_snapshot_hash,'typed_name',consent_text);
  else
    update public.change_orders set declined_at=now() where id=co.id;
  end if;
  insert into public.audit_log(business_id,actor,action,entity,entity_id) values(co.business_id,null,
    case when p_accept then 'change_order.accepted_by_link' else 'change_order.declined_by_link' end,'change_order',co.id);
  return public.view_change_order_link(p_hash);
end $$;

revoke all on function public.change_order_link_snapshot(uuid), public.view_change_order_link(text), public.answer_change_order_link(text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.view_change_order_link(text), public.answer_change_order_link(text,text,text,boolean) to service_role;
