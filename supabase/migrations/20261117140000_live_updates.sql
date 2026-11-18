-- Broadcast invalidations only. Records still come from the app's existing RLS/RPC paths.
create policy "kiln receives private changes" on realtime.messages
for select to authenticated using (
  extension = 'broadcast' and topic = (select realtime.topic()) and (
    (select realtime.topic()) = 'kiln:user:' || (select auth.uid())::text
    or exists (
      select 1 from public.business_members m
      where m.user_id = (select auth.uid()) and m.status = 'active'
        and (select realtime.topic()) = 'kiln:business:' || m.business_id::text
    )
  )
);

-- A receipt can insert hundreds of rows. Send at most one notice per topic per transaction.
create function public.kiln_notify_live(p_topic text) returns void
language plpgsql security definer set search_path = '' as $$
declare seen jsonb;
begin
  seen := coalesce(nullif(current_setting('kiln.live_topics', true), ''), '[]')::jsonb;
  if seen ? p_topic then return; end if;
  perform set_config('kiln.live_topics', (seen || jsonb_build_array(p_topic))::text, true);
  perform realtime.send('{}'::jsonb, 'changed', p_topic, true);
exception when others then
  -- Socket delivery is optional; saving work must continue. Clients also recover by polling.
  raise log 'KILN live notification unavailable';
end $$;

create function public.kiln_live_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare current_row jsonb; previous_row jsonb; bid text; uid text;
begin
  if tg_op <> 'DELETE' then current_row := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then previous_row := to_jsonb(old); end if;
  for bid in select distinct value from unnest(array[
    case when tg_table_name = 'businesses' then current_row->>'id' else current_row->>'business_id' end,
    case when tg_table_name = 'businesses' then previous_row->>'id' else previous_row->>'business_id' end
  ]) value where value is not null loop
    perform public.kiln_notify_live('kiln:business:' || bid);
  end loop;
  -- Pending, approved, removed and role-changed people must also hear their own access change.
  if tg_table_name = 'business_members' then
    for uid in select distinct value from unnest(array[current_row->>'user_id', previous_row->>'user_id']) value
      where value is not null loop
      perform public.kiln_notify_live('kiln:user:' || uid);
    end loop;
  end if;
  return null;
end $$;

do $$ declare table_name text; begin
  for table_name in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'business_id' and t.table_type = 'BASE TABLE'
      and c.table_name not in ('ai_usage', 'audit_log')
    union select 'businesses'
  loop
    execute format('create trigger kiln_live_change after insert or update or delete on public.%I for each row execute function public.kiln_live_change()', table_name);
  end loop;
end $$;

revoke all on function public.kiln_notify_live(text), public.kiln_live_change() from public, anon, authenticated;
