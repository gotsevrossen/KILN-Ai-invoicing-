import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OfflineJournal, type OfflineStorage } from './offline-journal.ts';

function storage() {
  const rows = new Map<string, string>();
  let fail = false;
  const disk: OfflineStorage = {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => { if (fail) throw new Error('disk full'); rows.set(key, value); },
  };
  return { disk, rows, fail: (value: boolean) => { fail = value; } };
}
type Command = { id: string; value: string };
const entry = (id: string) => ({ id, command: { id, value: id } });

describe('durable account outbox and local cache', () => {
  it('rescues edits kept open after initial storage failure without restoring an older view', async () => {
    const backing = storage();
    const old = new OfflineJournal<string, Command>(backing.disk);
    old.open('a'); old.append([entry('older-pending-work')], 'old view');
    let unavailable = true;
    const flaky: OfflineStorage = {
      getItem: (key) => { if (unavailable) throw Error('storage unavailable'); return backing.disk.getItem(key); },
      setItem: (key, value) => { if (unavailable) throw Error('storage unavailable'); backing.disk.setItem(key, value); },
    };
    const reopened = new OfflineJournal<string, Command>(flaky);
    assert.throws(() => reopened.open('a'), /storage unavailable/);
    const buffered = [entry('new-job'), entry('new-note')];
    assert.throws(() => reopened.resume('a', buffered, 'current edited view'), /storage unavailable/);
    unavailable = false;
    reopened.resume('a', buffered, 'current edited view');
    const restarted = new OfflineJournal<string, Command>(backing.disk);
    assert.equal(restarted.open('a'), 'current edited view');
    const calls: string[] = [];
    await reopened.flush(async (c) => { calls.push(c.id); });
    assert.deepEqual(calls, ['older-pending-work', 'new-job', 'new-note']);
    assert.equal(reopened.pending, 0);
  });

  it('retains buffered recovery commands for retry when reopening works but its atomic write fails', async () => {
    const backing = storage();
    const journal = new OfflineJournal<string, Command>(backing.disk);
    const buffer = [entry('receipt')];
    backing.fail(true);
    assert.throws(() => journal.resume('a', buffer, 'new receipt view'), /disk full/);
    assert.equal(journal.pending, 0);
    backing.fail(false);
    journal.resume('a', buffer, 'new receipt view');
    const restarted = new OfflineJournal<string, Command>(backing.disk);
    assert.equal(restarted.open('a'), 'new receipt view');
    assert.deepEqual(restarted.commands().map((e) => e.command.id), ['receipt']);
    assert.equal(restarted.open('b'), null);
  });
  it('drains a command appended while an empty flush is completing before its caller can issue work', async () => {
    const { disk } = storage();
    const queue = new OfflineJournal<number, Command>(disk);
    queue.open('a');
    const first = queue.flush(async () => {});
    queue.append([entry('invoice-prerequisite')], 1);
    const calls: string[] = [];
    await queue.flush(async (c) => { calls.push(c.id); });
    await first;
    assert.deepEqual(calls, ['invoice-prerequisite']);
    assert.equal(queue.pending, 0);
  });
  it('does not use an old empty-flush executor for a newly signed-in account', async () => {
    const { disk } = storage();
    const queue = new OfflineJournal<number, Command>(disk);
    queue.open('a');
    const first = queue.flush(async () => {});
    const oldWait = queue.flush(async () => { assert.fail('old account executor'); });
    const rejected = assert.rejects(oldWait, /signed_out/);
    queue.open('b'); queue.append([entry('b-job')], 1);
    await first; await rejected;
    const calls: string[] = [];
    await queue.flush(async (c) => { calls.push(c.id); });
    assert.deepEqual(calls, ['b-job']);
  });
  it('recovers a job and its dependent note after process restart without a network', async () => {
    const { disk } = storage();
    const first = new OfflineJournal<{ jobs: string[]; notes: string[] }, Command>(disk);
    first.open('owner-a');
    first.append([entry('job'), entry('note')], { jobs: ['job'], notes: ['note'] });
    await assert.rejects(first.flush(async () => { throw new Error('offline'); }));
    const restarted = new OfflineJournal<{ jobs: string[]; notes: string[] }, Command>(disk);
    assert.deepEqual(restarted.open('owner-a'), { jobs: ['job'], notes: ['note'] });
    const calls: string[] = [];
    await restarted.flush(async (c) => { calls.push(c.id); });
    assert.deepEqual(calls, ['job', 'note']);
    assert.equal(restarted.pending, 0);
  });

  it('stops on a failed prerequisite and keeps later writes for retry', async () => {
    const { disk } = storage();
    const queue = new OfflineJournal<number, Command>(disk);
    queue.open('a'); queue.append([entry('job'), entry('receipt'), entry('hours')], 1);
    const calls: string[] = [];
    await assert.rejects(queue.flush(async (c) => { calls.push(c.id); if (c.id === 'receipt') throw Error('offline'); }));
    assert.deepEqual(calls, ['job', 'receipt']);
    assert.equal(queue.pending, 2);
    await queue.flush(async (c) => { calls.push(c.id); });
    assert.deepEqual(calls, ['job', 'receipt', 'receipt', 'hours']);
  });

  it('does not mutate captured values when the form changes after a save', async () => {
    const { disk } = storage();
    const queue = new OfflineJournal<number, Command>(disk);
    queue.open('a'); const item = entry('work'); queue.append([item], 1);
    item.command.value = 'new form';
    await queue.flush(async (c) => { assert.equal(c.value, 'work'); });
  });

  it('does not show or replay the previous account after a switch during a request', async () => {
    const { disk } = storage();
    const queue = new OfflineJournal<string, Command>(disk);
    queue.open('a'); queue.append([entry('a-first'), entry('a-next')], 'private a');
    let finish!: () => void;
    const calls: string[] = [];
    const pending = queue.flush(async (c) => { calls.push(c.id); await new Promise<void>((done) => { finish = done; }); });
    const rejected = assert.rejects(pending, /signed_out/);
    assert.equal(queue.open('b'), null); queue.append([entry('b')], 'private b');
    finish(); await rejected;
    assert.deepEqual(calls, ['a-first']);
    await queue.flush(async (c) => { calls.push(c.id); });
    assert.deepEqual(calls, ['a-first', 'b']);
    assert.equal(queue.open('a'), 'private a');
    assert.equal(queue.pending, 2);
  });

  it('retries the same immutable operation id after a server acknowledgement is lost', async () => {
    const { disk } = storage();
    const queue = new OfflineJournal<string, Command>(disk);
    queue.open('a'); queue.append([entry('cash-operation-uuid')], 'unpaid');
    const applied = new Set<string>();
    await assert.rejects(queue.flush(async (c) => { applied.add(c.id); throw Error('response lost'); }));
    const restart = new OfflineJournal<string, Command>(disk); restart.open('a');
    await restart.flush(async (c) => { applied.add(c.id); }, () => 'confirmed paid');
    assert.deepEqual([...applied], ['cash-operation-uuid']);
    assert.equal(restart.open('a'), 'confirmed paid');
  });

  it('keeps a newly appended command when an older request finishes', async () => {
    const { disk } = storage();
    const queue = new OfflineJournal<number, Command>(disk);
    queue.open('a'); queue.append([entry('first')], 1);
    let finish!: () => void;
    const calls: string[] = [];
    const flushing = queue.flush(async (c) => { calls.push(c.id); if (c.id === 'first') await new Promise<void>((done) => { finish = done; }); });
    queue.append([entry('next')], 2); finish(); await flushing;
    assert.deepEqual(calls, ['first', 'next']);
    assert.equal(queue.open('a'), 2);
  });

  it('never reports a durable save if storage fails, and retains acknowledged writes for idempotent retry', async () => {
    const disk = storage();
    const queue = new OfflineJournal<number, Command>(disk.disk);
    queue.open('a'); disk.fail(true);
    assert.throws(() => queue.append([entry('job')], 1), /disk full/);
    assert.equal(queue.pending, 0);
    disk.fail(false); queue.append([entry('job')], 1); disk.fail(true);
    await assert.rejects(queue.flush(async () => {}), /disk full/);
    assert.equal(queue.pending, 1);
    disk.fail(false); await queue.flush(async () => {});
    assert.equal(queue.pending, 0);
  });

  it('rejects corrupt or wrongly owned cached records instead of overwriting them', () => {
    const { disk, rows } = storage();
    rows.set('kiln.offline.v1:a', JSON.stringify({ version: 1, owner: 'b', entries: [], snapshot: 'private' }));
    const queue = new OfflineJournal<string, Command>(disk);
    assert.throws(() => queue.open('a'), /offline_cache_invalid/);
    assert.equal(queue.open('b'), null);
  });
});
