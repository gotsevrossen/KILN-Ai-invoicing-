import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkAssistantReply, needsOwnConfirm, stepReady } from './assistant-check.ts';

const known = { jobIds: ['smith'], itemIds: ['labor'], inboxIds: ['r1'] };

describe('KILN chat replies', () => {
  it('an off-topic reply carries no actions, whatever else came back', () => {
    const out = checkAssistantReply({ offTopic: true, reply: 'Keep it work related.', actions: [{ type: 'note', jobId: 'smith', text: 'x' }] }, known);
    assert.deepEqual(out.actions, []);
    assert.equal(out.offTopic, true);
  });
  it('drops ids KILN never sent and impossible amounts', () => {
    const out = checkAssistantReply({ offTopic: false, reply: 'ok', actions: [
      { type: 'hours', jobId: 'jones', hundredths: 200, note: '' },
      { type: 'hours', jobId: 'smith', hundredths: 9000, note: '' },
      { type: 'cashPaid', jobId: 'smith', cents: 10.5 },
      { type: 'sortReceipt', receiptItemId: 'other', sortTo: 'overhead' },
      { type: 'delete', jobId: 'smith' },
    ] }, known);
    assert.deepEqual(out.actions, [{ type: 'hours', jobId: null, hundredths: 200, note: '' }]);
  });
  it('a malformed reply is an error, not an empty plan', () => {
    assert.throws(() => checkAssistantReply({ actions: [] }, known));
  });
});

describe('plan steps', () => {
  it('sending, payments, prices and reminders ask again before running', () => {
    assert.equal(needsOwnConfirm({ type: 'invoice', jobId: 'smith', send: true }), true);
    assert.equal(needsOwnConfirm({ type: 'invoice', jobId: 'smith', send: false }), false);
    assert.equal(needsOwnConfirm({ type: 'cashPaid', jobId: 'smith', cents: 45000 }), true);
    assert.equal(needsOwnConfirm({ type: 'laborRate', cents: 9500 }), true);
    assert.equal(needsOwnConfirm({ type: 'hours', jobId: 'smith', hundredths: 100, note: '' }), false);
  });
  it('a step without its job or price waits for the owner', () => {
    assert.equal(stepReady({ type: 'hours', jobId: null, hundredths: 100, note: '' }), false);
    assert.equal(stepReady({ type: 'work', jobId: 'smith', description: 'Valve', qtyHundredths: 100, unitCents: null, itemId: null, kind: 'material' }), false);
    assert.equal(stepReady({ type: 'sortReceipt', receiptItemId: 'r1', jobId: null, sortTo: 'overhead' }), true);
    assert.equal(stepReady({ type: 'laborRate', cents: 9500 }), true);
  });
});
