// Face ID / fingerprint lock: when the app asks again. Plain logic, no phone parts, so it can be tested.
// The choice is kept on this phone only (like the theme): one person can lock their phone and not their tablet.

/** Back in KILN within this long (sending an invoice from the texting app, taking a photo) doesn't lock again. */
export const LOCK_AFTER_MS = 5 * 60 * 1000;

const KEY = 'kiln.appLock';

/** On unless the person turned it off on this phone. */
export function lockEnabled(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveLockEnabled(storage: Pick<Storage, 'setItem'> | undefined, on: boolean): void {
  try {
    storage?.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // not saved: the choice still applies until the app closes
  }
}

/**
 * Whether coming back to KILN should ask for Face ID or a fingerprint. Only for someone signed in,
 * with the lock on, on a phone that has a screen lock, after being away at least LOCK_AFTER_MS.
 */
export function lockOnReturn(o: { enabled: boolean; signedIn: boolean; available: boolean; leftAt: number | null; now: number }): boolean {
  if (!o.enabled || !o.signedIn || !o.available || o.leftAt === null) return false;
  return o.now - o.leftAt >= LOCK_AFTER_MS;
}
