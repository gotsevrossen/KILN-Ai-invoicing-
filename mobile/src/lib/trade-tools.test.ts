import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyWorksheet, surfaceLine, surfaceTotals, validElectrical, validateWorksheet, type Surface, type ElectricalRecord } from './trade-tools.ts';

const wall: Surface = { id: '1', room: 'Office', surface: 'Walls', width: 20, height: 8, openings: 20, coats: 2, coverage: 350, priceItemId: 'wall' };
const record: ElectricalRecord = { circuit: 'Kitchen 1', test: 'Voltage', result: 'pass', measured: '120 V AC, no load', technician: 'Alex', date: '2026-11-16', permit: '', inspection: '', notes: '', photoIds: [] };
test('takeoff subtracts openings and applies coats only to paint consumption', () => {
  assert.deepEqual(surfaceTotals(wall), { areaHundredths: 14000, gallons: 0.8 });
  assert.deepEqual(surfaceTotals({ ...wall, coats: 3 }), { areaHundredths: 14000, gallons: 1.2 });
  assert.equal(surfaceLine(wall, { id: 'wall', unit: 'sq_ft', unitCents: 250 }).qtyHundredths, 14000);
});
test('takeoff rejects impossible geometry, nonfinite values and zero coverage', () => {
  for (const patch of [{ width: 0 }, { height: -1 }, { openings: 160 }, { openings: -1 }, { coverage: 0 }, { coats: 1.5 }, { width: Infinity }, { room: ' ' }])
    assert.throws(() => surfaceTotals({ ...wall, ...patch }));
});
test('estimate conversion requires matching owner-priced square-foot rate; zero is explicit valid pricing', () => {
  assert.throws(() => surfaceLine(wall, { id: 'wall', unit: 'sq_ft', unitCents: null }));
  assert.throws(() => surfaceLine(wall, { id: 'wall', unit: 'hour', unitCents: 5000 }));
  assert.throws(() => surfaceLine(wall, { id: 'other', unit: 'sq_ft', unitCents: 5000 }));
  assert.equal(surfaceLine(wall, { id: 'wall', unit: 'sq_ft', unitCents: 0 }).unitCents, 0);
});
test('completion requires attributable dated result and measured evidence for tests', () => {
  assert.equal(validElectrical(record), true);
  assert.equal(validElectrical({ ...record, measured: '' }), false);
  assert.equal(validElectrical({ ...record, date: '2026-02-30' }), false);
  assert.equal(validElectrical({ ...record, technician: '' }), false);
  assert.equal(validElectrical({ ...record, result: 'not_tested', measured: '' }), true);
});
test('worksheet validates all records and rejects oversized collections', () => {
  validateWorksheet({ ...emptyWorksheet(), surfaces: [wall], electrical: [record] });
  assert.throws(() => validateWorksheet({ ...emptyWorksheet(), surfaces: Array(101).fill(wall) }));
  assert.throws(() => validateWorksheet({ ...emptyWorksheet(), electrical: [{ ...record, result: 'certified' }] }));
});

test('rates and persisted specs reject unsafe money and malformed shapes', () => {
  assert.throws(() => surfaceLine(wall, { id: 'wall', unit: 'sq_ft', unitCents: Number.MAX_SAFE_INTEGER }));
  assert.throws(() => validateWorksheet({ ...emptyWorksheet(), spec: { name: 123 } } as never));
  assert.throws(() => validateWorksheet({ ...emptyWorksheet(), electrical: [{ circuit: null }] } as never));
});
