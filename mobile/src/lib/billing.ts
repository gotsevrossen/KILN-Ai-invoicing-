import type { DocLine, EstimateDraft, InvoiceBilling, Job, Assignment, PriceItem, WorkItem } from '../data/types.ts';
import { splitByWeights, type Cents } from './money.ts';

/** Every included item must be deliberate, valid and priced before issue/signing. */
export function estimateReady(draft: EstimateDraft): boolean {
  const included = draft.lines.filter((line) => !line.excluded);
  return included.length > 0 && included.every((line) =>
    line.description.trim().length > 0 && Number.isSafeInteger(line.qtyHundredths) && line.qtyHundredths > 0 &&
    line.unitCents !== null && Number.isSafeInteger(line.unitCents) && line.unitCents >= 0 &&
    Number.isSafeInteger(line.qtyHundredths * line.unitCents),
  );
}

export function estimateLines(draft: EstimateDraft): DocLine[] {
  return draft.lines
    .filter((line) => !line.excluded && line.unitCents !== null && line.qtyHundredths > 0)
    .map((line) => ({ id: line.id, kind: line.kind ?? 'labor', description: line.description,
      qtyHundredths: line.qtyHundredths, unitCents: line.unitCents!, unit: line.unit }));
}

export function defaultBilling(hasAgreedPrice: boolean): InvoiceBilling {
  // With an agreement, costs stay costs until the owner elects to bill them separately.
  return { labor: 'actual', materials: hasAgreedPrice ? 'included' : 'additional', reviewed: !hasAgreedPrice };
}

export function needsActualHours(job: Pick<Job, 'pricing' | 'rateCents'>, estimate: EstimateDraft | undefined, billing: InvoiceBilling, hours: number): boolean {
  return job.pricing === 'hourly' && !!estimate?.signed && billing.labor === 'actual' &&
    estimate.lines.some((line) => !line.excluded && (line.kind ?? 'labor') === 'labor' && line.unit === 'hour') &&
    (hours <= 0 || job.rateCents === undefined);
}

/** Replace estimated hours with actual hours; never append both for the same labor. */
export function composeInvoiceLines(input: {
  job: Pick<Job, 'pricing' | 'rateCents'>;
  estimate?: EstimateDraft;
  billing: InvoiceBilling;
  hours: number;
  laborDescription: string;
  fees: DocLine[];
  changes: DocLine[];
  /** Work the owner typed in on the job; always billed, on top of any agreed price. */
  work: DocLine[];
  materials: DocLine[];
}): DocLine[] {
  const { job, estimate, billing } = input;
  const actual = job.pricing === 'hourly' && (!estimate?.signed || billing.labor === 'actual');
  const agreed = estimate?.signed ? estimateLines(estimate).filter((line) =>
    !(actual && line.kind === 'labor' && line.unit === 'hour'),
  ).map((line) => ({ ...line, id: `est-${line.id}` })) : [];
  const lines: DocLine[] = [...agreed, ...input.changes, ...input.work];
  if (actual && job.rateCents !== undefined && input.hours > 0) {
    lines.push({ id: 'labor', kind: 'labor', description: input.laborDescription,
      qtyHundredths: input.hours, unitCents: job.rateCents, unit: 'hour' });
  }
  lines.push(...input.fees);
  if (billing.materials === 'additional') {
    const seen = new Set<string>();
    for (const line of input.materials) {
      if (!seen.has(line.id)) { lines.push(line); seen.add(line.id); }
    }
  }
  return lines;
}

/** A work item can be saved: a description, a quantity above zero, and a price (zero is fine). */
export function workItemValid(item: Pick<WorkItem, 'description' | 'qtyHundredths' | 'unitCents'>): boolean {
  const { description, qtyHundredths: qty, unitCents: cents } = item;
  return description.trim().length > 0 && description.length <= 300 &&
    Number.isSafeInteger(qty) && qty > 0 && qty <= 100_000_000 &&
    Number.isSafeInteger(cents) && cents >= 0 && cents <= 100_000_000 &&
    Number.isSafeInteger(qty * cents);
}

/** What the owner usually charges for this line: its price list item, or the item with the same name. */
export function usualPrice(line: { priceItemId?: string; description: string }, priceList: PriceItem[]): Cents | null {
  const name = line.description.trim().toLowerCase();
  const item = priceList.find((p) => p.id === line.priceItemId) ?? (name ? priceList.find((p) => p.name.trim().toLowerCase() === name) : undefined);
  return item?.unitCents ?? null;
}

/**
 * Probably a typo: 5 times the usual price or more, or a fifth of it or less ($15 typed for $150).
 * Free (zero) and unpriced lines aren't checked: zero is allowed on purpose.
 */
export function priceLooksOff(cents: Cents | null, usual: Cents | null): boolean {
  if (cents === null || usual === null || cents <= 0 || usual <= 0) return false;
  return cents >= usual * 5 || cents * 5 <= usual;
}

export function workLines(items: WorkItem[]): DocLine[] {
  return items.map((w) => ({ id: `work-${w.id}`, kind: w.kind, description: w.description,
    qtyHundredths: w.qtyHundredths, unitCents: w.unitCents, unit: w.unit }));
}

/** Quantity/ratio allocation, preserving every cent including receipt tax. */
export function receiptShares(totalCents: number, assignment: Extract<Assignment, { type: 'jobs' }>): number[] {
  if (assignment.jobIds.length === 0 || new Set(assignment.jobIds).size !== assignment.jobIds.length) {
    throw new Error('Choose distinct jobs');
  }
  const weights = assignment.weights ?? assignment.jobIds.map(() => 1);
  if (weights.length !== assignment.jobIds.length || weights.some((w) => !Number.isSafeInteger(w) || w <= 0)) {
    throw new Error('Each job needs a positive quantity');
  }
  return splitByWeights(totalCents, weights);
}

export function copyDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
