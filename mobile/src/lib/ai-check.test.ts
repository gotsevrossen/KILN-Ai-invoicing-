import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PriceItem } from '../data/types.ts';
import { checkChange, checkCommands, checkGuess, checkMissed, checkPrices, checkReceipt, checkScope, priceChange } from './ai-check.ts';
import { priceLooksOff, usualPrice } from './billing.ts';

describe('price typo check', () => {
  const list: PriceItem[] = [
    { id: 'trip', name: 'Trip fee', unit: 'flat', unitCents: 15000 },
    { id: 'own-1', name: 'Gutter cleaning', unit: 'linear_ft', unitCents: 150 },
    { id: 'haul', name: 'Haul away', unit: 'flat', unitCents: null },
  ];

  it('flags a missing or extra zero', () => {
    assert.equal(priceLooksOff(1500, 15000), true);
    assert.equal(priceLooksOff(150000, 15000), true);
  });

  it('leaves normal price changes alone', () => {
    assert.equal(priceLooksOff(15000, 15000), false);
    assert.equal(priceLooksOff(4000, 15000), false);
    assert.equal(priceLooksOff(70000, 15000), false);
  });

  it('flags at exactly five times either way', () => {
    assert.equal(priceLooksOff(75000, 15000), true);
    assert.equal(priceLooksOff(3000, 15000), true);
    assert.equal(priceLooksOff(3001, 15000), false);
  });

  it('never flags free, unpriced, or items with no usual price', () => {
    assert.equal(priceLooksOff(0, 15000), false);
    assert.equal(priceLooksOff(null, 15000), false);
    assert.equal(priceLooksOff(1500, null), false);
    assert.equal(priceLooksOff(1500, 0), false);
  });

  it('finds the usual price by price list item, then by the same name', () => {
    assert.equal(usualPrice({ priceItemId: 'trip', description: 'Cargo por visita' }, list), 15000);
    assert.equal(usualPrice({ description: '  gutter CLEANING ' }, list), 150);
    assert.equal(usualPrice({ description: 'Something else' }, list), null);
    assert.equal(usualPrice({ priceItemId: 'haul', description: 'Haul away' }, list), null);
    assert.equal(usualPrice({ description: '' }, list), null);
  });
});

describe('AI answers', () => {
  it('keeps a guess only from the owner’s trades and price list', () => {
    const raw = { tradeId: 'painting', jobTypeId: 'interiorPaint', quantities: [
      { itemId: 'paint-wall', qtyHundredths: 40000 }, { itemId: 'made-up', qtyHundredths: 100 },
      { itemId: 'trip', qtyHundredths: 0 }, { itemId: 'trip', qtyHundredths: 12.5 }, { itemId: 'paint-wall', qtyHundredths: 100 },
    ] };
    assert.deepEqual(checkGuess(raw, ['painting'], ['paint-wall', 'trip']), {
      tradeId: 'painting', jobTypeId: 'interiorPaint', quantities: [{ itemId: 'paint-wall', qtyHundredths: 40000 }],
    });
  });

  it('drops a job type from a trade the owner doesn’t do, or one that isn’t in the trade', () => {
    assert.deepEqual(checkGuess({ tradeId: 'plumbing', jobTypeId: 'leak', quantities: [] }, ['painting'], []),
      { tradeId: null, jobTypeId: null, quantities: [] });
    assert.deepEqual(checkGuess({ tradeId: 'painting', jobTypeId: 'leak', quantities: [] }, ['painting'], []),
      { tradeId: null, jobTypeId: null, quantities: [] });
    assert.equal(checkGuess('nonsense', ['painting'], []), null);
  });

  it('keeps up to 3 missed items with reasons', () => {
    const raw = { items: [
      { itemId: 'haul', reason: 'Old floor comes out.' }, { itemId: 'nope', reason: 'x' }, { itemId: 'trip', reason: '' },
      { itemId: 'a', reason: '1' }, { itemId: 'b', reason: '2' }, { itemId: 'c', reason: '3' },
    ] };
    assert.deepEqual(checkMissed(raw, ['haul', 'trip', 'a', 'b', 'c']).map((m) => m.itemId), ['haul', 'a', 'b']);
    assert.deepEqual(checkMissed(null, ['haul']), []);
  });

  it('keeps a customer description only if it’s a reasonable length', () => {
    assert.equal(checkScope({ text: ' We will repaint the living room.\n' }), 'We will repaint the living room.');
    assert.equal(checkScope({ text: '   ' }), null);
    assert.equal(checkScope({ text: 'a'.repeat(1501) }), null);
    assert.equal(checkScope({}), null);
  });

  it('keeps imported prices in whole cents, with one match per item', () => {
    const raw = { prices: [
      { name: 'Trip charge', unit: 'flat', unitCents: 7500, matchId: 'trip', unclear: false },
      { name: 'Service call', unit: 'flat', unitCents: 9000, matchId: 'trip', unclear: true },
      { name: 'Half cent', unit: 'flat', unitCents: 10.5, matchId: null, unclear: false },
      { name: 'Odd unit', unit: 'gallon', unitCents: 100, matchId: null, unclear: false },
      { name: 'Too much', unit: 'flat', unitCents: 100_000_001, matchId: null, unclear: false },
    ] };
    assert.deepEqual(checkPrices(raw, ['trip']), [
      { name: 'Trip charge', unit: 'flat', unitCents: 7500, matchId: 'trip', unclear: false },
      { name: 'Service call', unit: 'flat', unitCents: 9000, matchId: null, unclear: true },
    ]);
  });
});

describe('receipts, change orders, and commands', () => {
  it('keeps a scanned receipt’s readable lines and drops a made-up date', () => {
    const r = checkReceipt({ store: 'Lowe’s', number: '', date: '2026-13-01', taxCents: 120, totalCents: 1620,
      items: [{ name: 'Wax ring', costCents: 500, unclear: false }, { name: 'Shims', costCents: 1000, unclear: true }, { name: 'Bad', costCents: -1 }] });
    assert.deepEqual(r, { store: 'Lowe’s', number: '', date: null, taxCents: 120, totalCents: 1620,
      items: [{ name: 'Wax ring', costCents: 500, unclear: false }, { name: 'Shims', costCents: 1000, unclear: true }] });
  });

  const list = [{ id: 'outlet', unitCents: 8500 }, { id: 'trip', unitCents: 4500 }, { id: 'haul', unitCents: null }];

  it('prices a change from the owner’s list, to the cent', () => {
    const draft = checkChange({ description: 'Add two outlets.', quantities: [{ itemId: 'outlet', qtyHundredths: 200 }, { itemId: 'trip', qtyHundredths: 100 }] }, ['outlet', 'trip', 'haul'])!;
    assert.deepEqual(priceChange(draft, list), { cents: 21500, unpriced: [] });
  });

  it('uses the price the owner said over the list', () => {
    const draft = checkChange({ description: 'Add an outlet.', quantities: [{ itemId: 'outlet', qtyHundredths: 100 }], statedCents: 15000 }, ['outlet'])!;
    assert.deepEqual(priceChange(draft, list), { cents: 15000, unpriced: [] });
  });

  it('leaves the price empty when an item has no price yet, and says which', () => {
    const draft = checkChange({ description: 'Haul it away.', quantities: [{ itemId: 'haul', qtyHundredths: 100 }, { itemId: 'trip', qtyHundredths: 100 }] }, ['haul', 'trip'])!;
    assert.deepEqual(priceChange(draft, list), { cents: null, unpriced: ['haul'] });
  });

  it('leaves the price empty when nothing matched the list', () => {
    const draft = checkChange({ description: 'Move the sink.', quantities: [] }, ['outlet'])!;
    assert.deepEqual(priceChange(draft, list), { cents: null, unpriced: [] });
    assert.equal(checkChange({ description: '  ' }, []), null);
  });

  it('keeps commands only for the owner’s jobs and items', () => {
    const raw = { actions: [
      { type: 'hours', jobId: 'smith', hundredths: 250, note: 'Rough-in' },
      { type: 'hours', jobId: 'smith', hundredths: 5000 },
      { type: 'work', jobId: 'nope', description: 'Faucet', qtyHundredths: 100, unitCents: 4000, itemId: 'made-up', kind: 'material' },
      { type: 'work', jobId: 'smith', description: 'Trip fee', qtyHundredths: 100, unitCents: null, itemId: 'trip', kind: 'fee' },
      { type: 'note', jobId: 'smith', text: '  Call about the tub. ' },
      { type: 'delete', jobId: 'smith' },
    ] };
    assert.deepEqual(checkCommands(raw, ['smith'], ['trip']), [
      { type: 'hours', jobId: 'smith', hundredths: 250, note: 'Rough-in' },
      { type: 'work', jobId: null, description: 'Faucet', qtyHundredths: 100, unitCents: 4000, itemId: null, kind: 'material' },
      { type: 'work', jobId: 'smith', description: 'Trip fee', qtyHundredths: 100, unitCents: null, itemId: 'trip', kind: 'fee' },
      { type: 'note', jobId: 'smith', text: 'Call about the tub.' },
    ]);
  });
});
