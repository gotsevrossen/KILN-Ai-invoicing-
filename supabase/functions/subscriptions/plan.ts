// What RevenueCat says about a business's KILN subscription, turned into the row KILN saves.
// Plain logic, no network, so it can be tested. The answer is always the subscriber's current
// state from RevenueCat's own API, never a single notice: notices can arrive twice or out of order.

/** The RevenueCat entitlement every KILN plan unlocks. */
export const ENTITLEMENT = 'kiln_pro';

export type Status = 'trial' | 'active' | 'grace' | 'expired';
export type Store = 'apple' | 'google' | 'web' | null;

export interface Plan {
  status: Status;
  store: Store;
  productId: string | null;
  expiresAt: string | null;
}

// The parts of RevenueCat's subscriber answer (GET /v1/subscribers/{id}) KILN reads.
interface Entitlement { product_identifier?: unknown; expires_date?: unknown; grace_period_expires_date?: unknown }
interface Subscription {
  store?: unknown; period_type?: unknown; is_sandbox?: unknown; refunded_at?: unknown; grace_period_expires_date?: unknown;
}
export interface Subscriber {
  entitlements?: Record<string, Entitlement | undefined>;
  subscriptions?: Record<string, Subscription | undefined>;
}

const time = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};

const STORES: Record<string, Store> = { app_store: 'apple', mac_app_store: 'apple', play_store: 'google', stripe: 'web', rc_billing: 'web' };

/**
 * The plan to save. Test purchases (sandbox) count only when `allowSandbox` is on, so a test
 * build can't unlock a real business for free once KILN is live.
 */
export function planFrom(subscriber: Subscriber | null | undefined, now: number, allowSandbox: boolean): Plan {
  const none: Plan = { status: 'expired', store: null, productId: null, expiresAt: null };
  const ent = subscriber?.entitlements?.[ENTITLEMENT];
  if (!ent || typeof ent.product_identifier !== 'string' || ent.product_identifier.length > 120) return none;
  const productId = ent.product_identifier;
  const sub = subscriber?.subscriptions?.[productId] ?? {};
  const store = STORES[String(sub.store)] ?? null;
  const expires = time(ent.expires_date);
  // KILN sells subscriptions only: an entitlement with no end date isn't one of them
  if (expires === null) return { ...none, productId, store };
  if (sub.is_sandbox === true && !allowSandbox) return { ...none, productId, store };
  if (sub.refunded_at) return { status: 'expired', store, productId, expiresAt: new Date(Math.min(expires, now)).toISOString() };
  const grace = time(sub.grace_period_expires_date) ?? time(ent.grace_period_expires_date);
  const end = Math.max(expires, grace ?? 0);
  const expiresAt = new Date(end).toISOString();
  if (end <= now) return { status: 'expired', store, productId, expiresAt };
  if (expires <= now) return { status: 'grace', store, productId, expiresAt };
  return { status: sub.period_type === 'trial' ? 'trial' : 'active', store, productId, expiresAt };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The business a RevenueCat notice is about: the app signs in to RevenueCat with the business id. */
export function businessOf(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as { app_user_id?: unknown; original_app_user_id?: unknown; aliases?: unknown };
  const ids = [e.app_user_id, e.original_app_user_id, ...(Array.isArray(e.aliases) ? e.aliases : [])];
  const found = ids.find((id): id is string => typeof id === 'string' && UUID.test(id));
  return found ? found.toLowerCase() : null;
}

/** Compares two secrets in time that doesn't depend on where they differ. */
export function sameSecret(supplied: string | null, expected: string): boolean {
  if (supplied === null) return false;
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}
