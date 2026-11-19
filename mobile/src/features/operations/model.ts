/** Worker records used for labor costing. */
export interface Worker { id: string; business_id: string; name: string; loaded_rate_cents: number; archived: boolean }
export interface LaborCost { time_entry_id: string; business_id: string; worker_id: string; loaded_rate_cents: number }
export interface Budget { job_id: string; business_id: string; labor_cents: number; material_cents: number; other_cents: number; actual_other_cents: number }
export interface Operations { workers: Worker[]; labor: LaborCost[]; budgets: Budget[] }
export const emptyOperations = (): Operations => ({ workers: [], labor: [], budgets: [] });

export function centsInput(text: string): number | null {
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(text.trim())) return null;
  const [whole, fraction = ''] = text.trim().replace(',', '.').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result <= 999999999 ? result : null;
}

export interface CostedTime { id: string; hundredths: number }
/** Cost uses the frozen loaded wage cost, never the customer's selling rate. */
export function jobProfitability(revenueCents: number | null, materialCents: number, otherCents: number, time: CostedTime[], costs: LaborCost[]) {
  for (const n of [materialCents, otherCents, ...(revenueCents === null ? [] : [revenueCents])]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid cents');
  }
  const lookup = new Map(costs.map((c) => [c.time_entry_id, c]));
  let laborCents = 0, uncostedHundredths = 0;
  for (const entry of time) {
    if (!Number.isSafeInteger(entry.hundredths) || entry.hundredths <= 0 || entry.hundredths > 2400) throw new Error('invalid hours');
    const cost = lookup.get(entry.id);
    if (!cost) { uncostedHundredths += entry.hundredths; continue; }
    if (!Number.isSafeInteger(cost.loaded_rate_cents) || cost.loaded_rate_cents < 0 || cost.loaded_rate_cents > 999999999) throw new Error('invalid rate');
    laborCents += Math.round(entry.hundredths * cost.loaded_rate_cents / 100);
  }
  const totalCents = laborCents + materialCents + otherCents;
  const complete = uncostedHundredths === 0;
  const profitCents = revenueCents !== null && complete ? revenueCents - totalCents : null;
  const marginBps = profitCents !== null && revenueCents !== null && revenueCents > 0 ? Math.round(profitCents * 10000 / revenueCents) : null;
  return { laborCents, materialCents, totalCents, uncostedHundredths, complete, profitCents, marginBps };
}
