import { db, ok } from './db-client';
import type { SavedSnapshot } from './job-cleanup';
import { addDays } from '@/lib/format';
import { billingCsv } from '@/lib/billing-csv';
import { savedTotals } from '@/lib/saved-doc';

export interface ExportInvoice {
  number: string; customer: string; job: string; issuedOn: string | null; dueOn: string | null;
  status: string; total: number; paid: number;
}
interface ExportPayment { number: string | null; customer: string; job: string; jobId: string | null; date: string | null; amount: number; method: string }
type ArchivedInvoice = SavedSnapshot & { archivedJobId: string };
type Kind = 'invoice' | 'payment' | 'archived';

async function rows<T>(businessId: string, kind: Kind): Promise<{ record_id: string; data: T }[]> {
  const result: { record_id: string; data: T }[] = [];
  let after: string | null = null;
  do {
    const page = ok(await db().rpc('billing_export_page', { p_business: businessId, p_kind: kind, p_after: after })) as { record_id: string; data: T }[];
    result.push(...page);
    after = page.length === 100 ? page[99].record_id : null;
  } while (after);
  return result;
}

export async function loadInvoiceRegister(businessId: string) {
  const [open, archive] = await Promise.all([rows<ExportInvoice>(businessId, 'invoice'), rows<SavedSnapshot>(businessId, 'archived')]);
  const savedIds = new Set(archive.map(({ data }) => data.document.id));
  return [...open.filter(({ record_id }) => !savedIds.has(record_id)).map((row) => ({ ...row, archived: false })), ...archive.map(({ record_id, data }) => {
    const totals = savedTotals(data);
    const issuedOn = data.document.issued_on ?? data.document.sent_at?.slice(0, 10) ?? null;
    const dueOn = issuedOn && data.document.due_days != null ? addDays(issuedOn, data.document.due_days) : null;
    return { record_id, archived: true, data: { number: data.document.number ?? '', customer: data.customer.name, job: data.job.title,
      issuedOn, dueOn, status: totals.due ? 'issued' : 'paid', total: totals.total, paid: totals.paid } };
  })].sort((a, b) => (b.data.issuedOn ?? '').localeCompare(a.data.issuedOn ?? ''));
}

export function invoiceRegisterCsv(data: ExportInvoice[]) {
  return billingCsv([['Invoice', 'Customer', 'Job', 'Issued', 'Due', 'Status', 'Total USD', 'Paid USD', 'Balance USD'],
    ...data.map((row) => [row.number, row.customer, row.job, row.issuedOn, row.dueOn, row.status, row.total / 100, row.paid / 100, Math.max(0, row.total - row.paid) / 100])]);
}

export async function paymentRegisterCsv(businessId: string) {
  const [payments, archive] = await Promise.all([rows<ExportPayment>(businessId, 'payment'), rows<ArchivedInvoice>(businessId, 'archived')]);
  const archives = new Set(archive.map(({ data }) => data.archivedJobId));
  const entries = [...payments.map(({ data }) => data).filter((row) => !row.jobId || !archives.has(row.jobId)), ...archive.flatMap(({ data }) => data.payments
    .filter((payment) => !payment.status || payment.status === 'succeeded' || payment.status === 'paid')
    .map((payment) => ({ number: data.document.number ?? null, customer: data.customer.name, job: data.job.title, date: payment.paidAt,
      amount: payment.amountCents, method: payment.method })))].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return billingCsv([['Invoice', 'Customer', 'Job', 'Payment date', 'Amount USD', 'Method'],
    ...entries.map((row) => [row.number, row.customer, row.job, row.date, row.amount / 100, row.method])]);
}
