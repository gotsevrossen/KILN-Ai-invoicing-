import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LOCK_AFTER_MS, lockEnabled, lockOnReturn, saveLockEnabled } from './app-lock.ts';

function memory(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (k) => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: (k) => { values.delete(k); },
    clear: () => values.clear(), key: () => null, get length() { return values.size; },
  };
}

describe('Face ID / fingerprint lock', () => {
  it('is on until the person turns it off on this phone', () => {
    const s = memory();
    assert.equal(lockEnabled(s), true);
    saveLockEnabled(s, false);
    assert.equal(lockEnabled(s), false);
    saveLockEnabled(s, true);
    assert.equal(lockEnabled(s), true);
    // storage that fails stays locked rather than open
    assert.equal(lockEnabled({ getItem: () => { throw new Error('no storage'); } }), true);
  });

  it('asks again only after being away long enough', () => {
    const base = { enabled: true, signedIn: true, available: true, now: 1_000_000_000 };
    assert.equal(lockOnReturn({ ...base, leftAt: base.now - 30_000 }), false, 'a quick trip to the texting app');
    assert.equal(lockOnReturn({ ...base, leftAt: base.now - LOCK_AFTER_MS }), true);
    assert.equal(lockOnReturn({ ...base, leftAt: null }), false);
  });

  it('never locks when it is off, nobody is signed in, or the phone has no screen lock', () => {
    const away = { leftAt: 0, now: LOCK_AFTER_MS * 2 };
    assert.equal(lockOnReturn({ ...away, enabled: false, signedIn: true, available: true }), false);
    assert.equal(lockOnReturn({ ...away, enabled: true, signedIn: false, available: true }), false);
    assert.equal(lockOnReturn({ ...away, enabled: true, signedIn: true, available: false }), false);
  });
});
