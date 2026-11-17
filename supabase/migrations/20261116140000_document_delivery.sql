-- Issuance is not delivery. Only explicitly recorded events describe sharing.
create table public.document_delivery_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses,
  document_type text not null check (document_type in ('estimate','invoice')),
  document_id uuid not null,
  stage text not null check (stage in ('link_prepared','share_opened','owner_confirmed_shared','customer_viewed')),
  channel text check (channel in ('text','email','share')),
  created_at timestamptz not null default now()
);
alter table public.document_delivery_events enable row level security;
create policy delivery_read on public.document_delivery_events for select to authenticated using (public.is_member(business_id));
create index on public.document_delivery_events(document_type, document_id, created_at);

create table public.estimate_access_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses,
  estimate_id uuid not null references public.estimates,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null,
  snapshot_hash text not null,
  document_hash text not null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.estimate_access_links enable row level security;
create policy estimate_access_read on public.estimate_access_links for select to authenticated using (public.is_owner(business_id));

alter table public.signatures add column approval_snapshot jsonb,
  add column approval_snapshot_hash text,
  add column signature_method text check (signature_method in ('finger','typed_name')),
  add column ink jsonb,
  add column consent_text text;

-- Owner-only, bounded events. The server looks up the business and requires an issued document.
create function public.record_delivery_event(p_type text, p_id uuid, p_stage text, p_channel text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  if p_type = 'estimate' then select business_id into bid from public.estimates where id=p_id and sent_at is not null;
  elsif p_type = 'invoice' then select business_id into bid from public.invoices where id=p_id and sent_at is not null;
  end if;
  if bid is null or not public.is_owner(bid) or p_stage not in ('link_prepared','share_opened','owner_confirmed_shared')
    or (p_channel is not null and p_channel not in ('text','email','share')) then raise exception 'not allowed'; end if;
  insert into public.document_delivery_events(business_id,document_type,document_id,stage,channel) values(bid,p_type,p_id,p_stage,p_channel);
end $$;
revoke all on function public.record_delivery_event(text,uuid,text,text) from public, anon;
grant execute on function public.record_delivery_event(text,uuid,text,text) to authenticated;

-- The link snapshot includes only customer-facing fields. This transaction pins the exact copy.
create function public.prepare_estimate_access(p_job_id uuid, p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.estimates; snap jsonb; lid uuid;
begin
  select * into e from public.estimates where job_id=p_job_id for update;
  if e.id is null or not public.is_owner(e.business_id) or e.sent_at is null then raise exception 'not allowed'; end if;
  select public.signed_document('estimate',e.id) || jsonb_build_object(
    'business_name',b.name,'business_phone',b.phone,'customer_name',c.name,'lang',c.lang,
    'address',j.address,'title',j.title,'issued_at',e.sent_at)
    into snap from public.jobs j join public.customers c on c.id=j.customer_id
    join public.businesses b on b.id=e.business_id where j.id=e.job_id;
  insert into public.estimate_access_links(business_id,estimate_id,token_hash,snapshot,snapshot_hash,document_hash)
    values(e.business_id,e.id,p_hash,snap,encode(sha256(convert_to(snap::text,'UTF8')),'hex'),public.document_fingerprint('estimate',e.id)) returning id into lid;
  insert into public.document_delivery_events(business_id,document_type,document_id,stage) values(e.business_id,'estimate',e.id,'link_prepared');
  return lid;
end $$;
revoke all on function public.prepare_estimate_access(uuid,text) from public, anon;
grant execute on function public.prepare_estimate_access(uuid,text) to authenticated;

-- Only the token-checking Edge Function may execute these public-link operations.
create function public.view_estimate_access(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.estimate_access_links; signed_time timestamptz;
begin
  select * into l from public.estimate_access_links where token_hash=p_hash and revoked_at is null and expires_at>now() for update;
  if l.id is null then raise exception 'not found'; end if;
  if l.opened_at is null then
    update public.estimate_access_links set opened_at=now() where id=l.id;
    insert into public.document_delivery_events(business_id,document_type,document_id,stage) values(l.business_id,'estimate',l.estimate_id,'customer_viewed');
  end if;
  select signed_at into signed_time from public.estimates where id=l.estimate_id;
  return jsonb_build_object('snapshot',l.snapshot,'hash',l.snapshot_hash,'expiresAt',l.expires_at,'acceptedAt',signed_time);
end $$;

create function public.accept_estimate_access(p_hash text,p_snapshot_hash text,p_name text,p_device text,p_ip text,p_consent text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare l public.estimate_access_links; e public.estimates; accepted timestamptz;
begin
  select * into l from public.estimate_access_links where token_hash=p_hash and revoked_at is null and expires_at>now() for update;
  if l.id is null or l.snapshot_hash<>p_snapshot_hash or length(trim(p_name)) not between 2 and 120
    or p_consent not in ('I accept this exact estimate and use my typed name as my electronic signature.', 'Acepto este presupuesto exacto y uso mi nombre escrito como firma electrónica.') then raise exception 'not allowed'; end if;
  select * into e from public.estimates where id=l.estimate_id for update;
  if e.sent_at is null or public.document_fingerprint('estimate',e.id)<>l.document_hash then raise exception 'document changed'; end if;
  if e.signed_at is not null then return e.signed_at; end if;
  accepted:=now();
  update public.estimates set signed_at=accepted where id=e.id;
  insert into public.signatures(business_id,document_type,document_id,signer_name,document_hash,ip,user_agent,
    approval_snapshot,approval_snapshot_hash,signature_method,consent_text)
    values(e.business_id,'estimate',e.id,trim(p_name),l.document_hash,left(p_ip,64),left(p_device,200),l.snapshot,l.snapshot_hash,'typed_name',p_consent);
  insert into public.audit_log(business_id,actor,action,entity,entity_id) values(e.business_id,null,'estimate.accepted_by_link','estimate',e.id);
  return accepted;
end $$;
revoke all on function public.view_estimate_access(text), public.accept_estimate_access(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.view_estimate_access(text), public.accept_estimate_access(text,text,text,text,text,text) to service_role;

-- A bounded vector signature; coordinates are normalized to the pad, not device pixels.
create function public.valid_signature_ink(p_ink jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare stroke jsonb; pt jsonb; points integer:=0;
begin
  if p_ink is null or jsonb_typeof(p_ink)<>'array' or pg_column_size(p_ink)>200000 or jsonb_array_length(p_ink) not between 1 and 100 then return false; end if;
  for stroke in select value from jsonb_array_elements(p_ink) loop
    if jsonb_typeof(stroke)<>'array' or jsonb_array_length(stroke)=0 then return false; end if;
    for pt in select value from jsonb_array_elements(stroke) loop
      if jsonb_typeof(pt)<>'array' or jsonb_array_length(pt)<>2 or jsonb_typeof(pt->0)<>'number' or jsonb_typeof(pt->1)<>'number' then return false; end if;
      if (pt->>0)::numeric not between 0 and 1 or (pt->>1)::numeric not between 0 and 1 then return false; end if;
      points:=points+1;
    end loop;
  end loop;
  return points between 2 and 5000;
end $$;

-- New on-phone signing retains actual ink and exact rows in the same transaction.
create function public.sign_estimate(p_job_id uuid,p_signer text,p_device text,p_ink jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare e public.estimates; snap jsonb; fingerprint text;
begin
  select * into e from public.estimates where job_id=p_job_id for update;
  if e.id is null or not public.is_owner(e.business_id) or e.sent_at is null
    or not public.valid_signature_ink(p_ink) then raise exception 'not allowed'; end if;
  if e.signed_at is not null then
    if exists(select 1 from public.signatures where document_id=e.id and signer_name=trim(p_signer) and ink=p_ink) then return public.document_fingerprint('estimate',e.id); end if;
    raise exception 'already accepted';
  end if;
  snap:=public.signed_document('estimate',e.id);
  fingerprint:=public.document_fingerprint('estimate',e.id);
  update public.estimates set signed_at=now() where id=e.id;
  insert into public.signatures(business_id,document_type,document_id,signer_name,document_hash,ip,user_agent,
    approval_snapshot,approval_snapshot_hash,signature_method,ink,consent_text)
    values(e.business_id,'estimate',e.id,trim(p_signer),fingerprint,public.request_ip(),left(p_device,200),snap,
      encode(sha256(convert_to(snap::text,'UTF8')),'hex'),'finger',p_ink,'Accepted on the owner device with a finger signature');
  return fingerprint;
end $$;
create function public.sign_change_order(p_id uuid,p_signer text,p_device text,p_ink jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare c public.change_orders; snap jsonb; fingerprint text;
begin
  select * into c from public.change_orders where id=p_id for update;
  if c.id is null or not public.is_owner(c.business_id) or c.declined_at is not null
    or not public.valid_signature_ink(p_ink) then raise exception 'not allowed'; end if;
  if c.signed_at is not null then
    if exists(select 1 from public.signatures where document_id=c.id and signer_name=trim(p_signer) and ink=p_ink) then return public.document_fingerprint('change_order',c.id); end if;
    raise exception 'already accepted';
  end if;
  snap:=public.signed_document('change_order',c.id);
  fingerprint:=public.document_fingerprint('change_order',c.id);
  update public.change_orders set signed_at=now() where id=c.id;
  insert into public.signatures(business_id,document_type,document_id,signer_name,document_hash,ip,user_agent,
    approval_snapshot,approval_snapshot_hash,signature_method,ink,consent_text)
    values(c.business_id,'change_order',c.id,trim(p_signer),fingerprint,public.request_ip(),left(p_device,200),snap,
      encode(sha256(convert_to(snap::text,'UTF8')),'hex'),'finger',p_ink,'Accepted on the owner device with a finger signature');
  return fingerprint;
end $$;
revoke all on function public.sign_estimate(uuid,text,text,jsonb),public.sign_change_order(uuid,text,text,jsonb) from public,anon;
grant execute on function public.sign_estimate(uuid,text,text,jsonb),public.sign_change_order(uuid,text,text,jsonb) to authenticated;

-- Approval evidence is append-only, including for the owner.
create function public.keep_signature_evidence() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Approval evidence cannot be changed or removed'; end $$;
create trigger signatures_keep before update or delete on public.signatures for each row execute function public.keep_signature_evidence();

-- Invoice pay-page requests already set opened_at after checking the link token.
create function public.record_invoice_link_view() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.document_type='invoice' and new.opened_at is not null and old.opened_at is null then
    insert into public.document_delivery_events(business_id,document_type,document_id,stage)
      values(new.business_id,'invoice',new.document_id,'customer_viewed');
  end if;
  return new;
end $$;
create trigger invoice_link_view after update of opened_at on public.share_links for each row execute function public.record_invoice_link_view();
