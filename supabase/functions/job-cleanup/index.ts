import { createClient } from '@supabase/supabase-js';
import { cors, Refused, reply, serviceClient, setting } from '../_shared/invoice.ts';

const BUCKETS = ['job-photos', 'voice-notes', 'receipts'] as const;
const PER_CALL = 25;

/** Compares two secrets in time that doesn't depend on where they differ, so the token can't be guessed piece by piece. */
function sameSecret(supplied: string | null, expected: string): boolean {
  if (supplied === null) return false;
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'bad_request' });
  const suppliedToken = req.headers.get('X-Kiln-Cleanup-Token');
  const configuredToken = setting('KILN_CLEANUP_TOKEN');
  const scheduled = configuredToken.length >= 32 && sameSecret(suppliedToken, configuredToken);
  const auth = req.headers.get('Authorization');
  if (!scheduled && !auth) return reply(401, { error: 'signed_out' });
  try {
    const db = serviceClient();
    const user = scheduled ? db : createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const due = await user.rpc(scheduled ? 'scheduled_jobs_due_for_removal' : 'jobs_due_for_removal');
    if (due.error) throw new Refused(scheduled ? 500 : 401, scheduled ? 'failed' : 'signed_out');
    let removed = 0;
    let saved = 0;
    let failed = 0;
    const files = new Map<string, string[]>();
    for (const job of ((due.data ?? []) as string[]).slice(0, PER_CALL)) {
      const result = await db.rpc('purge_job_and_queue_files', { p_job: job });
      if (result.error) {
        // Another worker can finish the same job after the due list was read.
        if (result.error.code !== '42501') { failed++; console.error('job-cleanup: purge failed', result.error.code); }
        continue;
      }
      const out = result.data as { saved: number; files: Record<string, string[]> };
      removed++;
      saved += out.saved;
      for (const bucket of BUCKETS) files.set(bucket, [...(files.get(bucket) ?? []), ...(out.files[bucket] ?? [])]);
    }
    // Accounts whose 30 days are up (Delete my account): an owner's business rows go now and its
    // files join the queue removed just below; then the login itself. A failure is retried next hour.
    let accounts = 0;
    if (scheduled) {
      const dueAccounts = await db.rpc('account_deletions_due');
      if (dueAccounts.error) { failed++; console.error('job-cleanup: account list failed', dueAccounts.error.code); }
      for (const userId of (dueAccounts.data ?? []) as string[]) {
        const purged = await db.rpc('purge_account', { p_user: userId });
        if (purged.error) { failed++; console.error('job-cleanup: account purge failed', purged.error.code); continue; }
        const gone = await db.auth.admin.deleteUser(userId);
        if (gone.error) { failed++; console.error('job-cleanup: login removal failed'); continue; }
        accounts++;
      }
    }
    for (const bucket of BUCKETS) {
      let paths = files.get(bucket) ?? [];
      if (scheduled) {
        const queued = await db.from('job_cleanup_files').select('path').eq('bucket', bucket).order('queued_at').limit(100);
        if (queued.error) { failed++; continue; }
        paths = queued.data.map((row) => row.path);
      }
      for (let start = 0; start < paths.length; start += 100) {
        const batch = paths.slice(start, start + 100);
        const result = await db.storage.from(bucket).remove(batch);
        if (result.error) { failed++; console.error('job-cleanup: storage removal failed', bucket); continue; }
        const acknowledged = await db.from('job_cleanup_files').delete().eq('bucket', bucket).in('path', batch);
        if (acknowledged.error) failed++;
      }
    }
    return reply(failed && scheduled ? 500 : 200, { removed, saved, accounts, failed });
  } catch (e) {
    if (e instanceof Refused) return reply(e.status, { error: e.code });
    console.error('job-cleanup: unexpected error', e instanceof Error ? e.name : typeof e);
    return reply(500, { error: 'failed' });
  }
});
