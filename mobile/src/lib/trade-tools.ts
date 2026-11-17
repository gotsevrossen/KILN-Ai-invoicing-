/** Optional worksheets. Dimensions are feet; area is square feet; coverage is sq ft/gallon/coat. */
export interface Surface {
  id: string; room: string; surface: string; width: number; height: number;
  openings: number; coats: number; coverage: number; priceItemId: string;
}
export interface FinishSpec { name: string; prep: string; finish: string; exclusions: string }
export interface ElectricalRecord {
  circuit: string; test: string; result: string; measured: string; technician: string;
  date: string; permit: string; inspection: string; notes: string; photoIds: string[];
}
export interface TradeWorksheet { surfaces: Surface[]; spec: FinishSpec; electrical: ElectricalRecord[] }
export const emptyWorksheet = (): TradeWorksheet => ({ surfaces: [], spec: { name: '', prep: '', finish: '', exclusions: '' }, electrical: [] });
export function surfaceTotals(s: Surface): { areaHundredths: number; gallons: number } {
  if (!s.room.trim() || !s.surface.trim() || ![s.width, s.height, s.openings, s.coats, s.coverage].every(Number.isFinite)
    || s.width <= 0 || s.width > 10000 || s.height <= 0 || s.height > 10000 || s.openings < 0
    || !Number.isInteger(s.coats) || s.coats < 1 || s.coats > 10 || s.coverage <= 0 || s.coverage > 10000
    || s.openings >= s.width * s.height) throw new Error('Invalid surface');
  const areaHundredths = Math.round((s.width * s.height - s.openings) * 100);
  if (!Number.isSafeInteger(areaHundredths) || areaHundredths <= 0 || areaHundredths > 99999999) throw new Error('Surface too large or small');
  return { areaHundredths, gallons: Math.ceil(areaHundredths / 100 * s.coats / s.coverage * 100) / 100 };
}
/** Quantity is net physical area, NOT area multiplied by coats. Owner rate must cover the selected system. */
export function surfaceLine(s: Surface, item: { id: string; unit: string; unitCents: number | null }) {
  const totals = surfaceTotals(s);
  if (item.id !== s.priceItemId || item.unit !== 'sq_ft' || item.unitCents === null || !Number.isSafeInteger(item.unitCents) || item.unitCents < 0 || item.unitCents > 100_000_000 || !Number.isSafeInteger(totals.areaHundredths * item.unitCents))
    throw new Error('Choose an owner-priced square-foot item');
  return { description: `${s.room.trim()} · ${s.surface.trim()}`, qtyHundredths: totals.areaHundredths, unitCents: item.unitCents,
    unit: 'sq_ft' as const, kind: 'labor' as const, priceItemId: item.id };
}
export function validElectrical(r: ElectricalRecord): boolean {
  if (!r || !['circuit','test','result','measured','technician','date','permit','inspection','notes'].every((key) => typeof (r as unknown as Record<string,unknown>)[key] === 'string') || !Array.isArray(r.photoIds) || !r.photoIds.every((id) => typeof id === 'string' && id.length <= 120)) return false;
  return !!r.circuit.trim() && !!r.test.trim() && ['pass', 'fail', 'not_tested'].includes(r.result)
    && !!r.technician.trim() && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
    && !Number.isNaN(Date.parse(r.date)) && new Date(r.date).toISOString().slice(0, 10) === r.date
    && (r.result === 'not_tested' || !!r.measured.trim())
    && Object.values(r).every((x) => typeof x !== 'string' || x.length <= 2000)
    && r.photoIds.length <= 50;
}
export function validFinishSpec(value: unknown): value is FinishSpec {
  if (!value || typeof value !== 'object') return false;
  const spec = value as Record<string, unknown>;
  return ['name', 'prep', 'finish', 'exclusions'].every((key) => typeof spec[key] === 'string' && (spec[key] as string).length <= (key === 'name' ? 120 : 2000));
}
export function validateWorksheet(w: TradeWorksheet): void {
  if (!w || !Array.isArray(w.surfaces) || !Array.isArray(w.electrical) || !validFinishSpec(w.spec)) throw new Error('Invalid worksheet');
  if (w.surfaces.length > 100 || w.electrical.length > 100) throw new Error('Too many records');
  w.surfaces.forEach(surfaceTotals);
  if (w.electrical.some((r) => !validElectrical(r))) throw new Error('Invalid electrical record');
  if (Object.values(w.spec).some((x) => typeof x !== 'string' || x.length > 2000)) throw new Error('Invalid specification');
}
