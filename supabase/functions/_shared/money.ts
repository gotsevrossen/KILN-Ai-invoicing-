// Money math for KILN. Every amount is an integer number of cents; never floats.
// Rates are basis points (bps): 700 = 7%, 2000 = 20%.
// Quantities are hundredths: 250 = 2.5 hours, 100 = 1 item.
// Rounding is half up, once per line or per tax amount, so totals add up on paper.

export type Cents = number;

function assertCents(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be whole cents, got ${value}`);
  }
}

/** Divide and round half up (away from zero for negatives). */
function divRound(numerator: number, denominator: number): number {
  const q = numerator / denominator;
  return q < 0 ? -Math.round(-q) : Math.round(q);
}

/** Price for a line: quantity (hundredths) × unit price (cents). */
export function lineTotal(qtyHundredths: number, unitCents: Cents): Cents {
  assertCents(qtyHundredths, 'qtyHundredths');
  assertCents(unitCents, 'unitCents');
  return divRound(qtyHundredths * unitCents, 100);
}

/** Cost plus markup, e.g. applyMarkup(12399, 2000) = 14879 (20% on $123.99). */
export function applyMarkup(costCents: Cents, markupBps: number): Cents {
  assertCents(costCents, 'costCents');
  assertCents(markupBps, 'markupBps');
  return divRound(costCents * (10000 + markupBps), 10000);
}

/** A percentage of an amount, e.g. tax or a deposit. */
export function percentOf(amountCents: Cents, rateBps: number): Cents {
  assertCents(amountCents, 'amountCents');
  assertCents(rateBps, 'rateBps');
  return divRound(amountCents * rateBps, 10000);
}

/**
 * Split an amount by weights so the parts always add back to the total.
 * Leftover cents go to the parts with the largest remainders (then the earliest).
 * splitByWeights(1000, [1, 1, 1]) = [334, 333, 333]
 */
export function splitByWeights(totalCents: Cents, weights: number[]): Cents[] {
  assertCents(totalCents, 'totalCents');
  if (weights.length === 0) throw new Error('weights must not be empty');
  if (weights.some((w) => w < 0)) throw new Error('weights must not be negative');
  const sum = weights.reduce((a, w) => a + w, 0);
  if (sum === 0) throw new Error('weights must not all be zero');

  const exact = weights.map((w) => (totalCents * w) / sum);
  const parts = exact.map((x) => Math.floor(x));
  let left = totalCents - parts.reduce((a, p) => a + p, 0);
  const order = exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) {
    parts[order[k].i] += 1;
  }
  return parts;
}

export type LineKind = 'labor' | 'fee' | 'material';

export interface PricedLine {
  kind: LineKind;
  qtyHundredths: number;
  unitCents: Cents;
}

export interface TaxRule {
  rateBps: number;
  labor: boolean;
  materials: boolean;
}

export interface Totals {
  labor: Cents;
  materials: Cents;
  subtotal: Cents;
  tax: Cents;
  total: Cents;
  paid: Cents;
  due: Cents;
}

/**
 * Totals for an estimate or invoice. Fees count as labor for tax.
 * Tax is figured once on the taxable subtotal, not per line.
 */
export function documentTotals(lines: PricedLine[], tax: TaxRule, paidCents: Cents = 0): Totals {
  assertCents(paidCents, 'paidCents');
  let labor = 0;
  let materials = 0;
  for (const line of lines) {
    const amount = lineTotal(line.qtyHundredths, line.unitCents);
    if (line.kind === 'material') materials += amount;
    else labor += amount;
  }
  const taxable = (tax.labor ? labor : 0) + (tax.materials ? materials : 0);
  const taxCents = percentOf(taxable, tax.rateBps);
  const subtotal = labor + materials;
  const total = subtotal + taxCents;
  return { labor, materials, subtotal, tax: taxCents, total, paid: paidCents, due: total - paidCents };
}

/** "$1,234.56" (or "1.234,56 US$" style, depending on locale). */
export function formatCents(cents: Cents, locale = 'en-US', currency = 'USD'): string {
  assertCents(cents, 'cents');
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/** "2.5" from 250 hundredths. */
export function formatQty(qtyHundredths: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(qtyHundredths / 100);
}
