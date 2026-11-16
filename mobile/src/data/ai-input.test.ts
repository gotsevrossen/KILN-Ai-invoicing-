import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkGuess } from '../lib/ai-check.ts';
import { guessInputFor } from './ai-input.ts';
import type { Job } from './types';

const job: Job = {
  id: 'carpet-job', title: 'Carpet reapir', customerId: 'customer', address: '',
  pricing: 'hourly', group: 'active', baseStatus: 'live', privateNote: 'Repair the carpet seam.',
};
const state = {
  profile: { trades: ['plumbing'] },
  priceList: [
    { id: 'labor', name: 'Hourly labor', unit: 'hour' as const, unitCents: 91327 },
    { id: 'trip', name: 'Trip fee', unit: 'flat' as const, unitCents: 4500 },
  ],
  estimates: { 'carpet-job': { lines: [], depositOn: false, scope: { notes: 'Patch torn carpet in the hallway.' } } },
  captures: [
    { id: 'note', jobId: 'carpet-job', kind: 'note' as const, date: '2026-11-16', text: 'There are two damaged patches.' },
    { id: 'other-note', jobId: 'other-job', kind: 'note' as const, date: '2026-11-16', text: 'Unrelated job details.' },
  ],
};
const t = (key: string) => key;

describe('estimate job recognition', () => {
  it('includes carpet repair for a plumber and reads the job description and its notes', () => {
    const input = guessInputFor(state, job, t);
    assert.equal(input.title, 'Carpet reapir');
    assert.equal(input.note, 'Repair the carpet seam.');
    assert.deepEqual(input.notes, ['Patch torn carpet in the hallway.', 'There are two damaged patches.']);
    assert.ok(input.trades.find((trade) => trade.id === 'flooring')?.jobTypes.some((type) => type.id === 'carpetRepair'));
    assert.deepEqual(state.profile.trades, ['plumbing']);
    assert.equal(JSON.stringify(input).includes('91327'), false);
  });

  it('accepts the suggested work type while keeping quantities on the existing price list', () => {
    const input = guessInputFor(state, job, t);
    const checked = checkGuess({
      tradeId: 'flooring', jobTypeId: 'carpetRepair',
      quantities: [{ itemId: 'carpet-repair', qtyHundredths: 200 }, { itemId: 'trip', qtyHundredths: 100 }],
    }, input.trades.map((trade) => trade.id), input.items.map((item) => item.id));
    assert.deepEqual(checked, {
      tradeId: 'flooring', jobTypeId: 'carpetRepair', quantities: [{ itemId: 'trip', qtyHundredths: 100 }],
    });
  });
});
