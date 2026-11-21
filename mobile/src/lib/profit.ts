import { applyMarkup, type Cents } from './money.ts';

// Job profitability from what KILN already knows. Nothing here is typed in for profitability:
// hours come from Log hours, the rate is the job's own (set when the job was created), markup is
// the Settings markup, and costs are the receipts sorted to the job (with their share of tax).

export interface ReceiptCost {
  /** What the job paid for the item, tax share included. */
  costCents: Cents;
  /** The owner turned markup off for this item. */
  markupOff?: boolean;
}

/** What receipt items are billed at: cost plus the Settings markup, unless turned off for an item. */
export function materialsBilledCents(items: ReceiptCost[], markupBps: number): Cents {
  return items.reduce((sum, item) => sum + (item.markupOff ? item.costCents : applyMarkup(item.costCents, markupBps)), 0);
}

export interface EarningsInput {
  /** Hourly jobs: logged hours x the job's rate. Flat jobs: the agreed price, materials left out. */
  laborCents: Cents;
  /** Work done typed in on the job, and signed change orders (a credit makes it lower). */
  workCents: Cents;
  /** What the receipt items cost the owner. */
  materialCostCents: Cents;
  /** What the customer is charged for them (0 when materials are included in an agreed price). */
  materialBilledCents: Cents;
}

export interface Earnings extends EarningsInput {
  /** Charged to the customer, before sales tax. */
  revenueCents: Cents;
  /** Materials billed minus what they cost. */
  markupCents: Cents;
  /** Revenue minus receipt costs: what the job brings in for the owner. */
  earnedCents: Cents;
  /** Earned as a share of revenue, in basis points. Null with no revenue. */
  marginBps: number | null;
}

export function jobEarnings(input: EarningsInput): Earnings {
  for (const [key, n] of Object.entries(input)) {
    // a credit change order can make work negative; nothing else can be
    if (!Number.isSafeInteger(n) || (key !== 'workCents' && n < 0)) throw new Error('invalid cents');
  }
  const revenueCents = input.laborCents + input.workCents + input.materialBilledCents;
  const earnedCents = revenueCents - input.materialCostCents;
  return {
    ...input,
    revenueCents,
    markupCents: input.materialBilledCents - input.materialCostCents,
    earnedCents,
    marginBps: revenueCents > 0 ? Math.round(earnedCents * 10000 / revenueCents) : null,
  };
}
