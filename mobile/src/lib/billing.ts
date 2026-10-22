import type { DocLine, EstimateDraft, InvoiceBilling, Job, Assignment } from '../data/types.ts';
import { splitByWeights } from './money.ts';

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
  materials: DocLine[];
}): DocLine[] {
  const { job, estimate, billing } = input;
  const actual = job.pricing === 'hourly' && (!estimate?.signed || billing.labor === 'actual');
  const agreed = estimate?.signed ? estimateLines(estimate).filter((line) =>
    !(actual && line.kind === 'labor' && line.unit === 'hour'),
  ).map((line) => ({ ...line, id: `est-${line.id}` })) : [];
  const lines: DocLine[] = [...agreed, ...input.changes];
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
