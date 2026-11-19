# Paid-job cleanup, saved documents, Jobs menu (Nov 17 2026)

Rossen's rules: paid jobs are deleted for good 30 days after payment, unless the owner saves the documents. Only documents can be saved. The owner is warned one day before. A job is never removed before the owner has seen that warning: if they haven't opened KILN by day 30, the job waits until they do, then gets one more day. An owner setting saves documents automatically, and then no warning is shown.

## What counts

- **Paid job:** at least one invoice, every invoice paid, not reopened (`job_paid_at()`).
- **Warning:** Home shows "Paid jobs leaving KILN" for jobs paid 29+ days ago (owner only). Showing the card records `jobs.removal_warned_at`. Each job has **Save documents** / **Don't save** (changeable), and **Save all documents** when several are open.
- **Due** (`job_removal_due()`): 30 days after payment, and either automatic saving is on, or the owner was warned and chose, or a full day has passed since the warning (no choice means nothing is kept).
- **Saved:** each sent estimate, sent invoice and answered change order, as a copy of its rows (lines, payments, signer name, time, method, fingerprint, IP and drawn signature) in `saved_documents`. Everything else goes: the job, notes, hours, photos and their files, voice notes, work, payments, payment links, share links and signature records. Receipt items that went only to that job go too (a receipt left empty goes with its file); items shared with other jobs stay. The audit log keeps a `job.removed` / `job.removed_documents_saved` entry.

## How removal runs

1. When the owner opens Home (at most every 10 minutes), the app calls the `job-cleanup` server function.
2. It asks the database, as the owner, which jobs are due (`jobs_due_for_removal()`), then calls `purge_job()` with the server key for each (25 per call). `purge_job()` re-checks that the job is due, saves the documents when asked, deletes the records in one step, and returns the file paths.
3. The function deletes those files from storage. Live updates then refresh every open phone.

The rules that stop sent documents, their lines, sent-invoice work and photos, and signatures from being deleted are unchanged for everyone. Only `purge_job()` gets past them (`kiln_purging()`: a flag set inside it, plus the statement running as the database owner, not as a signed-in user or the server key). The tests check that setting the flag from the app does nothing.

## App

- Home: `features/cleanup/leaving-card.tsx`.
- Settings → **Old jobs**: "Save documents automatically" (owner) and **Saved documents** (owner and manager).
- **Saved documents** (`app/saved-documents/`): grouped by job, searchable. A document shows its lines, totals, payments and signatures. **Share as PDF** builds the page in the customer's language (`lib/saved-doc.ts`, all text escaped) with `expo-print` and opens the share menu with `expo-sharing`. On the web it opens the print dialog. Only the owner can delete a saved document.
- **Jobs menu** (sliders button next to +): KILN search, filters by customer, assigned person (or nobody), trade and job type (from the estimate's job details), a "Showing X of Y" count, Clear, and Saved documents. Filters apply to all three groups.
- **KILN search** (`findJobs` AI task): sends each job's title, trade, job type and up to 600 characters from the estimate's details, location and line descriptions. No customer names, prices or private notes go out. Only ids the app sent are accepted, and it counts toward the AI daily limit.

## Files

- Migration `supabase/migrations/20261117170000_paid_job_cleanup.sql`; tests `supabase/tests/database/job_cleanup.test.sql` (32 checks).
- Server function `supabase/functions/job-cleanup/` (`verify_jwt = true`); AI task in `supabase/functions/ai/tasks.ts` (3 new tests).
- App: `data/job-cleanup.ts`, `features/cleanup/*`, `lib/saved-doc.ts` (+ tests), `app/saved-documents/*`.
- New packages: `expo-print`, `expo-sharing` (both in Expo Go; the APK needs a rebuild).

## Not done / limits

- Deployed to the hosted server on Nov 18: the migration, `job-cleanup` (new), `ai` (v8, `findJobs`) and the other functions; customer pages republished. Backups: `builds/backups/hosted-schema-before-cleanup-2026-11-18.sql`, `hosted-data-before-cleanup-2026-11-18.sql`.
- Removal only runs when the owner opens KILN, so with automatic saving a due job can stay until the next time the owner opens the app. A daily scheduled run would need a scheduler (pg_cron or a scheduled function).
- No push notification for the warning. It shows on Home only.
- Trade and job type filters only know jobs that have estimate job details.
