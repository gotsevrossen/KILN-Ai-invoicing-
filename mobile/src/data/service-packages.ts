import type { EstimateLine, JobScope } from './types';
import { lineTotal } from '../lib/money.ts';

export type PackageLine = Pick<EstimateLine, 'description' | 'unit' | 'qtyHundredths' | 'unitCents' | 'kind'>;
export interface ServicePackage {
  id: string;
  name: string;
  lines: PackageLine[];
  scope: Pick<JobScope, 'notes' | 'details' | 'exclusions' | 'location'>;
  minimumCents: number;
  afterHoursCents: number;
}

const units = ['sq_ft', 'board', 'linear_ft', 'hour', 'flat', 'each', 'cu_yd'];
const money = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 99_999_999;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Also validates database reads; malformed packages never become billable lines. */
export function validPackage(value: unknown): value is ServicePackage {
  if (!object(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string'
    || !value.name.trim() || value.name.length > 120 || !money(value.minimumCents) || !money(value.afterHoursCents)
    || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 100 || !object(value.scope)) return false;
  if (Object.entries(value.scope).some(([key, v]) => !['notes', 'details', 'exclusions', 'location'].includes(key)
    || typeof v !== 'string' || v.length > 2000)) return false;
  return value.lines.every((line) => object(line) && typeof line.description === 'string' && !!line.description.trim()
    && line.description.length <= 300 && typeof line.unit === 'string' && units.includes(line.unit)
    && Number.isSafeInteger(line.qtyHundredths) && (line.qtyHundredths as number) > 0 && (line.qtyHundredths as number) <= 999_999
    && (line.unitCents === null || money(line.unitCents)) && (line.kind === undefined || ['labor', 'material', 'fee'].includes(line.kind as string)));
}

/** Customer scope only: never put a job title, address, or private note in a reusable template. */
export function packageFromEstimate(id: string, name: string, lines: EstimateLine[], scope?: JobScope): ServicePackage {
  return {
    id, name: name.trim(),
    lines: lines.filter((l) => !l.excluded).map(({ description, unit, qtyHundredths, unitCents, kind }) => ({ description, unit, qtyHundredths, unitCents, kind })),
    scope: { ...(scope?.notes ? { notes: scope.notes } : {}), ...(scope?.details ? { details: scope.details } : {}),
      ...(scope?.exclusions ? { exclusions: scope.exclusions } : {}) },
    minimumCents: 0, afterHoursCents: 0,
  };
}

export interface PackageApplication {
  lines: PackageLine[];
  scope: ServicePackage['scope'];
  unresolvedMinimum: boolean;
}

/** Fees are explicit editable lines. Minimum is a pre-tax floor after the optional after-hours fee. */
export function applyPackage(preset: ServicePackage, existing: EstimateLine[], afterHours: boolean,
  labels: { afterHours: string; minimum: string }): PackageApplication {
  if (!validPackage(preset)) throw new Error('Invalid package');
  const lines: PackageLine[] = preset.lines.map((l) => ({ ...l }));
  if (afterHours && preset.afterHoursCents > 0) lines.push({ description: labels.afterHours, unit: 'flat', qtyHundredths: 100, unitCents: preset.afterHoursCents, kind: 'fee' });
  const all = [...existing.filter((l) => !l.excluded), ...lines];
  const unresolvedMinimum = preset.minimumCents > 0 && all.some((l) => l.unitCents === null);
  if (preset.minimumCents > 0 && !unresolvedMinimum) {
    const subtotal = all.reduce((sum, l) => sum + lineTotal(l.qtyHundredths, l.unitCents!), 0);
    if (subtotal < preset.minimumCents) lines.push({ description: labels.minimum, unit: 'flat', qtyHundredths: 100, unitCents: preset.minimumCents - subtotal, kind: 'fee' });
  }
  return { lines, scope: { ...preset.scope }, unresolvedMinimum };
}
