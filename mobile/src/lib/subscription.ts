// KILN's own subscription: plans by team size, and what the app shows from the server's answer
// (my_subscription(), migration 20261122130000). Plain logic, no phone parts, so it can be tested.
// The server enforces everything; this only decides what to show.

export type PlanId = 'team_1_3' | 'team_4_6' | 'team_7_plus';
export type Period = 'monthly' | 'yearly';

export interface PlanInfo {
  id: PlanId;
  /** People the plan covers; null: no limit. */
  limit: number | null;
}

/** Smallest first. Store product ids are `kiln_<id>` (monthly) and `kiln_<id>_yearly`. */
export const PLANS: PlanInfo[] = [
  { id: 'team_1_3', limit: 3 },
  { id: 'team_4_6', limit: 6 },
  { id: 'team_7_plus', limit: null },
];

export const productId = (plan: PlanId, period: Period) => `kiln_${plan}${period === 'yearly' ? '_yearly' : ''}`;

/** The plan and period of a store product. Google Play ids look like "kiln_team_4_6:monthly". */
export function productPlan(product: string | null | undefined): { plan: PlanId; period: Period } | null {
  const base = (product ?? '').split(':')[0];
  const match = /^kiln_(team_1_3|team_4_6|team_7_plus)(_yearly)?$/.exec(base);
  return match ? { plan: match[1] as PlanId, period: match[2] ? 'yearly' : 'monthly' } : null;
}

export const fits = (plan: PlanInfo, teamSize: number) => plan.limit === null || teamSize <= plan.limit;

/** The cheapest plan that covers the team. */
export function planForTeam(teamSize: number): PlanInfo {
  return PLANS.find((p) => fits(p, teamSize)) ?? PLANS[PLANS.length - 1];
}

export type Status = 'comped' | 'trial' | 'active' | 'grace' | 'expired';

export interface Subscription {
  /** The paywall is switched on at the server. While it's off, nothing is shown or blocked. */
  enforced: boolean;
  hasAccess: boolean;
  /** This person may add new work (false when beyond the plan's team size for 7 days). */
  canWrite: boolean;
  /** null: the business never subscribed. */
  status: Status | null;
  store: 'apple' | 'google' | 'web' | 'kiln' | null;
  productId: string | null;
  expiresAt: string | null;
  teamLimit: number | null;
  teamSize: number;
  overLimitSince: string | null;
  role: 'owner' | 'manager' | 'crew' | null;
}

const STATUSES: Status[] = ['comped', 'trial', 'active', 'grace', 'expired'];
const str = (v: unknown) => (typeof v === 'string' ? v : null);

/** The server's answer, checked field by field. Anything unreadable means "not switched on". */
export function readSubscription(raw: unknown): Subscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.enforced !== 'boolean') return null;
  const status = STATUSES.includes(r.status as Status) ? r.status as Status : null;
  const store = ['apple', 'google', 'web', 'kiln'].includes(r.store as string) ? r.store as Subscription['store'] : null;
  const role = ['owner', 'manager', 'crew'].includes(r.role as string) ? r.role as Subscription['role'] : null;
  return {
    enforced: r.enforced,
    hasAccess: r.hasAccess === true,
    canWrite: r.canWrite === true,
    status, store, role,
    productId: str(r.productId),
    expiresAt: str(r.expiresAt),
    teamLimit: typeof r.teamLimit === 'number' && r.teamLimit > 0 ? r.teamLimit : null,
    teamSize: typeof r.teamSize === 'number' && r.teamSize >= 0 ? r.teamSize : 0,
    overLimitSince: str(r.overLimitSince),
  };
}

/** New work is blocked for this person (the paywall should open, or the owner be asked). */
export const blocked = (s: Subscription | null) => !!s && s.enforced && !s.canWrite;

/** A business that never subscribed: the owner goes straight to the subscribe screen after setup. */
export const neverSubscribed = (s: Subscription | null) => !!s && s.enforced && s.status === null;

const DAY = 24 * 60 * 60 * 1000;

/** When people beyond the plan become read only (7 days after the team grew past it). */
export function readOnlyFrom(s: Subscription): Date | null {
  if (!s.overLimitSince) return null;
  const t = Date.parse(s.overLimitSince);
  return Number.isNaN(t) ? null : new Date(t + 7 * DAY);
}

export type Banner =
  | { kind: 'lapsed'; owner: boolean }
  | { kind: 'readOnly' }
  | { kind: 'overLimit'; count: number; limit: number; by: Date }
  | { kind: 'trialEnds'; on: Date };

/** The one notice Home shows, most important first. Nothing while the paywall is off. */
export function banner(s: Subscription | null, now: number): Banner | null {
  if (!s || !s.enforced) return null;
  if (!s.hasAccess) return { kind: 'lapsed', owner: s.role === 'owner' };
  if (!s.canWrite) return { kind: 'readOnly' };
  const by = readOnlyFrom(s);
  if (by && s.teamLimit !== null && s.teamSize > s.teamLimit) return { kind: 'overLimit', count: s.teamSize, limit: s.teamLimit, by };
  if (s.status === 'trial' && s.expiresAt) {
    const end = Date.parse(s.expiresAt);
    if (!Number.isNaN(end) && end - now <= 3 * DAY && end > now) return { kind: 'trialEnds', on: new Date(end) };
  }
  return null;
}
