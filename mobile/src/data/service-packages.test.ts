import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyPackage, packageFromEstimate, validPackage, type ServicePackage } from './service-packages.ts';

const preset = (): ServicePackage => ({ id: 'package', name: 'Emergency repair', lines: [{ description: 'Repair', kind: 'labor', unit: 'hour', qtyHundredths: 150, unitCents: 8000 }], scope: { notes: 'Repair only', exclusions: 'Wall finish' }, minimumCents: 20000, afterHoursCents: 5000 });
const labels = { minimum: 'Minimum adjustment', afterHours: 'After-hours fee' };

describe('owner service packages', () => {
  it('adds an explicit minimum difference after after-hours fee and existing work', () => {
    const result = applyPackage(preset(), [{ id: 'old', description: 'Trip', unit: 'flat', qtyHundredths: 100, unitCents: 2000 }], true, labels);
    assert.equal(result.lines.length, 3);
    assert.equal(result.lines[1].unitCents, 5000);
    assert.equal(result.lines[2].unitCents, 1000); // 120 + 50 + existing 20 + 10 = $200
    assert.equal(result.lines[2].kind, 'fee');
  });
  it('does not add a minimum adjustment when charges meet the floor', () => {
    const p = preset(); p.minimumCents = 10000;
    assert.equal(applyPackage(p, [], false, labels).lines.length, 1);
  });
  it('never guesses missing prices or applies a minimum with an unresolved charge', () => {
    const p = preset(); p.lines[0].unitCents = null;
    const result = applyPackage(p, [], true, labels);
    assert.equal(result.unresolvedMinimum, true);
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0].unitCents, null);
  });
  it('ignores excluded existing work in minimum calculation', () => {
    const result = applyPackage(preset(), [{ id: 'old', description: 'Excluded', unit: 'flat', qtyHundredths: 100, unitCents: 100000, excluded: true }], false, labels);
    assert.equal(result.lines.at(-1)?.unitCents, 8000);
  });
  it('copies package lines and scope so estimate overrides cannot mutate the saved package', () => {
    const p = preset(); const result = applyPackage(p, [], false, labels);
    result.lines[0].unitCents = 1; result.scope.notes = 'Changed';
    assert.equal(p.lines[0].unitCents, 8000); assert.equal(p.scope.notes, 'Repair only');
  });
  it('saves active owner lines without job-specific IDs, private notes or address', () => {
    const result = packageFromEstimate('id', '  Fan install  ', [
      { id: 'line', priceItemId: 'fan', description: 'Fan', unit: 'each', qtyHundredths: 200, unitCents: 9000 },
      { id: 'excluded', description: 'Ignore', unit: 'flat', qtyHundredths: 100, unitCents: 100, excluded: true },
    ], { notes: 'Customer scope', location: '123 Main St', exclusions: 'Painting' });
    assert.equal(result.name, 'Fan install'); assert.equal(result.lines.length, 1);
    assert.equal('priceItemId' in result.lines[0], false); assert.equal('id' in result.lines[0], false);
    assert.equal(result.scope.location, undefined); assert.equal(validPackage(result), true);
  });
  it('rejects invalid quantities, fractional cents, negative callout fees and malformed scope', () => {
    for (const p of [
      { ...preset(), minimumCents: -1 }, { ...preset(), afterHoursCents: 0.1 },
      { ...preset(), lines: [{ ...preset().lines[0], qtyHundredths: 0 }] },
      { ...preset(), lines: [{ ...preset().lines[0], unitCents: 1.1 }] },
      { ...preset(), scope: { privateNote: 'Secret' } }, { ...preset(), lines: [] },
    ]) assert.equal(validPackage(p), false);
  });
});
