-- Run against the hosted database after deploying job-cleanup and the cleanup migration.
-- Add kiln_cleanup_endpoint and kiln_cleanup_token in Vault. Set the same token as the
-- Edge Function secret KILN_CLEANUP_TOKEN. Use a randomly generated value of at least 32 characters.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('kiln-paid-job-cleanup', '17 * * * *', 'select public.kick_scheduled_job_cleanup()');
