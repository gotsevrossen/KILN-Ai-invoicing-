import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type { LineKind, TaxRule } from '@/lib/money';

import { db, ok, one } from './db-client';
import type {
  Assignment, ChangeOrder, DocLine, EstimateDraft, EstimateLine, Invoice, InvoiceBilling, InvoiceSnapshot,
  JobScope, Receipt, ReceiptItem, TimeEntry, Unit, WorkItem,
} from './types';

// Hours, notes, work done, estimates, change orders, receipts, and invoices. Row Level Security on the
// server keeps every query inside the signed-in owner's business, and the server's checks
// refuse edits to sent or signed documents even if the app tried.

// ---------------------------------------------------------------- helpers

const pad = (n: number) => String(n).padStart(2, '0');
/** The phone's calendar date (YYYY-MM-DD) for a timestamp. */
export function localDate(ts: string | Date = new Date()): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** SHA-256 of exactly what was signed, so the signed version can be proven later. */
const sha256 = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);

/** Recorded with a signature. (The signer's network address is added once customer links run on the server.) */
function deviceInfo(): string {
  return [Platform.OS, Device.osVersion, Device.modelName].filter(Boolean).join(' · ').slice(0, 200);
}

async function audit(businessId: string, action: string, entity: string, entityId: string): Promise<void> {
  const { data } = await db().auth.getSession();
  const actor = data.session?.user.id;
  if (!actor) return;
  ok(await db().from('audit_log').insert({ business_id: businessId, actor, action, entity, entity_id: entityId }));
}

/** Only the known text fields of a saved scope (the database stores it as free-form JSON). */
function scopeFrom(value: unknown): JobScope | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const scope: JobScope = {};
  for (const key of ['notes', 'location', 'details', 'exclusions', 'tradeId', 'jobTypeId'] as const) {
    if (typeof v[key] === 'string') (scope as Record<string, string>)[key] = v[key] as string;
  }
  return Object.keys(scope).length ? scope : undefined;
}

const taxFrom = (r: { tax_rate_bps: number | null; tax_labor: boolean | null; tax_materials: boolean | null }): TaxRule | undefined =>
  r.tax_rate_bps === null ? undefined : { rateBps: r.tax_rate_bps, labor: !!r.tax_labor, materials: !!r.tax_materials };

// ---------------------------------------------------------------- loading

interface TimeRow { id: string; job_id: string; worked_on: string; hundredths: number; note: string }
interface NoteRow { id: string; job_id: string; body: string; created_at: string }
interface WorkRow {
  id: string; job_id: string; worked_on: string; price_item_ref: string | null; description: string; unit: Unit;
  qty_hundredths: number; unit_cents: number; kind: LineKind;
}
interface EstimateRow {
  id: string; job_id: string; number: string; deposit_on: boolean; deposit_bps: number; sent_at: string | null; signed_at: string | null;
  scope: unknown; tax_rate_bps: number | null; tax_labor: boolean | null; tax_materials: boolean | null;
}
interface EstimateLineRow {
  id: string; estimate_id: string; price_item_ref: string | null; description: string; unit: Unit; qty_hundredths: number;
  unit_cents: number | null; from_voice: boolean; kind: LineKind; excluded: boolean;
}
interface ChangeRow {
  id: string; job_id: string; number: number; description: string; amount_cents: number; base_cents: number;
  signed_at: string | null; declined_at: string | null;
}
interface SignatureRow { document_type: 'estimate' | 'change_order'; document_id: string; signer_name: string; signed_at: string }
interface InvoiceRow {
  id: string; job_id: string; number: string; summary: string; materials_mode: 'items' | 'total'; show_location: boolean;
  sent_at: string | null; paid_at: string | null; labor_description: string;
  labor_basis: 'actual' | 'estimate' | null; materials_basis: 'included' | 'additional' | null; billing_reviewed: boolean | null;
  tax_rate_bps: number | null; tax_labor: boolean | null; tax_materials: boolean | null;
  issued_scope: unknown; excluded_scope: string[]; due_days: number | null; issued_on: string | null;
  issued_address: string | null; issued_work_order: string | null;
}
interface InvoiceLineRow { id: string; invoice_id: string; kind: LineKind; description: string; qty_hundredths: number; unit_cents: number; unit: Unit | null }
interface ReceiptRow { id: string; store: string; receipt_number: string; purchased_on: string | null; tax_cents: number; created_at: string }
interface ReceiptItemRow {
  id: string; receipt_id: string; line: number; name: string; qty_label: string; cost_cents: number; flagged: boolean;
  assignment: 'jobs' | 'personal' | 'overhead' | null; markup_off: boolean; fixed_name: string | null;
}
interface ItemJobRow { receipt_item_id: string; job_id: string; weight: number }

export interface LoadedDocs {
  timeEntries: TimeEntry[];
  notes: { id: string; jobId: string; text: string; date: string }[];
  workItems: WorkItem[];
  estimates: Record<string, EstimateDraft>;
  skippedEstimates: string[];
  reopenedJobs: string[];
  changeOrders: ChangeOrder[];
  signed: Record<string, { name: string; at: string }>;
  declinedChanges: string[];
  invoices: Invoice[];
  sentInvoices: string[];
  paidInvoices: string[];
  issuedInvoices: Record<string, InvoiceSnapshot>;
  invoiceBilling: Record<string, InvoiceBilling>;
  materialsMode: Record<string, 'items' | 'total'>;
  showLocation: Record<string, boolean>;
  receipts: Receipt[];
  assignments: Record<string, Assignment>;
  fixedNames: Record<string, string>;
  markupOff: Record<string, boolean>;
}

/** Everything saved on the business's jobs. Job flags (skipped, reopened) come with the jobs. */
export async function loadDocs(flags: { skipped: string[]; reopened: string[] }): Promise<LoadedDocs> {
  const [times, notes, work, estimates, estLines, changes, signatures, invoices, invLines, receipts, items, itemJobs] = await Promise.all([
    db().from('time_entries').select('id, job_id, worked_on, hundredths, note').order('created_at').returns<TimeRow[]>(),
    db().from('notes').select('id, job_id, body, created_at').order('created_at').returns<NoteRow[]>(),
    db().from('work_items').select('id, job_id, worked_on, price_item_ref, description, unit, qty_hundredths, unit_cents, kind').order('created_at').returns<WorkRow[]>(),
    db().from('estimates').select('id, job_id, number, deposit_on, deposit_bps, sent_at, signed_at, scope, tax_rate_bps, tax_labor, tax_materials').returns<EstimateRow[]>(),
    db().from('estimate_lines').select('id, estimate_id, price_item_ref, description, unit, qty_hundredths, unit_cents, from_voice, kind, excluded').order('position').returns<EstimateLineRow[]>(),
    db().from('change_orders').select('id, job_id, number, description, amount_cents, base_cents, signed_at, declined_at').order('number').returns<ChangeRow[]>(),
    db().from('signatures').select('document_type, document_id, signer_name, signed_at').returns<SignatureRow[]>(),
    db().from('invoices').select('id, job_id, number, summary, materials_mode, show_location, sent_at, paid_at, labor_description, labor_basis, materials_basis, billing_reviewed, tax_rate_bps, tax_labor, tax_materials, issued_scope, excluded_scope, due_days, issued_on, issued_address, issued_work_order').order('created_at').returns<InvoiceRow[]>(),
    db().from('invoice_lines').select('id, invoice_id, kind, description, qty_hundredths, unit_cents, unit').order('position').returns<InvoiceLineRow[]>(),
    db().from('receipts').select('id, store, receipt_number, purchased_on, tax_cents, created_at').order('created_at', { ascending: false }).returns<ReceiptRow[]>(),
    db().from('receipt_items').select('id, receipt_id, line, name, qty_label, cost_cents, flagged, assignment, markup_off, fixed_name').order('line').returns<ReceiptItemRow[]>(),
    db().from('receipt_item_jobs').select('receipt_item_id, job_id, weight').returns<ItemJobRow[]>(),
  ]);

  const docs: LoadedDocs = {
    timeEntries: (ok(times) ?? []).map((r) => ({ id: r.id, jobId: r.job_id, date: r.worked_on, hundredths: r.hundredths, note: r.note })),
    notes: (ok(notes) ?? []).map((r) => ({ id: r.id, jobId: r.job_id, text: r.body, date: localDate(r.created_at) })),
    workItems: (ok(work) ?? []).map((r) => ({
      id: r.id, jobId: r.job_id, date: r.worked_on, priceItemId: r.price_item_ref ?? undefined, description: r.description,
      unit: r.unit, qtyHundredths: r.qty_hundredths, unitCents: r.unit_cents, kind: r.kind,
    })),
    estimates: {},
    skippedEstimates: flags.skipped,
    reopenedJobs: flags.reopened,
    changeOrders: [],
    signed: {},
    declinedChanges: [],
    invoices: [],
    sentInvoices: [],
    paidInvoices: [],
    issuedInvoices: {},
    invoiceBilling: {},
    materialsMode: {},
    showLocation: {},
    receipts: [],
    assignments: {},
    fixedNames: {},
    markupOff: {},
  };

  const linesOf = new Map<string, EstimateLine[]>();
  for (const l of ok(estLines) ?? []) {
    linesOf.set(l.estimate_id, [...(linesOf.get(l.estimate_id) ?? []), {
      id: l.id,
      priceItemId: l.price_item_ref ?? undefined,
      description: l.description,
      unit: l.unit,
      qtyHundredths: l.qty_hundredths,
      unitCents: l.unit_cents,
      fromVoice: l.from_voice || undefined,
      kind: l.kind,
      excluded: l.excluded || undefined,
    }]);
  }
  for (const e of ok(estimates) ?? []) {
    docs.estimates[e.job_id] = {
      number: e.number,
      lines: linesOf.get(e.id) ?? [],
      depositOn: e.deposit_on,
      depositBps: e.deposit_bps,
      sent: !!e.sent_at,
      signed: !!e.signed_at,
      scope: scopeFrom(e.scope),
      tax: taxFrom(e),
    };
  }

  const changeSigner = new Map((ok(signatures) ?? []).filter((s) => s.document_type === 'change_order').map((s) => [s.document_id, s]));
  for (const c of ok(changes) ?? []) {
    docs.changeOrders.push({ id: c.id, jobId: c.job_id, number: c.number, description: c.description, amountCents: c.amount_cents, baseCents: c.base_cents });
    const sig = changeSigner.get(c.id);
    if (c.signed_at) docs.signed[c.id] = { name: sig?.signer_name ?? '', at: sig?.signed_at ?? c.signed_at };
    if (c.declined_at) docs.declinedChanges.push(c.id);
  }

  const invLinesOf = new Map<string, DocLine[]>();
  for (const l of ok(invLines) ?? []) {
    invLinesOf.set(l.invoice_id, [...(invLinesOf.get(l.invoice_id) ?? []),
      { id: l.id, kind: l.kind, description: l.description, qtyHundredths: l.qty_hundredths, unitCents: l.unit_cents, unit: l.unit ?? undefined }]);
  }
  for (const i of ok(invoices) ?? []) {
    docs.invoices.push({ id: i.id, number: i.number, jobId: i.job_id, laborDescription: i.labor_description, fees: [], summary: i.summary });
    docs.materialsMode[i.id] = i.materials_mode;
    if (i.show_location) docs.showLocation[i.id] = true;
    if (i.labor_basis && i.materials_basis && i.billing_reviewed !== null) {
      docs.invoiceBilling[i.id] = { labor: i.labor_basis, materials: i.materials_basis, reviewed: i.billing_reviewed };
    }
    if (i.sent_at) {
      docs.sentInvoices.push(i.id);
      docs.issuedInvoices[i.id] = {
        lines: invLinesOf.get(i.id) ?? [],
        tax: taxFrom(i) ?? { rateBps: 0, labor: false, materials: false },
        summary: i.summary,
        scope: scopeFrom(i.issued_scope),
        excludedScope: i.excluded_scope,
        materialsMode: i.materials_mode,
        dueDays: i.due_days ?? 0,
        issuedOn: i.issued_on ?? localDate(i.sent_at),
        address: i.issued_address ?? '',
        workOrder: i.issued_work_order ?? undefined,
      };
    }
    if (i.paid_at) docs.paidInvoices.push(i.id);
  }

  const jobsOf = new Map<string, ItemJobRow[]>();
  for (const r of ok(itemJobs) ?? []) jobsOf.set(r.receipt_item_id, [...(jobsOf.get(r.receipt_item_id) ?? []), r]);
  const itemsOf = new Map<string, ReceiptItem[]>();
  for (const it of ok(items) ?? []) {
    itemsOf.set(it.receipt_id, [...(itemsOf.get(it.receipt_id) ?? []),
      { id: it.id, line: it.line, name: it.name, qtyLabel: it.qty_label, costCents: it.cost_cents, flagged: it.flagged || undefined, likelyJobIds: [] }]);
    if (it.fixed_name) docs.fixedNames[it.id] = it.fixed_name;
    if (it.markup_off) docs.markupOff[it.id] = true;
    if (it.assignment === 'personal' || it.assignment === 'overhead') docs.assignments[it.id] = { type: it.assignment };
    if (it.assignment === 'jobs') {
      const rows = jobsOf.get(it.id) ?? [];
      if (rows.length) {
        const weights = rows.map((r) => r.weight);
        docs.assignments[it.id] = {
          type: 'jobs',
          jobIds: rows.map((r) => r.job_id),
          // equal weights are an even split
          weights: weights.every((w) => w === weights[0]) ? undefined : weights,
        };
      }
    }
  }
  for (const r of ok(receipts) ?? []) {
    docs.receipts.push({ id: r.id, store: r.store, number: r.receipt_number, date: r.purchased_on ?? localDate(r.created_at), taxCents: r.tax_cents, items: itemsOf.get(r.id) ?? [] });
  }
  return docs;
}

// ---------------------------------------------------------------- jobs

export async function setJobFlags(jobId: string, flags: { estimate_skipped?: boolean; reopened?: boolean }): Promise<void> {
  ok(await db().from('jobs').update(flags).eq('id', jobId));
}

/** Removes a job and what's on it (the server cascades and refuses jobs with sent or signed documents). */
export async function deleteJob(businessId: string, jobId: string): Promise<void> {
  ok(await db().from('jobs').delete().eq('id', jobId));
  await audit(businessId, 'job.deleted', 'job', jobId);
}

export async function insertTimeEntry(businessId: string, e: TimeEntry): Promise<void> {
  ok(await db().from('time_entries').insert({ id: e.id, business_id: businessId, job_id: e.jobId, worked_on: e.date, hundredths: e.hundredths, note: e.note.slice(0, 500) }));
}

export async function insertNote(businessId: string, n: { id: string; jobId: string; text: string }): Promise<void> {
  ok(await db().from('notes').insert({ id: n.id, business_id: businessId, job_id: n.jobId, body: n.text.slice(0, 4000) }));
}

/** The server refuses work on a job whose invoice was sent. */
export async function insertWorkItem(businessId: string, w: WorkItem): Promise<void> {
  ok(await db().from('work_items').insert({
    id: w.id, business_id: businessId, job_id: w.jobId, worked_on: w.date, price_item_ref: w.priceItemId ?? null,
    description: w.description.slice(0, 300), unit: w.unit, qty_hundredths: w.qtyHundredths, unit_cents: w.unitCents, kind: w.kind,
  }));
}

export async function deleteWorkItem(id: string): Promise<void> {
  ok(await db().from('work_items').delete().eq('id', id));
}

// ---------------------------------------------------------------- estimates

/** Saves a draft (its row and all its lines). Sent estimates are left alone; the server refuses edits anyway. */
export async function saveEstimate(businessId: string, jobId: string, draft: EstimateDraft): Promise<void> {
  if (draft.sent) return;
  const est = one(await db().from('estimates')
    .upsert({
      business_id: businessId,
      job_id: jobId,
      number: draft.number ?? 'E-1001',
      deposit_on: draft.depositOn,
      deposit_bps: draft.depositBps,
      scope: draft.scope ?? {},
    }, { onConflict: 'job_id' })
    .select('id')
    .single<{ id: string }>());
  // lines removed in the app are removed here
  const keep = draft.lines.map((l) => l.id);
  let removed = db().from('estimate_lines').delete().eq('estimate_id', est.id);
  if (keep.length) removed = removed.not('id', 'in', `(${keep.join(',')})`);
  ok(await removed);
  if (draft.lines.length) {
    ok(await db().from('estimate_lines').upsert(draft.lines.map((l, position) => ({
      id: l.id,
      business_id: businessId,
      estimate_id: est.id,
      price_item_ref: l.priceItemId ?? null,
      description: l.description.slice(0, 300),
      unit: l.unit,
      qty_hundredths: Math.max(0, l.qtyHundredths),
      unit_cents: l.unitCents,
      from_voice: !!l.fromVoice,
      kind: l.kind ?? 'labor',
      excluded: !!l.excluded,
      position,
    }))));
  }
}

/** Sends it: the server checks every included line is priced and freezes it from here on. */
export async function sendEstimate(businessId: string, jobId: string, tax: TaxRule): Promise<void> {
  const est = one(await db().from('estimates')
    .update({ sent_at: new Date().toISOString(), tax_rate_bps: tax.rateBps, tax_labor: tax.labor, tax_materials: tax.materials })
    .eq('job_id', jobId).select('id').single<{ id: string }>());
  await audit(businessId, 'estimate.sent', 'estimate', est.id);
}

export async function signEstimate(businessId: string, jobId: string, draft: EstimateDraft, signer: string): Promise<void> {
  const hash = await sha256(JSON.stringify({
    type: 'estimate', jobId, number: draft.number, lines: draft.lines, depositOn: draft.depositOn,
    depositBps: draft.depositBps, scope: draft.scope ?? {}, tax: draft.tax,
  }));
  const est = one(await db().from('estimates').update({ signed_at: new Date().toISOString() }).eq('job_id', jobId).select('id').single<{ id: string }>());
  ok(await db().from('signatures').insert({
    business_id: businessId, document_type: 'estimate', document_id: est.id, signer_name: signer.slice(0, 120), document_hash: hash, user_agent: deviceInfo(),
  }));
  await audit(businessId, 'estimate.signed', 'estimate', est.id);
}

// ---------------------------------------------------------------- change orders

export async function insertChangeOrder(businessId: string, co: ChangeOrder): Promise<void> {
  ok(await db().from('change_orders').insert({
    id: co.id, business_id: businessId, job_id: co.jobId, number: co.number, description: co.description,
    amount_cents: co.amountCents, base_cents: co.baseCents, sent_at: new Date().toISOString(),
  }));
  await audit(businessId, 'change_order.created', 'change_order', co.id);
}

export async function signChangeOrder(businessId: string, co: ChangeOrder, signer: string): Promise<void> {
  const hash = await sha256(JSON.stringify({
    type: 'change_order', jobId: co.jobId, number: co.number, description: co.description, amountCents: co.amountCents, baseCents: co.baseCents,
  }));
  ok(await db().from('change_orders').update({ signed_at: new Date().toISOString() }).eq('id', co.id));
  ok(await db().from('signatures').insert({
    business_id: businessId, document_type: 'change_order', document_id: co.id, signer_name: signer.slice(0, 120), document_hash: hash, user_agent: deviceInfo(),
  }));
  await audit(businessId, 'change_order.signed', 'change_order', co.id);
}

export async function declineChangeOrder(businessId: string, changeOrderId: string): Promise<void> {
  ok(await db().from('change_orders').update({ declined_at: new Date().toISOString() }).eq('id', changeOrderId));
  await audit(businessId, 'change_order.declined', 'change_order', changeOrderId);
}

// ---------------------------------------------------------------- invoices

export async function insertInvoice(businessId: string, invoice: Invoice): Promise<void> {
  ok(await db().from('invoices').insert({
    id: invoice.id, business_id: businessId, job_id: invoice.jobId, number: invoice.number,
    summary: invoice.summary.slice(0, 4000), labor_description: invoice.laborDescription.slice(0, 300),
  }));
  await audit(businessId, 'invoice.created', 'invoice', invoice.id);
}

/** Draft changes: billing check, materials display, location, summary. */
export async function updateInvoice(invoiceId: string, patch: {
  billing?: InvoiceBilling; materialsMode?: 'items' | 'total'; showLocation?: boolean; summary?: string;
}): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.billing) {
    row.labor_basis = patch.billing.labor;
    row.materials_basis = patch.billing.materials;
    row.billing_reviewed = patch.billing.reviewed;
  }
  if (patch.materialsMode) row.materials_mode = patch.materialsMode;
  if (patch.showLocation !== undefined) row.show_location = patch.showLocation;
  if (patch.summary !== undefined) row.summary = patch.summary.slice(0, 4000);
  ok(await db().from('invoices').update(row).eq('id', invoiceId));
}

/** Sends it: the lines exactly as sent, then the frozen copy of tax, scope, and due date. */
export async function sendInvoice(businessId: string, invoiceId: string, s: InvoiceSnapshot, showLocation: boolean): Promise<void> {
  ok(await db().from('invoice_lines').insert(s.lines.map((l, position) => ({
    business_id: businessId, invoice_id: invoiceId, kind: l.kind, description: l.description,
    qty_hundredths: l.qtyHundredths, unit_cents: l.unitCents, unit: l.unit ?? null, position,
  }))));
  ok(await db().from('invoices').update({
    sent_at: new Date().toISOString(),
    summary: s.summary.slice(0, 4000),
    materials_mode: s.materialsMode,
    show_location: showLocation,
    tax_rate_bps: s.tax.rateBps,
    tax_labor: s.tax.labor,
    tax_materials: s.tax.materials,
    issued_scope: s.scope ?? null,
    excluded_scope: s.excludedScope ?? [],
    due_days: s.dueDays,
    issued_on: s.issuedOn,
    issued_address: s.address.slice(0, 300),
    issued_work_order: s.workOrder?.slice(0, 60) ?? null,
  }).eq('id', invoiceId));
  await audit(businessId, 'invoice.sent', 'invoice', invoiceId);
}

/** Paid in cash or by check, marked by the owner. Card and bank payments come with Stripe. */
export async function markInvoicePaid(businessId: string, invoiceId: string, amountCents: number): Promise<void> {
  ok(await db().from('invoices').update({ paid_at: new Date().toISOString() }).eq('id', invoiceId));
  if (amountCents > 0) {
    ok(await db().from('payments').insert({ business_id: businessId, invoice_id: invoiceId, amount_cents: amountCents, method: 'other' }));
  }
  await audit(businessId, 'invoice.paid', 'invoice', invoiceId);
}

// ---------------------------------------------------------------- receipts

/** A receipt the owner typed in: the receipt, its items, and the job each item went to (if one). */
export async function insertReceipt(businessId: string, r: Receipt, jobId: string | null): Promise<void> {
  ok(await db().from('receipts').insert({
    id: r.id, business_id: businessId, store: r.store.slice(0, 120), receipt_number: r.number.slice(0, 60), purchased_on: r.date,
    tax_cents: r.taxCents, total_cents: r.items.reduce((a, i) => a + i.costCents, 0) + r.taxCents, status: 'ready',
  }));
  ok(await db().from('receipt_items').insert(r.items.map((i) => ({
    id: i.id, business_id: businessId, receipt_id: r.id, line: i.line, name: i.name.slice(0, 160), qty_label: i.qtyLabel,
    cost_cents: i.costCents, assignment: jobId ? 'jobs' : null,
  }))));
  if (jobId) {
    ok(await db().from('receipt_item_jobs').insert(r.items.map((i) => ({ receipt_item_id: i.id, job_id: jobId, business_id: businessId }))));
  }
}

/** Removes a receipt and its items (they cascade). */
export async function deleteReceipt(receiptId: string): Promise<void> {
  ok(await db().from('receipts').delete().eq('id', receiptId));
}

/** Which job(s) an item went to, or personal/overhead, or back to the inbox (null). */
export async function assignReceiptItem(businessId: string, itemId: string, a: Assignment | null): Promise<void> {
  ok(await db().from('receipt_items').update({ assignment: a?.type ?? null }).eq('id', itemId));
  ok(await db().from('receipt_item_jobs').delete().eq('receipt_item_id', itemId));
  if (a?.type === 'jobs') {
    ok(await db().from('receipt_item_jobs').insert(a.jobIds.map((jobId, i) => ({
      receipt_item_id: itemId, job_id: jobId, business_id: businessId, weight: Math.max(1, a.weights?.[i] ?? 1),
    }))));
  }
}

export async function updateReceiptItem(itemId: string, patch: { fixedName?: string | null; markupOff?: boolean }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.fixedName !== undefined) row.fixed_name = patch.fixedName?.slice(0, 160) || null;
  if (patch.markupOff !== undefined) row.markup_off = patch.markupOff;
  ok(await db().from('receipt_items').update(row).eq('id', itemId));
}
