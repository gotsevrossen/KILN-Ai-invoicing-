import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SaveQueue } from './save-queue.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('account-owned save queue', () => {
  it('orders saves and flushes only the newest typed value before sending', async () => {
    const calls: string[] = [];
    const queue = new SaveQueue(assert.fail);
    queue.enqueue(async () => { calls.push('create job'); });
    queue.debounce('estimate', async () => { calls.push('old text'); }, 60_000);
    queue.debounce('estimate', async () => { calls.push('latest text'); }, 60_000);
    await queue.wait();
    assert.deepEqual(calls, ['create job', 'latest text']);
  });

  it('prevents dependent work after a failed save even if a later save succeeds', async () => {
    const errors: unknown[] = [];
    const queue = new SaveQueue((error) => errors.push(error));
    const failure = new Error('could not save invoice lines');
    queue.enqueue(async () => { throw failure; });
    queue.enqueue(async () => {});
    await assert.rejects(queue.wait(), { code: 'unsaved_changes', cause: failure });
    assert.deepEqual(errors, [failure]);
  });

  it('cancels old-account queued and delayed writes without contaminating new-account errors', async () => {
    const gate = deferred();
    const errors: unknown[] = [];
    const calls: string[] = [];
    const queue = new SaveQueue((error) => errors.push(error));
    const oldScope = queue.scope();
    queue.enqueue(async () => { await gate.promise; throw new Error('old account failure'); });
    await Promise.resolve();
    queue.enqueue(async () => { calls.push('old queued write'); });
    queue.debounce('summary', async () => { calls.push('old delayed write'); }, 60_000);
    const oldWait = assert.rejects(queue.wait(), { code: 'signed_out' });
    queue.reset();
    queue.enqueue(async () => { calls.push('new account write'); });
    gate.resolve();
    await oldWait;
    await queue.wait();
    assert.equal(oldScope(), false);
    assert.deepEqual(calls, ['new account write']);
    assert.deepEqual(errors, []);
  });

  it('waits for work appended while an earlier save is in flight', async () => {
    const gate = deferred();
    const calls: number[] = [];
    const queue = new SaveQueue(assert.fail);
    queue.enqueue(async () => { await gate.promise; calls.push(1); });
    const waiting = queue.wait();
    queue.enqueue(async () => { calls.push(2); });
    gate.resolve();
    await waiting;
    assert.deepEqual(calls, [1, 2]);
  });

  it('keeps an invoice editable until the send is confirmed, and on failed sends', async () => {
    const gate = deferred();
    let sent = false;
    const queue = new SaveQueue(() => {});
    const sending = queue.commit(() => gate.promise, () => { sent = true; });
    await Promise.resolve();
    assert.equal(sent, false);
    gate.resolve();
    await sending;
    assert.equal(sent, true);

    sent = false;
    await assert.rejects(queue.commit(async () => { throw new Error('server unavailable'); }, () => { sent = true; }));
    assert.equal(sent, false);
  });

  it('never sends a document when its earlier line save failed', async () => {
    const queue = new SaveQueue(() => {});
    let requested = false;
    let committed = false;
    queue.enqueue(async () => { throw new Error('line save failed'); });
    await assert.rejects(queue.commit(async () => { requested = true; }, () => { committed = true; }));
    assert.equal(requested, false);
    assert.equal(committed, false);
  });

  it('does not publish a successful old-account send into the next account', async () => {
    const gate = deferred();
    const started = deferred();
    let committed = false;
    const queue = new SaveQueue(() => {});
    const sending = queue.commit(async () => { started.resolve(); await gate.promise; }, () => { committed = true; });
    await started.promise;
    const rejected = assert.rejects(sending, { code: 'signed_out' });
    queue.reset();
    gate.resolve();
    await rejected;
    assert.equal(committed, false);
  });

  it('preserves a confirmed send if a later, separate edit fails', async () => {
    const started = deferred();
    const gate = deferred();
    const queue = new SaveQueue(() => {});
    let committed = false;
    const sending = queue.commit(async () => { started.resolve(); await gate.promise; }, () => { committed = true; });
    await started.promise;
    queue.enqueue(async () => { throw new Error('a later edit failed'); });
    gate.resolve();
    await sending;
    assert.equal(committed, true);
    await assert.rejects(queue.wait(), { code: 'unsaved_changes' });
  });
});
