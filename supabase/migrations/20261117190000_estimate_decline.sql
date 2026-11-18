alter table public.estimates add column declined_at timestamptz;

create or replace function public.check_estimate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.sent_at is not null or new.signed_at is not null or new.declined_at is not null then
      raise exception 'an estimate starts as a draft';
    end if;
    return new;
  end if;
  if new.sent_at is not null and old.sent_at is null then
    if not exists (select 1 from public.estimate_lines l where l.estimate_id = new.id and not l.excluded) then
      raise exception 'an estimate needs an included line before it is sent';
    end if;
    if exists (select 1 from public.estimate_lines l where l.estimate_id = new.id and not l.excluded
      and (length(trim(l.description)) = 0 or l.qty_hundredths <= 0 or l.unit_cents is null)) then
      raise exception 'price or exclude every included line before sending';
    end if;
    if new.tax_rate_bps is null or new.tax_labor is null or new.tax_materials is null then
      raise exception 'the tax rule is saved when the estimate is sent';
    end if;
  end if;
  if new.signed_at is not null and new.sent_at is null then
    raise exception 'only a sent estimate can be signed';
  end if;
  if new.signed_at is not null and new.declined_at is not null then
    raise exception 'a declined estimate cannot be signed';
  end if;
  if new.declined_at is distinct from old.declined_at and (
    old.sent_at is null or old.declined_at is not null or current_user in ('authenticated', 'anon')
  ) then raise exception 'estimate decline requires a valid customer link'; end if;
  if old.sent_at is not null and (to_jsonb(new) - 'signed_at' - 'declined_at') is distinct from (to_jsonb(old) - 'signed_at' - 'declined_at') then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  if old.signed_at is not null and new.signed_at is distinct from old.signed_at then
    raise exception 'this document is signed or sent and can''t be changed';
  end if;
  return new;
end $$;

create function public.decline_estimate_access(p_hash text, p_snapshot_hash text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare l public.estimate_access_links; e public.estimates; declined timestamptz;
begin
  select * into l from public.estimate_access_links where token_hash = p_hash and revoked_at is null and expires_at > now() for update;
  if l.id is null or l.snapshot_hash is distinct from p_snapshot_hash then raise exception 'not allowed'; end if;
  select * into e from public.estimates where id = l.estimate_id for update;
  if e.sent_at is null or e.signed_at is not null or public.document_fingerprint('estimate', e.id) <> l.document_hash then
    raise exception 'estimate cannot be declined';
  end if;
  if e.declined_at is not null then return e.declined_at; end if;
  declined := now();
  update public.estimates set declined_at = declined where id = e.id;
  insert into public.audit_log(business_id,actor,action,entity,entity_id)
    values (e.business_id,null,'estimate.declined_by_link','estimate',e.id);
  return declined;
end $$;
revoke all on function public.decline_estimate_access(text,text) from public, anon, authenticated;
grant execute on function public.decline_estimate_access(text,text) to service_role;

create or replace function public.view_estimate_access(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.estimate_access_links; e public.estimates;
begin
  select * into l from public.estimate_access_links where token_hash = p_hash and revoked_at is null and expires_at > now() for update;
  if l.id is null then raise exception 'not found'; end if;
  if l.opened_at is null then
    update public.estimate_access_links set opened_at = now() where id = l.id;
    insert into public.document_delivery_events(business_id,document_type,document_id,stage)
      values (l.business_id,'estimate',l.estimate_id,'customer_viewed');
  end if;
  select * into e from public.estimates where id = l.estimate_id;
  return jsonb_build_object('snapshot', l.snapshot, 'hash', l.snapshot_hash, 'expiresAt', l.expires_at,
    'acceptedAt', e.signed_at, 'declinedAt', e.declined_at);
end $$;
