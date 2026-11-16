import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSaveQueue, NoConnection, retryDelay, type QueueStatus } from './save-queue.ts';

/** Timers the test fires by hand. */
function fakeTimers() {
  const waiting = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    timers: {
      setTimeout: (fn: () => void, ms: number) => {
        waiting.set(next, { fn, ms });
        return next++;
      },
      clearTimeout: (h: unknown) => {
        waiting.delete(h as number);
      },
    },
    /** The waits asked for and not fired yet, in ms. */
    delays: () => [...waiting.values()].map((w) => w.ms),
    fire: () => {
      const all = [...waiting.entries()];
      waiting.clear();
      all.forEach(([, w]) => w.fn());
    },
  };
}

/** Lets the queue's promise callbacks run. */
const flush = () => new Promise<void>((r) => setImmediate(r));

function setup() {
  const clock = fakeTimers();
  const log: string[] = [];
  const refused: unknown[] = [];
  const statuses: QueueStatus[] = [];
  const queue = createSaveQueue({ timers: clock.timers, onRefused: (e) => refused.push(e), onChange: (s) => statuses.push(s) });
  return { clock, log, refused, statuses, queue };
}

describe('save queue', () => {
  it('runs saves one at a time, in order', async () => {
    const { queue, log } = setup();
    let release: () => void = () => {};
    queue.add(() => new Promise<void>((r) => { log.push('a start'); release = () => { log.push('a end'); r(); }; }));
    queue.add(async () => { log.push('b'); });
    await flush();
    assert.deepEqual(log, ['a start']);
    assert.equal(queue.status().pending, 2);
    release();
    await flush();
    assert.deepEqual(log, ['a start', 'a end', 'b']);
    assert.deepEqual(queue.status(), { pending: 0, offline: false });
  });

  it('keeps a save that got no answer at the front and tries it again', async () => {
    const { queue, log, clock, refused } = setup();
    let tries = 0;
    queue.add(async () => {
      tries += 1;
      if (tries < 3) throw new NoConnection();
      log.push('a saved');
    });
    queue.add(async () => { log.push('b saved'); });
    await flush();
    assert.deepEqual(queue.status(), { pending: 2, offline: true });
    assert.deepEqual(log, []);
    clock.fire();
    await flush();
    assert.equal(tries, 2);
    assert.deepEqual(log, []);
    clock.fire();
    await flush();
    assert.deepEqual(log, ['a saved', 'b saved']);
    assert.deepEqual(queue.status(), { pending: 0, offline: false });
    assert.deepEqual(refused, []);
  });

  it('reports a save the server refused and moves on', async () => {
    const { queue, log, refused, clock } = setup();
    queue.add(async () => { throw new Error('row-level security'); });
    queue.add(async () => { log.push('b saved'); });
    await flush();
    assert.equal(refused.length, 1);
    assert.equal((refused[0] as Error).message, 'row-level security');
    assert.deepEqual(log, ['b saved']);
    assert.deepEqual(clock.delays(), []);
  });

  it('treats a save that throws before starting as refused, not stuck', async () => {
    const { queue, log, refused } = setup();
    queue.add(() => { throw new Error('bad input'); });
    queue.add(async () => { log.push('b saved'); });
    await flush();
    assert.equal(refused.length, 1);
    assert.deepEqual(log, ['b saved']);
  });

  it('waits 2 s, 5 s, 15 s, then every 30 s', async () => {
    assert.deepEqual([1, 2, 3, 4, 5, 9].map(retryDelay), [2_000, 5_000, 15_000, 30_000, 30_000, 30_000]);
    const { queue, clock } = setup();
    queue.add(async () => { throw new NoConnection(); });
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      await flush();
      seen.push(...clock.delays());
      clock.fire();
    }
    assert.deepEqual(seen, [2_000, 5_000, 15_000, 30_000, 30_000]);
  });

  it('tries again right away when asked (app back in front), then starts the waits over', async () => {
    const { queue, log, clock } = setup();
    let online = false;
    queue.add(async () => {
      if (!online) throw new NoConnection();
      log.push('saved');
    });
    await flush();
    assert.deepEqual(clock.delays(), [2_000]);
    online = true;
    queue.retryNow();
    await flush();
    assert.deepEqual(log, ['saved']);
    assert.deepEqual(clock.delays(), []);
    online = false;
    queue.add(async () => {
      if (!online) throw new NoConnection();
    });
    await flush();
    assert.deepEqual(clock.delays(), [2_000]);
  });

  it('drops everything waiting on sign-out', async () => {
    const { queue, log, clock } = setup();
    queue.add(async () => { throw new NoConnection(); });
    queue.add(async () => { log.push('b'); });
    await flush();
    queue.clear();
    assert.deepEqual(queue.status(), { pending: 0, offline: false });
    assert.deepEqual(clock.delays(), []);
    clock.fire();
    await flush();
    assert.deepEqual(log, []);
    // the next account's saves run normally
    queue.add(async () => { log.push('next'); });
    await flush();
    assert.deepEqual(log, ['next']);
  });

  it('ignores a save still running when the queue was cleared', async () => {
    const { queue, refused, statuses } = setup();
    let fail: (e: unknown) => void = () => {};
    queue.add(() => new Promise<void>((_, reject) => { fail = reject; }));
    await flush();
    queue.clear();
    const after = statuses.length;
    fail(new Error('too late'));
    await flush();
    assert.deepEqual(refused, []);
    assert.equal(statuses.length, after);
  });

  it('settles once saved, and fails fast while waiting on signal', async () => {
    const { queue, clock } = setup();
    await queue.settled();
    let online = true;
    queue.add(async () => {
      if (!online) throw new NoConnection();
    });
    await queue.settled();

    online = false;
    queue.add(async () => {
      if (!online) throw new NoConnection();
    });
    const waiting = queue.settled();
    await assert.rejects(waiting, NoConnection);
    await assert.rejects(queue.settled(), NoConnection);
    online = true;
    clock.fire();
    await flush();
    await queue.settled();
  });

  it('settles after a refused save too (the caller hears from the server itself)', async () => {
    const { queue } = setup();
    queue.add(async () => { throw new Error('refused'); });
    await queue.settled();
  });

  it('can use its own test for "no connection"', async () => {
    const clock = fakeTimers();
    const refused: unknown[] = [];
    const queue = createSaveQueue({ timers: clock.timers, isNoConnection: (e) => (e as Error).message === 'offline', onRefused: (e) => refused.push(e) });
    queue.add(async () => { throw new Error('offline'); });
    await flush();
    assert.equal(queue.status().offline, true);
    assert.deepEqual(refused, []);
  });
});
