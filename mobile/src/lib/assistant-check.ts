// The app's own check on what the KILN chat sends back (supabase/functions/ai, task 'assistant').
// The server checks too; this keeps a bad or tampered reply from becoming an action. Anything that
// doesn't fit is dropped, never guessed.

export type AssistantAction =
  | { type: 'hours'; jobId: string | null; hundredths: number; note: string }
  | { type: 'work'; jobId: string | null; description: string; qtyHundredths: number; unitCents: number | null; itemId: string | null; kind: 'labor' | 'material' | 'fee' }
  | { type: 'note'; jobId: string | null; text: string }
  | { type: 'invoice' | 'estimate'; jobId: string | null; send: boolean }
  | { type: 'cashPaid'; jobId: string | null; cents: number }
  | { type: 'laborRate'; cents: number }
  | { type: 'newJob'; customer: string; address: string; title: string; pricing: 'hourly' | 'flat' | null }
  | { type: 'changeOrder'; jobId: string | null; description: string; cents: number | null }
  | { type: 'sortReceipt'; receiptItemId: string; jobId: string | null; sortTo: 'job' | 'personal' | 'overhead' }
  | { type: 'remind'; jobId: string | null };

export interface AssistantReply { offTopic: boolean; reply: string; actions: AssistantAction[] }

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const whole = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : null);

/** Only ids KILN sent can come back; amounts are whole cents in range. */
export function checkAssistantReply(raw: unknown, known: { jobIds: string[]; itemIds: string[]; inboxIds: string[] }): AssistantReply {
  const r = rec(raw);
  if (!r || typeof r.reply !== 'string') throw new Error('bad reply');
  if (r.offTopic === true) return { offTopic: true, reply: str(r.reply, 400), actions: [] };
  const jobs = new Set(known.jobIds); const items = new Set(known.itemIds); const inbox = new Set(known.inboxIds);
  const job = (v: unknown) => (typeof v === 'string' && jobs.has(v) ? v : null);
  const list = Array.isArray(r.actions) ? r.actions : [];
  const actions = list.flatMap((value): AssistantAction[] => {
    const a = rec(value);
    if (!a) return [];
    const jobId = job(a.jobId);
    switch (a.type) {
      case 'hours': { const h = whole(a.hundredths, 1, 2400); return h ? [{ type: 'hours', jobId, hundredths: h, note: str(a.note, 200) }] : []; }
      case 'work': {
        const description = str(a.description, 300); const qty = whole(a.qtyHundredths, 1, 100_000_000);
        const kind = a.kind === 'material' || a.kind === 'fee' ? a.kind : 'labor';
        const itemId = typeof a.itemId === 'string' && items.has(a.itemId) ? a.itemId : null;
        return description && qty ? [{ type: 'work', jobId, description, qtyHundredths: qty, unitCents: whole(a.unitCents, 0, 100_000_000), itemId, kind }] : [];
      }
      case 'note': { const text = str(a.text, 2000); return text ? [{ type: 'note', jobId, text }] : []; }
      case 'invoice': case 'estimate': return [{ type: a.type, jobId, send: a.send === true }];
      case 'cashPaid': { const c = whole(a.cents, 1, 100_000_000); return c ? [{ type: 'cashPaid', jobId, cents: c }] : []; }
      case 'laborRate': { const c = whole(a.cents, 1, 10_000_000); return c ? [{ type: 'laborRate', cents: c }] : []; }
      case 'newJob': {
        const customer = str(a.customer, 120);
        return customer ? [{ type: 'newJob', customer, address: str(a.address, 300), title: str(a.title, 200),
          pricing: a.pricing === 'hourly' || a.pricing === 'flat' ? a.pricing : null }] : [];
      }
      case 'changeOrder': { const d = str(a.description, 2000); return d ? [{ type: 'changeOrder', jobId, description: d, cents: whole(a.cents, 0, 100_000_000) }] : []; }
      case 'sortReceipt': {
        if (typeof a.receiptItemId !== 'string' || !inbox.has(a.receiptItemId)) return [];
        const sortTo = a.sortTo === 'personal' || a.sortTo === 'overhead' ? a.sortTo : 'job';
        return [{ type: 'sortReceipt', receiptItemId: a.receiptItemId, jobId: sortTo === 'job' ? jobId : null, sortTo }];
      }
      case 'remind': return [{ type: 'remind', jobId }];
      default: return [];
    }
  });
  return { offTopic: false, reply: str(r.reply, 2000), actions: actions.slice(0, 10) };
}

/** Steps that change money, prices or what a customer receives get their own confirmation. */
export const needsOwnConfirm = (a: AssistantAction): boolean =>
  a.type === 'cashPaid' || a.type === 'laborRate' || ((a.type === 'invoice' || a.type === 'estimate') && a.send) || a.type === 'remind';

/** A step can run only once it knows its job (and, for sorting to a job, which one). */
export function stepReady(a: AssistantAction): boolean {
  if (a.type === 'laborRate' || a.type === 'newJob') return true;
  if (a.type === 'sortReceipt') return a.sortTo !== 'job' || a.jobId !== null;
  if (a.type === 'work') return a.jobId !== null && a.unitCents !== null;
  return a.jobId !== null;
}
