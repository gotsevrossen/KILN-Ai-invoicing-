import { db, ok } from './db-client';

// Paid jobs leave KILN 30 days after they're paid. The server decides when (see
// supabase/migrations/20261117170000_paid_job_cleanup.sql); the app only shows the owner's warning,
// records their choice and asks the server to remove what's due.

export interface LeavingJob {
  id: string;
  title: string;
  customerName: string;
  paidAt: string;
  leavesAt: string;
  warnedAt: string | null;
  choice: 'save' | 'discard' | null;
}

/** Owner only: paid jobs leaving within a day. Empty for everyone else, or with automatic saving. */
export async function loadLeavingJobs(): Promise<LeavingJob[]> {
  type Row = { id: string; title: string; customer_name: string; paid_at: string; leaves_at: string; warned_at: string | null; choice: 'save' | 'discard' | null };
  const rows = ok(await db().rpc('jobs_leaving')) as Row[] | null;
  return (rows ?? []).map((r) => ({
    id: r.id, title: r.title, customerName: r.customer_name, paidAt: r.paid_at, leavesAt: r.leaves_at, warnedAt: r.warned_at, choice: r.choice,
  }));
}

/** The owner saw the warning for these jobs; they get one more day from now. */
export async function markLeavingSeen(jobIds: string[]) {
  if (jobIds.length) ok(await db().rpc('see_jobs_leaving', { p_jobs: jobIds }));
}

export async function chooseDocuments(jobId: string, choice: 'save' | 'discard') {
  ok(await db().rpc('choose_job_documents', { p_job: jobId, p_choice: choice }));
}

/** Asks the server to remove the owner's jobs that are due. Returns how many went. */
export async function removeDueJobs(): Promise<{ removed: number; saved: number; failed?: number }> {
  const { data, error } = await db().functions.invoke('job-cleanup', { body: {} });
  if (error) throw error;
  return data as { removed: number; saved: number; failed?: number };
}

export async function loadAutoSave(businessId: string): Promise<boolean> {
  const row = ok(await db().from('businesses').select('auto_save_documents').eq('id', businessId).maybeSingle()) as { auto_save_documents: boolean } | null;
  return !!row?.auto_save_documents;
}

/** Owner only (the server refuses anyone else). */
export async function saveAutoSave(businessId: string, on: boolean) {
  const rows = ok(await db().from('businesses').update({ auto_save_documents: on }).eq('id', businessId).select('id'));
  if (!rows?.length) throw Object.assign(new Error('Owner only'), { code: 'owner_only' });
}

// ---------- saved documents

export type SavedDocType = 'estimate' | 'invoice' | 'change_order';

export interface SavedLine {
  description: string;
  kind?: 'labor' | 'material' | 'fee' | null;
  unit?: string | null;
  qty_hundredths: number;
  unit_cents: number | null;
  excluded?: boolean;
}

export interface SavedSnapshot {
  type: SavedDocType;
  business: { name: string; phone: string | null; email?: string | null; address?: string | null };
  customer: { name: string; phone: string | null; email: string | null; lang: 'en' | 'es' | null };
  job: { title: string; address: string; workOrder: string | null };
  document: Record<string, unknown> & {
    number?: string; sent_at?: string | null; signed_at?: string | null; paid_at?: string | null; declined_at?: string | null;
    tax_rate_bps?: number | null; tax_labor?: boolean | null; tax_materials?: boolean | null;
    scope?: unknown; issued_scope?: string | null; summary?: string | null; description?: string | null;
    amount_cents?: number | null; base_cents?: number | null; deposit_on?: boolean | null; deposit_bps?: number | null;
    issued_on?: string | null; due_days?: number | null;
  };
  lines: SavedLine[];
  payments: { amountCents: number; method: string; paidAt: string | null; status: string | null }[];
  signatures: { name: string; signedAt: string | null; method: string | null; hash: string; ip?: string | null; ink?: unknown }[];
}

export interface SavedDocument {
  id: string;
  jobId: string;
  jobTitle: string;
  jobAddress: string;
  customerName: string;
  type: SavedDocType;
  number: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  savedAt: string;
}

const LIST = 'id, job_id, job_title, job_address, customer_name, document_type, number, issued_at, paid_at, saved_at';
type ListRow = { id: string; job_id: string; job_title: string; job_address: string; customer_name: string; document_type: SavedDocType; number: string | null; issued_at: string | null; paid_at: string | null; saved_at: string };
const toDoc = (r: ListRow): SavedDocument => ({
  id: r.id, jobId: r.job_id, jobTitle: r.job_title, jobAddress: r.job_address, customerName: r.customer_name,
  type: r.document_type, number: r.number, issuedAt: r.issued_at, paidAt: r.paid_at, savedAt: r.saved_at,
});

/** Owners and managers: documents kept from removed jobs, newest first. */
export async function loadSavedDocuments(businessId: string): Promise<SavedDocument[]> {
  const rows = ok(await db().from('saved_documents').select(LIST).eq('business_id', businessId).order('saved_at', { ascending: false }).limit(500)) as ListRow[];
  return rows.map(toDoc);
}

export async function loadSavedDocument(id: string): Promise<{ doc: SavedDocument; snapshot: SavedSnapshot } | null> {
  const row = ok(await db().from('saved_documents').select(`${LIST}, snapshot`).eq('id', id).maybeSingle()) as (ListRow & { snapshot: SavedSnapshot }) | null;
  return row ? { doc: toDoc(row), snapshot: row.snapshot } : null;
}

/** Owner only. */
export async function deleteSavedDocument(id: string) {
  const rows = ok(await db().from('saved_documents').delete().eq('id', id).select('id'));
  if (!rows?.length) throw Object.assign(new Error('Owner only'), { code: 'owner_only' });
}
