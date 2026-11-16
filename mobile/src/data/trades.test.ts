import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TRADES, itemsOnlyIn, starterCents, starterItemIds, starterItemsToAdd } from './trades.ts';

describe('starterCents (a new item’s first price)', () => {
  it('labor is the hourly rate the owner typed, or empty for flat-price owners', () => {
    assert.equal(starterCents('labor', 'hourly', 9500), 9500);
    assert.equal(starterCents('labor', 'flat', 9500), null);
  });

  it('the trip fee starts at $20 and everything else starts empty', () => {
    assert.equal(starterCents('trip', 'hourly', 9500), 2000);
    assert.equal(starterCents('trip', 'flat', null), 2000);
    assert.equal(starterCents('outlet', 'hourly', 9500), null);
  });
});

describe('itemsOnlyIn (turning a trade off)', () => {
  it('handyman to carpentry: removes every handyman item, since carpentry uses none of them', () => {
    assert.deepEqual(itemsOnlyIn('handyman', ['carpentry']), ['labor', 'trip', 'mount', 'assembly', 'small-repair']);
  });

  it('never removes an item a remaining trade still uses', () => {
    for (const removed of TRADES) {
      for (const other of TRADES) {
        if (other.id === removed.id) continue;
        const kept = new Set(starterItemIds([other.id]));
        for (const id of itemsOnlyIn(removed.id, [other.id])) assert.ok(!kept.has(id), `${removed.id} off removed ${id}, which ${other.id} uses`);
      }
    }
  });

  it('removes nothing when the remaining trades cover all its items', () => {
    assert.deepEqual(itemsOnlyIn('handyman', ['handyman']), []);
  });
});

describe('adding another type of work', () => {
  it('adds carpet repair with an empty price and preserves existing owner prices', () => {
    const current = [
      { id: 'labor', name: 'Hourly labor', unit: 'hour' as const, unitCents: 8500 },
      { id: 'trip', name: 'Trip fee', unit: 'flat' as const, unitCents: 4500 },
    ];
    const added = starterItemsToAdd('flooring', current, 'hourly', 5000, (id) => id);
    assert.deepEqual(added.find((item) => item.id === 'carpet-repair'), {
      id: 'carpet-repair', name: 'carpet-repair', unit: 'each', unitCents: null,
    });
    assert.ok(added.every((item) => item.id !== 'labor' && item.id !== 'trip'));
    assert.equal(current[0].unitCents, 8500);
    assert.equal(current[1].unitCents, 4500);
    assert.deepEqual(starterItemsToAdd('flooring', [...current, ...added], 'hourly', 5000, (id) => id), []);
  });
});
