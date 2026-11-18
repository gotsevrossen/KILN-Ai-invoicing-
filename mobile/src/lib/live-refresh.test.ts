import assert from 'node:assert/strict';
import { it } from 'node:test';
import { setImmediate as settle } from 'node:timers/promises';
import { LiveRefresh } from './live-refresh.ts';

it('coalesces a receipt transaction burst into one refresh', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const live = new LiveRefresh(async () => { calls++; return true; });
  for (let i = 0; i < 400; i++) live.request();
  t.mock.timers.tick(299);
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(calls, 1);
  live.stop();
});

it('serializes reloads and preserves an invalidation received during a read', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolve!: (value: boolean) => void;
  let calls = 0;
  const live = new LiveRefresh(() => { calls++; return calls === 1 ? new Promise<boolean>((done) => { resolve = done; }) : Promise.resolve(true); });
  live.request(); t.mock.timers.tick(300);
  live.request(); live.request(); t.mock.timers.tick(1000);
  assert.equal(calls, 1);
  resolve(true); await settle();
  t.mock.timers.tick(300); await settle();
  assert.equal(calls, 2);
  live.stop();
});

it('retries a server snapshot discarded because a local edit arrived', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const live = new LiveRefresh(async () => ++calls > 1);
  live.request(); t.mock.timers.tick(300); await settle();
  assert.equal(calls, 1);
  t.mock.timers.tick(300); await settle();
  assert.equal(calls, 2);
  live.stop();
});

it('a failed connection can recover on the next foreground/reconnect request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const live = new LiveRefresh(async () => { if (++calls === 1) throw Error('offline'); return true; });
  live.request(); t.mock.timers.tick(300); await settle();
  t.mock.timers.tick(1000); assert.equal(calls, 1);
  live.request(); t.mock.timers.tick(300); await settle();
  assert.equal(calls, 2);
  live.stop();
});

it('stopping an account cancels queued work and prevents an in-flight read retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolve!: (value: boolean) => void;
  let calls = 0;
  const live = new LiveRefresh(() => { calls++; return new Promise<boolean>((done) => { resolve = done; }); });
  live.request(); t.mock.timers.tick(300);
  live.request(); live.stop(); resolve(false); await settle();
  live.request(); t.mock.timers.tick(1000);
  assert.equal(calls, 1);
  const queued = new LiveRefresh(async () => { calls++; return true; });
  queued.request(); queued.stop(); t.mock.timers.tick(1000);
  assert.equal(calls, 1);
});
