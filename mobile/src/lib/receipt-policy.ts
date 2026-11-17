/** Only an explicit work classification permits a receipt item to be saved. */
export type ReceiptEligibility = 'work' | 'non_work' | 'uncertain';

export function receiptEligibility(value: unknown): ReceiptEligibility {
  return value === 'work' || value === 'non_work' ? value : 'uncertain';
}

/** Every input row must be reviewed exactly once. Never accept a partial approval. */
export function checkReceiptReview(raw: unknown, count: number): ReceiptEligibility[] | null {
  if (!raw || typeof raw !== 'object' || !('items' in raw) || !Array.isArray(raw.items) || raw.items.length !== count) return null;
  const result: ReceiptEligibility[] = Array.from({ length: count }, () => 'uncertain');
  const seen = new Set<number>();
  for (const row of raw.items) {
    if (!row || typeof row !== 'object' || !Number.isInteger(row.index) || row.index < 0 || row.index >= count || seen.has(row.index)) return null;
    seen.add(row.index);
    result[row.index] = receiptEligibility(row.eligibility);
  }
  return result;
}

export class ReceiptRefused extends Error {
  readonly eligibility: ReceiptEligibility[];

  constructor(eligibility: ReceiptEligibility[]) {
    super('receipt_refused');
    this.eligibility = eligibility;
  }
}

/** Review before any local or queued write, including receipts entered by hand. */
export async function withReceiptReview<T>(
  review: () => Promise<ReceiptEligibility[]>,
  count: number,
  save: () => T,
): Promise<T> {
  const eligibility = await review();
  if (count < 1 || eligibility.length !== count || eligibility.some((value) => value !== 'work')) throw new ReceiptRefused(eligibility);
  return save();
}
