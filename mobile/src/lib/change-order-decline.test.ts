import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { confirmDecline, type ChangeAnswer } from './change-order-decline.ts';

describe('change order decline retry confirmation', () => {
  it('recovers a lost acknowledgement without updating an answered document again', async () => {
    let answer: ChangeAnswer = { signed_at: null, declined_at: null };
    let writes = 0;
    const update = async () => {
      if (answer.signed_at || answer.declined_at) return false;
      writes++;
      answer = { signed_at: null, declined_at: 'confirmed on server' };
      throw new Error('network response lost');
    };
    await assert.rejects(confirmDecline(update, async () => answer), /network response lost/);
    await confirmDecline(update, async () => answer);
    assert.equal(writes, 1);
  });

  it('confirms an already declined change after a later audit failure', async () => {
    const answer = { signed_at: null, declined_at: 'previous request' };
    await confirmDecline(async () => false, async () => answer);
  });

  it('does not report signed, missing, or still unanswered rows as a confirmed decline', async () => {
    await assert.rejects(confirmDecline(async () => false, async () => ({ signed_at: 'signed', declined_at: null })), /was signed/);
    await assert.rejects(confirmDecline(async () => false, async () => null), /not found/);
    await assert.rejects(confirmDecline(async () => false, async () => ({ signed_at: null, declined_at: null })), /not found/);
  });

  it('propagates permission/network errors instead of treating them as a missing row', async () => {
    await assert.rejects(confirmDecline(async () => { throw new Error('permission denied'); }, async () => null), /permission denied/);
    await assert.rejects(confirmDecline(async () => false, async () => { throw new Error('offline'); }), /offline/);
  });
});
