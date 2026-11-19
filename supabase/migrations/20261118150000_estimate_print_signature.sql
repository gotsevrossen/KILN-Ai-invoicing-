create or replace function public.view_estimate_access(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.estimate_access_links; e public.estimates; signature jsonb;
begin
  select * into l from public.estimate_access_links where token_hash = p_hash and revoked_at is null and expires_at > now() for update;
  if l.id is null then raise exception 'not found'; end if;
  if l.opened_at is null then
    update public.estimate_access_links set opened_at=now() where id=l.id;
    insert into public.document_delivery_events(business_id,document_type,document_id,stage)
      values (l.business_id,'estimate',l.estimate_id,'customer_viewed');
  end if;
  select * into e from public.estimates where id=l.estimate_id;
  if e.signed_at is not null then
    select jsonb_build_object('name', s.signer_name, 'ink', s.ink, 'method', s.signature_method) into signature
      from public.signatures s where s.business_id=l.business_id and s.document_type='estimate' and s.document_id=e.id;
  end if;
  return jsonb_build_object('snapshot', l.snapshot, 'hash', l.snapshot_hash, 'expiresAt', l.expires_at,
    'acceptedAt', e.signed_at, 'declinedAt', e.declined_at, 'signature', signature);
end $$;
