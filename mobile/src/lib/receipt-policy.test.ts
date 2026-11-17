import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkReceiptReview, ReceiptRefused, receiptEligibility, withReceiptReview } from './receipt-policy.ts';

describe('receipt work eligibility', () => {
  it('requires an explicit approval; missing or malformed classifications stay uncertain', () => {
    for (const value of [undefined, null, true, 'approved', 'WORK', {}]) assert.equal(receiptEligibility(value), 'uncertain');
    assert.equal(receiptEligibility('non_work'), 'non_work');
    assert.equal(receiptEligibility('work'), 'work');
  });

  it('matches reviews by index even when returned out of order', () => {
    assert.deepEqual(checkReceiptReview({ items: [{ index: 1, eligibility: 'non_work' }, { index: 0, eligibility: 'work' }] }, 2), ['work', 'non_work']);
  });

  it('rejects missing, extra, duplicate, or invented item approvals', () => {
    for (const items of [[], [{ index: 0, eligibility: 'work' }],
      [{ index: 0, eligibility: 'work' }, { index: 0, eligibility: 'work' }],
      [{ index: 0, eligibility: 'work' }, { index: 2, eligibility: 'work' }],
      [{ index: 0, eligibility: 'work' }, { index: 0.5, eligibility: 'work' }]]) {
      assert.equal(checkReceiptReview({ items }, 2), null);
    }
    assert.deepEqual(checkReceiptReview({ items: [{ index: 0 }] }, 1), ['uncertain']);
  });

  it('blocks the whole mixed receipt before a local, expense, or queued write', async () => {
    for (const eligibility of [['work', 'non_work'], ['non_work'], ['work', 'uncertain'], ['work']] as const) {
      let writes = 0;
      await assert.rejects(withReceiptReview(async () => [...eligibility], 2, () => ++writes), ReceiptRefused);
      assert.equal(writes, 0);
    }
  });

  it('saves only after review finishes and every remaining item is work-related', async () => {
    let finish!: (value: ['work']) => void;
    const review = new Promise<['work']>((resolve) => { finish = resolve; });
    let writes = 0;
    const pending = withReceiptReview(() => review, 1, () => { writes++; return 'receipt-id'; });
    assert.equal(writes, 0);
    finish(['work']);
    assert.equal(await pending, 'receipt-id');
    assert.equal(writes, 1);
  });

  it('never saves when review fails or the connection is unavailable', async () => {
    let writes = 0;
    await assert.rejects(withReceiptReview(async () => { throw new Error('offline'); }, 1, () => ++writes), /offline/);
    assert.equal(writes, 0);
  });
});
