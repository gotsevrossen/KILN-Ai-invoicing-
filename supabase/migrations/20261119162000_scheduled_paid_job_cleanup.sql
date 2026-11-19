-- Storage removal is retried independently of the database transaction that removes a job.
create table public.job_cleanup_files (
  bucket text not null check (bucket in ('job-photos', 'voice-notes', 'receipts')),
  path text not null,
  queued_at timestamptz not null default now(),
  primary key (bucket, path)
);
alter table public.job_cleanup_files enable row level security;
revoke all on public.job_cleanup_files from public, anon, authenticated;
grant select, delete on public.job_cleanup_files to service_role;

create function public.purge_job_and_queue_files(p_job uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  result := public.purge_job(p_job);
  insert into public.job_cleanup_files(bucket,path)
    select files.key, path.value from jsonb_each(result->'files') files
    cross join lateral jsonb_array_elements_text(files.value) path
    on conflict do nothing;
  return result;
end $$;

create function public.scheduled_jobs_due_for_removal() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select i.job_id from public.invoices i
  where i.paid_at <= now() - interval '30 days' and public.job_removal_due(i.job_id)
  group by i.job_id order by min(i.paid_at), i.job_id limit 25;
$$;

revoke all on function public.purge_job_and_queue_files(uuid), public.scheduled_jobs_due_for_removal() from public, anon, authenticated;
grant execute on function public.purge_job_and_queue_files(uuid), public.scheduled_jobs_due_for_removal() to service_role;

-- The shared cleanup token is scoped to this endpoint. Missing Vault entries keep Cron idle.
create function public.kick_scheduled_job_cleanup() returns void
language plpgsql set search_path = '' as $$
declare endpoint text; token text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='kiln_cleanup_endpoint';
  select decrypted_secret into token from vault.decrypted_secrets where name='kiln_cleanup_token';
  if endpoint is null or token is null then return; end if;
  if endpoint !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/job-cleanup$' or length(token)<32 then
    raise exception 'Invalid cleanup configuration';
  end if;
  perform net.http_post(url := endpoint, headers := jsonb_build_object('Content-Type','application/json','X-Kiln-Cleanup-Token',token),
    body := '{}'::jsonb, timeout_milliseconds := 25000);
end $$;

revoke all on function public.kick_scheduled_job_cleanup() from public, anon, authenticated, service_role;
