/** Notifications contain no records. Screens re-read through their existing permission checks. */
const listeners = new Set<() => void>();
export function onLiveRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyLiveRefresh() { for (const listener of listeners) listener(); }

// Pull to refresh: the signed-in live connection registers how to reload everything now.
let pull: (() => Promise<void>) | null = null;
export function setPullRefresh(next: () => Promise<void>): () => void {
  pull = next;
  return () => { if (pull === next) pull = null; };
}
/** Reloads what the open page shows. Resolves at once when nothing is connected. */
export function pullRefresh(): Promise<void> {
  if (pull) return pull();
  // not signed in (customer pages, example mode): pages that load their own data reload it
  notifyLiveRefresh();
  return Promise.resolve();
}
