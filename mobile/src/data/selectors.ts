import { applyMarkup, documentTotals, percentOf, splitByWeights, type Cents, type Totals } from '@/lib/money';

import * as sample from './sample';
import type { State } from './store';
import type { ChangeOrder, Customer, DocLine, Invoice, Job, Receipt, ReceiptItem } from './types';

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
export function shareOf(state: State, item: ReceiptItem, jobId: string): Cents {
  const a = state.assignments[item.id];
  if (!a || a.type !== 'jobs') return 0;
  const index = a.jobIds.indexOf(jobId);
  if (index === -1) return 0;
  return splitByWeights(item.costCents, a.jobIds.map(() => 1))[index];
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
  const share = shareOf(state, item, jobId) || item.costCents;
  return state.markupOff[item.id] ? share : applyMarkup(share, sample.business.markupBps);
}

export function invoiceLines(state: State, invoice: Invoice): DocLine[] {
  const job = jobById(invoice.jobId);
  const lines: DocLine[] = [];
  const hours = hoursFor(state, job.id);
  if (job.pricing === 'hourly' && job.rateCents && hours > 0) {
    lines.push({ id: 'labor', kind: 'labor', description: invoice.laborDescription, qtyHundredths: hours, unitCents: job.rateCents, unit: 'hour' });
  }
  lines.push(...invoice.fees);
  const materialIds = [...invoice.materialItemIds];
  if (invoice.suggestion && state.acceptedSuggestions.includes(invoice.suggestion.id)) {
    materialIds.push(invoice.suggestion.receiptItemId);
  }
  for (const id of materialIds) {
    const item = receiptItemById(id);
    const name = item.qtyLabel && item.qtyLabel !== '× 1' ? `${item.name} ${item.qtyLabel}` : item.name;
    lines.push({ id, kind: 'material', description: name, qtyHundredths: 100, unitCents: billedPrice(state, item, job.id) });
  }
  return lines;
}

export function invoiceTotals(state: State, invoice: Invoice): Totals {
  return documentTotals(invoiceLines(state, invoice), sample.business.tax);
}

export function suggestionOpen(state: State, invoice: Invoice): boolean {
  const s = invoice.suggestion;
  return !!s && !state.acceptedSuggestions.includes(s.id) && !state.dismissedSuggestions.includes(s.id);
}

export function changeOrderTotal(co: ChangeOrder): Cents {
  return co.baseCents + co.amountCents;
}

export function estimateLines(state: State, names: { boards: string; railing: string; wash: string; haul: string }): DocLine[] {
  const price = (id: string) => sample.priceList.find((p) => p.id === id)!;
  const e = state.estimate;
  const lines: DocLine[] = [
    { id: 'boards', kind: 'labor', description: names.boards, qtyHundredths: e.boards * 100, unitCents: price('deck-board').unitCents, unit: 'board' },
    { id: 'railing', kind: 'labor', description: names.railing, qtyHundredths: e.railingFt * 100, unitCents: price('railing').unitCents, unit: 'linear_ft' },
    { id: 'wash', kind: 'labor', description: names.wash, qtyHundredths: e.deckSqFt * 100, unitCents: price('wash-seal').unitCents, unit: 'sq_ft' },
  ];
  if (e.haulCents !== null) {
    lines.push({ id: 'haul', kind: 'fee', description: names.haul, qtyHundredths: 100, unitCents: e.haulCents, unit: 'flat' });
  }
  return lines.filter((l) => l.qtyHundredths > 0);
}

export function estimateTotals(state: State) {
  const lines = estimateLines(state, { boards: '', railing: '', wash: '', haul: '' });
  const totals = documentTotals(lines, { rateBps: 0, labor: false, materials: false });
  return { ...totals, deposit: percentOf(totals.total, sample.business.depositBps) };
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
  | 'paid';

export function jobStatus(state: State, job: Job): JobStatus {
  if (job.baseStatus !== 'live') return job.baseStatus;
  const invoice = invoiceForJob(job.id);
  if (invoice) return state.sentInvoices.includes(invoice.id) ? 'sent' : 'invoiceReady';
  const pending = changeOrdersForJob(job.id).some((co) => !state.signed[co.id]);
  return pending ? 'needsSignature' : 'inProgress';
}

export function jobAmount(state: State, job: Job): Cents {
  const invoice = invoiceForJob(job.id);
  if (invoice) return invoiceTotals(state, invoice).total;
  const cos = changeOrdersForJob(job.id);
  if (cos.length) return cos.reduce((a, co) => a + (state.signed[co.id] ? co.amountCents : 0), cos[0].baseCents);
  const est = sample.customerEstimates.find((e) => e.jobId === job.id);
  if (est) return documentTotals(est.lines, { rateBps: 0, labor: false, materials: false }).total;
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
