import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TRADES, itemsOnlyIn, starterItemIds } from './trades.ts';

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
