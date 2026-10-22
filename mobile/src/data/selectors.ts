import { applyMarkup, documentTotals, percentOf, splitByWeights, type Cents, type Totals } from '@/lib/money';
import { composeInvoiceLines, defaultBilling, estimateLines, receiptShares } from '@/lib/billing';

import * as sample from './sample';
import type { State } from './store';
import type { ChangeOrder, Customer, DocLine, EstimateDraft, Invoice, Job, Receipt, ReceiptItem } from './types';

// Read-only views over the example data plus what the owner changed this session.

export function jobById(id: string): Job {
  const job = sample.jobs.find((j) => j.id === id);
  if (!job) throw new Error(`No job ${id}`);
  return job;
}

export function customerById(id: string): Customer {
  const c = sample.customers.find((x) => x.id === id);
  if (!c) throw new Error(`No customer ${id}`);
  return c;
}

export const customerOf = (job: Job) => customerById(job.customerId);

export function receiptById(id: string): Receipt {
  const r = sample.receipts.find((x) => x.id === id);
  if (!r) throw new Error(`No receipt ${id}`);
  return r;
}

export function receiptItemById(id: string): ReceiptItem {
  for (const r of sample.receipts) {
    const item = r.items.find((i) => i.id === id);
    if (item) return item;
  }
  throw new Error(`No receipt item ${id}`);
}

export const invoiceForJob = (jobId: string): Invoice | undefined => sample.invoices.find((i) => i.jobId === jobId);
export const invoiceById = (id: string): Invoice | undefined => sample.invoices.find((i) => i.id === id);
export const changeOrdersForJob = (jobId: string): ChangeOrder[] => sample.changeOrders.filter((c) => c.jobId === jobId);
export const changeOrderById = (id: string): ChangeOrder | undefined => sample.changeOrders.find((c) => c.id === id);

export function hoursFor(state: State, jobId: string): number {
  return state.timeEntries.filter((t) => t.jobId === jobId).reduce((a, t) => a + t.hundredths, 0);
}

/** What this job pays for an item: its even share if the item was split across jobs. */
/**
 * What an item really cost: its price plus its share of the receipt's tax.
 * The tax is split across the receipt's items by price, to the cent (the shares add
 * back to the receipt's tax exactly). This is the cost that goes on jobs and gets markup.
 */
export function itemCostWithTax(item: ReceiptItem): Cents {
  const receipt = sample.receipts.find((r) => r.items.some((i) => i.id === item.id));
  if (!receipt || receipt.taxCents === 0) return item.costCents;
  const shares = splitByWeights(receipt.taxCents, receipt.items.map((i) => i.costCents));
  return item.costCents + shares[receipt.items.findIndex((i) => i.id === item.id)];
}

export function shareOf(state: State, item: ReceiptItem, jobId: string): Cents {
  const a = state.assignments[item.id];
  if (!a || a.type !== 'jobs') return 0;
  const index = a.jobIds.indexOf(jobId);
  if (index === -1) return 0;
  return receiptShares(itemCostWithTax(item), a)[index];
}

export function partsCost(state: State, jobId: string): Cents {
  let sum = 0;
  for (const r of sample.receipts) for (const item of r.items) sum += shareOf(state, item, jobId);
  return sum;
}

/** Receipts with at least one item on this job, and how many. */
export function receiptsOnJob(state: State, jobId: string) {
  return sample.receipts
    .map((r) => {
      const items = r.items.filter((i) => shareOf(state, i, jobId) > 0);
      return { receipt: r, items, cost: items.reduce((a, i) => a + shareOf(state, i, jobId), 0) };
    })
    .filter((x) => x.items.length > 0);
}

export function billedPrice(state: State, item: ReceiptItem, jobId: string): Cents {
  const share = shareOf(state, item, jobId) || itemCostWithTax(item);
  return state.markupOff[item.id] ? share : applyMarkup(share, state.settings.markupBps);
}

/**
 * An invoice's lines, built from the job right now: the signed estimate, signed
 * change orders, logged hours (hourly jobs), fees, and receipt items with markup.
 */
export function invoiceLines(state: State, invoice: Invoice): DocLine[] {
  const issued = state.issuedInvoices[invoice.id];
  if (issued) return issued.lines;
  const job = jobById(invoice.jobId);
  const draft = state.estimates[job.id];
  const changes: DocLine[] = changeOrdersForJob(job.id).filter((co) => state.signed[co.id])
    .map((co) => ({ id: co.id, kind: 'labor', description: co.description, qtyHundredths: 100, unitCents: co.amountCents }));
  const materialIds = invoice.materialItemIds
    ? [...invoice.materialItemIds]
    : receiptsOnJob(state, job.id).flatMap((r) => r.items.map((i) => i.id));
  if (invoice.suggestion && state.acceptedSuggestions.includes(invoice.suggestion.id)) {
    materialIds.push(invoice.suggestion.receiptItemId);
  }
  const materials: DocLine[] = [];
  for (const id of new Set(materialIds)) {
    const item = receiptItemById(id);
    const name = item.qtyLabel && item.qtyLabel !== '× 1' ? `${item.name} ${item.qtyLabel}` : item.name;
    materials.push({ id, kind: 'material', description: state.fixedNames[id] ?? name, qtyHundredths: 100, unitCents: billedPrice(state, item, job.id) });
  }
  return composeInvoiceLines({ job, estimate: draft, billing: invoiceBilling(state, invoice),
    hours: hoursFor(state, job.id), laborDescription: invoice.laborDescription, fees: invoice.fees, changes, materials });
}

export function invoiceBilling(state: State, invoice: Invoice) {
  return state.invoiceBilling[invoice.id] ?? defaultBilling(!!state.estimates[invoice.jobId]?.signed);
}

export function invoiceSummary(state: State, invoice: Invoice): string {
  return state.issuedInvoices[invoice.id]?.summary ?? state.invoiceSummaries[invoice.id] ?? invoice.summary;
}

export function invoiceTax(state: State, invoice: Invoice) {
  return state.issuedInvoices[invoice.id]?.tax ?? state.estimates[invoice.jobId]?.tax ?? state.settings.tax;
}

/** What KILN built the invoice from, for the "built from" line. */
export function invoiceSources(state: State, invoice: Invoice) {
  if (invoice.sources) return invoice.sources;
  const jobId = invoice.jobId;
  const photos =
    sample.timeline.reduce((a, x) => (x.jobId === jobId && x.kind === 'photos' ? a + x.tags.length : a), 0) +
    state.captures.filter((c) => c.jobId === jobId && c.kind === 'photo').length;
  const voice =
    sample.timeline.filter((x) => x.jobId === jobId && x.kind === 'voice').length +
    state.captures.filter((c) => c.jobId === jobId && c.kind === 'voice').length;
  return { photos, voice, receipts: receiptsOnJob(state, jobId).length };
}

export function invoiceTotals(state: State, invoice: Invoice): Totals {
  return documentTotals(invoiceLines(state, invoice), invoiceTax(state, invoice));
}

export function suggestionOpen(state: State, invoice: Invoice): boolean {
  const s = invoice.suggestion;
  return !!s && !state.acceptedSuggestions.includes(s.id) && !state.dismissedSuggestions.includes(s.id);
}

export function changeOrderTotal(co: ChangeOrder): Cents {
  return co.baseCents + co.amountCents;
}

/** Change-order approval shows the pre-tax base; tax stays in document totals. */
export function changeOrderBase(state: State, job: Job): Cents {
  const invoice = invoiceForJob(job.id);
  if (invoice) return documentTotals(invoiceLines(state, invoice), { rateBps: 0, labor: false, materials: false }).subtotal;
  const approved = changeOrdersForJob(job.id).filter((co) => state.signed[co.id]).reduce((sum, co) => sum + co.amountCents, 0);
  if (state.estimates[job.id]?.signed) return estimateTotals(state, job.id).subtotal + approved;
  const saved = sample.customerEstimates.find((estimate) => estimate.jobId === job.id);
  if (saved) return documentTotals(saved.lines, { rateBps: 0, labor: false, materials: false }).subtotal + approved;
  return (changeOrdersForJob(job.id)[0]?.baseCents ?? job.amountCents ?? 0) + approved;
}

export function estimateDraft(state: State, jobId: string): EstimateDraft {
  return state.estimates[jobId] ?? { lines: [], depositOn: true, depositBps: state.settings.depositBps, sent: false, signed: false };
}

/** Included priced lines for totals; estimateReady separately blocks unresolved issue/signing. */
export function estimateDocLines(draft: EstimateDraft): DocLine[] {
  return estimateLines(draft);
}

export function estimateTotals(state: State, jobId: string) {
  const draft = estimateDraft(state, jobId);
  const totals = documentTotals(estimateDocLines(draft), draft.tax ?? state.settings.tax);
  return { ...totals, deposit: draft.depositOn ? percentOf(totals.total, draft.depositBps) : 0 };
}

export type JobStatus =
  | 'invoiceReady'
  | 'sent'
  | 'needsSignature'
  | 'inProgress'
  | 'estimateSent'
  | 'overdue'
  | 'repeat'
  | 'viewed'
  | 'paid'
  | 'needsEstimate';

/** The steps every job moves through. */
export type Stage = 'estimate' | 'work' | 'invoice' | 'paid';
export type StageDetail = 'estimateDraft' | 'estimateWaiting' | 'working' | 'invoiceDraft' | 'invoiceSent' | 'paid';

export function jobStage(state: State, job: Job): { stage: Stage; detail: StageDetail } {
  if (job.baseStatus === 'paid') return { stage: 'paid', detail: 'paid' };
  const invoice = invoiceForJob(job.id);
  if (invoice) {
    if (state.paidInvoices.includes(invoice.id)) return { stage: 'paid', detail: 'paid' };
    const sent = state.sentInvoices.includes(invoice.id);
    // taken back to work from an unsent draft; once sent, there's no going back
    if (!sent && state.reopenedJobs.includes(job.id)) return { stage: 'work', detail: 'working' };
    return { stage: 'invoice', detail: sent ? 'invoiceSent' : 'invoiceDraft' };
  }
  if (job.baseStatus === 'overdue' || job.baseStatus === 'viewed') return { stage: 'invoice', detail: 'invoiceSent' };
  if (job.baseStatus === 'repeat') return { stage: 'work', detail: 'working' };
  if (job.baseStatus === 'estimateSent') return { stage: 'estimate', detail: 'estimateWaiting' };
  const draft = state.estimates[job.id];
  if (draft?.signed || state.skippedEstimates.includes(job.id) || changeOrdersForJob(job.id).length > 0) {
    return { stage: 'work', detail: 'working' };
  }
  return { stage: 'estimate', detail: draft?.sent ? 'estimateWaiting' : 'estimateDraft' };
}

export function jobStatus(state: State, job: Job): JobStatus {
  if (job.baseStatus !== 'live') return job.baseStatus;
  const invoice = invoiceForJob(job.id);
  if (invoice) {
    if (state.paidInvoices.includes(invoice.id)) return 'paid';
    if (state.sentInvoices.includes(invoice.id)) return 'sent';
    if (!state.reopenedJobs.includes(job.id)) return 'invoiceReady';
  }
  if (changeOrdersForJob(job.id).some((co) => !state.signed[co.id] && !state.declinedChanges.includes(co.id))) return 'needsSignature';
  const { detail } = jobStage(state, job);
  if (detail === 'estimateDraft') return 'needsEstimate';
  if (detail === 'estimateWaiting') return 'estimateSent';
  return 'inProgress';
}

/** Which Jobs tab a job shows under, now. */
export function jobGroup(state: State, job: Job): Job['group'] {
  const { stage, detail } = jobStage(state, job);
  if (stage === 'paid') return 'paid';
  if (detail === 'invoiceSent') return 'done';
  return job.group;
}

export function jobAmount(state: State, job: Job): Cents {
  const invoice = invoiceForJob(job.id);
  if (invoice) return invoiceTotals(state, invoice).total;
  const cos = changeOrdersForJob(job.id);
  if (cos.length) return cos.reduce((a, co) => a + (state.signed[co.id] ? co.amountCents : 0), cos[0].baseCents);
  const est = sample.customerEstimates.find((e) => e.jobId === job.id);
  if (est) return documentTotals(est.lines, { rateBps: 0, labor: false, materials: false }).total;
  if (state.estimates[job.id]?.lines.length) return estimateTotals(state, job.id).total;
  return job.amountCents ?? 0;
}

export function unsortedItems(state: State, receipt: Receipt): ReceiptItem[] {
  return receipt.items.filter((i) => !state.assignments[i.id]);
}

export function homeSummary(state: State) {
  let owed = 0;
  let overdueCount = 0;
  let overdueCents = 0;
  let paidCents = 0;
  for (const job of sample.jobs) {
    const status = jobStatus(state, job);
    const amount = jobAmount(state, job);
    if (status === 'overdue') {
      overdueCount += 1;
      overdueCents += amount;
    }
    if (status === 'overdue' || status === 'viewed' || status === 'sent') owed += amount;
    if (status === 'paid') paidCents += amount;
  }
  return { owed, overdueCount, overdueCents, paidCents };
}

/** Which tax label to show: on everything, labor only, or materials only. Null when nothing is taxed. */
export function taxScope(state: State, invoice?: Invoice): 'all' | 'labor' | 'materials' | null {
  const tax = invoice ? invoiceTax(state, invoice) : state.settings.tax;
  if (tax.rateBps === 0 || (!tax.labor && !tax.materials)) return null;
  if (tax.labor && tax.materials) return 'all';
  return tax.labor ? 'labor' : 'materials';
}
