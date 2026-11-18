import { createClient } from '@supabase/supabase-js';

import { cors, Refused, reply, serviceClient } from '../_shared/invoice.ts';

// POST /functions/v1/job-cleanup — removes the signed-in owner's paid jobs that are due to leave
// (30 days after payment, after the owner saw the warning; see 20261117170000_paid_job_cleanup.sql).
// The database decides which jobs are due, as the owner. purge_job() saves the documents when the
// owner asked (or saves automatically), erases the job's records and returns its files, which are
// then deleted here from storage. The app calls this when the owner opens KILN.

const BUCKETS = ['job-photos', 'voice-notes', 'receipts'] as const;
// at most this many jobs per call, so one call stays quick; the rest go next time
const PER_CALL = 25;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'bad_request' });
  const auth = req.headers.get('Authorization');
  if (!auth) return reply(401, { error: 'signed_out' });
  try {
    // as the signed-in user: jobs_due_for_removal() only answers for the business's owner
    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const due = await user.rpc('jobs_due_for_removal');
    if (due.error) throw new Refused(401, 'signed_out');
    const jobs = ((due.data ?? []) as string[]).slice(0, PER_CALL);

    const db = serviceClient();
    let removed = 0;
    let saved = 0;
    for (const job of jobs) {
      // checks again that the job is due, inside the same database step that removes it
      const result = await db.rpc('purge_job', { p_job: job });
      if (result.error) {
        console.error('job-cleanup: a job could not be removed', result.error.code);
        continue;
      }
      const out = result.data as { saved: number; files: Record<string, string[]> };
      removed += 1;
      saved += out.saved;
      for (const bucket of BUCKETS) {
        const paths = out.files[bucket] ?? [];
        if (!paths.length) continue;
        const gone = await db.storage.from(bucket).remove(paths);
        // the records are already gone; a file left behind is only reachable by its exact path
        if (gone.error) console.error(`job-cleanup: files in ${bucket} were not all removed`);
      }
    }
    return reply(200, { removed, saved });
  } catch (e) {
    if (e instanceof Refused) return reply(e.status, { error: e.code });
    console.error('job-cleanup: unexpected error', e instanceof Error ? e.name : typeof e);
    return reply(500, { error: 'failed' });
  }
});
