/** Notifications contain no records. Screens re-read through their existing permission checks. */
const listeners = new Set<() => void>();
export function onLiveRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyLiveRefresh() { for (const listener of listeners) listener(); }
