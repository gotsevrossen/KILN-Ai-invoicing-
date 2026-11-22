import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { banner, blocked, neverSubscribed, planForTeam, productId, productPlan, readSubscription } from './subscription.ts';

const base = {
  enforced: true, hasAccess: true, canWrite: true, status: 'active', store: 'apple', productId: 'kiln_team_1_3',
  expiresAt: '2026-12-30T00:00:00Z', teamLimit: 3, teamSize: 2, overLimitSince: null, role: 'owner',
};
const now = Date.parse('2026-12-01T00:00:00Z');

describe('KILN subscription', () => {
  it('picks the cheapest plan that covers the team', () => {
    assert.equal(planForTeam(1).id, 'team_1_3');
    assert.equal(planForTeam(3).id, 'team_1_3');
    assert.equal(planForTeam(4).id, 'team_4_6');
    assert.equal(planForTeam(6).id, 'team_4_6');
    assert.equal(planForTeam(7).id, 'team_7_plus');
    assert.equal(planForTeam(40).id, 'team_7_plus');
  });

  it('reads store products, monthly or yearly, Apple or Google', () => {
    assert.equal(productId('team_4_6', 'yearly'), 'kiln_team_4_6_yearly');
    assert.deepEqual(productPlan('kiln_team_4_6_yearly'), { plan: 'team_4_6', period: 'yearly' });
    assert.deepEqual(productPlan('kiln_team_7_plus:monthly'), { plan: 'team_7_plus', period: 'monthly' });
    assert.equal(productPlan('something_else'), null);
    assert.equal(productPlan(null), null);
  });

  it('shows and blocks nothing while the paywall is switched off', () => {
    const off = readSubscription({ ...base, enforced: false, hasAccess: true, canWrite: true, status: null });
    assert.equal(blocked(off), false);
    assert.equal(neverSubscribed(off), false);
    assert.equal(banner(off, now), null);
    // an answer the app can't read never locks anyone out
    assert.equal(readSubscription({ hasAccess: false }), null);
    assert.equal(blocked(readSubscription('nonsense')), false);
  });

  it('a lapsed business is blocked; the owner and the team see different notices', () => {
    const lapsed = readSubscription({ ...base, hasAccess: false, canWrite: false, status: 'expired' });
    assert.equal(blocked(lapsed), true);
    assert.deepEqual(banner(lapsed, now), { kind: 'lapsed', owner: true });
    assert.deepEqual(banner(readSubscription({ ...base, hasAccess: false, canWrite: false, status: 'expired', role: 'crew' }), now), { kind: 'lapsed', owner: false });
    assert.equal(neverSubscribed(readSubscription({ ...base, hasAccess: false, canWrite: false, status: null })), true);
  });

  it('warns about a team bigger than its plan, then shows read only', () => {
    const over = readSubscription({ ...base, teamSize: 4, overLimitSince: '2026-11-29T00:00:00Z' });
    assert.deepEqual(banner(over, now), { kind: 'overLimit', count: 4, limit: 3, by: new Date('2026-12-06T00:00:00Z') });
    assert.deepEqual(banner(readSubscription({ ...base, canWrite: false, teamSize: 4 }), now), { kind: 'readOnly' });
  });

  it('reminds the owner 3 days before the free trial ends', () => {
    const trial = (end: string) => banner(readSubscription({ ...base, status: 'trial', expiresAt: end }), now);
    assert.deepEqual(trial('2026-12-03T00:00:00Z'), { kind: 'trialEnds', on: new Date('2026-12-03T00:00:00Z') });
    assert.equal(trial('2026-12-10T00:00:00Z'), null);
  });
});
