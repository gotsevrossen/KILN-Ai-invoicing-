import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMarkup,
  documentTotals,
  formatCents,
  lineTotal,
  percentOf,
  splitByWeights,
  type PricedLine,
} from './money.ts';

describe('lineTotal', () => {
  it('multiplies hours by rate', () => {
    assert.equal(lineTotal(250, 8500), 21250); // 2.5 hr × $85.00
  });
  it('rounds half up once per line', () => {
    assert.equal(lineTotal(33, 1000), 330);
    assert.equal(lineTotal(1, 50), 1); // 0.5 cent rounds up
    assert.equal(lineTotal(24000, 110), 26400); // 240 sq ft × $1.10
  });
  it('rejects fractional cents', () => {
    assert.throws(() => lineTotal(100, 10.5));
    assert.throws(() => lineTotal(2.5, 100));
  });
});

describe('applyMarkup', () => {
  it('adds a percentage on top of cost', () => {
    assert.equal(applyMarkup(12399, 2000), 14879); // faucet $123.99 + 20%
    assert.equal(applyMarkup(1896, 2000), 2275);
    assert.equal(applyMarkup(1248, 2000), 1498);
  });
  it('leaves cost alone at 0%', () => {
    assert.equal(applyMarkup(999, 0), 999);
  });
});

describe('percentOf', () => {
  it('figures tax and deposits', () => {
    assert.equal(percentOf(17154, 700), 1201); // 7% of $171.54 = 12.0078
    assert.equal(percentOf(127200, 3000), 38160); // 30% deposit on $1,272.00
  });
});

describe('splitByWeights', () => {
  it('always adds back to the total', () => {
    const parts = splitByWeights(1000, [1, 1, 1]);
    assert.deepEqual(parts, [334, 333, 333]);
    assert.equal(parts.reduce((a, b) => a + b, 0), 1000);
  });
  it('splits tax across receipt items in proportion', () => {
    const items = [1896, 1248, 5982, 2190, 7544, 998];
    const parts = splitByWeights(1390, items);
    assert.equal(parts.reduce((a, b) => a + b, 0), 1390);
    assert.ok(parts.every((p) => p >= 0));
  });
  it('handles a split across two jobs', () => {
    assert.deepEqual(splitByWeights(5982, [50, 50]), [2991, 2991]);
    assert.deepEqual(splitByWeights(5983, [50, 50]), [2992, 2991]);
  });
  it('rejects bad weights', () => {
    assert.throws(() => splitByWeights(100, []));
    assert.throws(() => splitByWeights(100, [0, 0]));
    assert.throws(() => splitByWeights(100, [-1, 2]));
  });
});

describe('documentTotals', () => {
  const park: PricedLine[] = [
    { kind: 'labor', qtyHundredths: 250, unitCents: 8500 },
    { kind: 'fee', qtyHundredths: 100, unitCents: 4500 },
    { kind: 'material', qtyHundredths: 100, unitCents: 14879 },
    { kind: 'material', qtyHundredths: 100, unitCents: 2275 },
  ];

  it('taxes materials only when set that way', () => {
    const t = documentTotals(park, { rateBps: 700, labor: false, materials: true });
    assert.equal(t.labor, 25750);
    assert.equal(t.materials, 17154);
    assert.equal(t.subtotal, 42904);
    assert.equal(t.tax, 1201);
    assert.equal(t.total, 44105);
    assert.equal(t.due, 44105);
  });

  it('updates when a missed item is added', () => {
    const withValve = [...park, { kind: 'material' as const, qtyHundredths: 100, unitCents: 1498 }];
    const t = documentTotals(withValve, { rateBps: 700, labor: false, materials: true });
    assert.equal(t.subtotal, 44402);
    assert.equal(t.tax, 1306);
    assert.equal(t.total, 45708);
  });

  it('subtracts what was already paid', () => {
    const t = documentTotals(park, { rateBps: 0, labor: false, materials: false }, 10000);
    assert.equal(t.total, 42904);
    assert.equal(t.due, 32904);
  });

  it('taxes labor too when set', () => {
    const t = documentTotals(park, { rateBps: 1000, labor: true, materials: true });
    assert.equal(t.tax, 4290); // 10% of 429.04 = 42.904
  });
});

describe('formatCents', () => {
  it('formats US dollars', () => {
    assert.equal(formatCents(44105), '$441.05');
    assert.equal(formatCents(384050), '$3,840.50');
    assert.equal(formatCents(0), '$0.00');
  });
});
