// What KILN saves from RevenueCat's answer. Run: npx deno@2.9.6 test (from this folder)
import { assertEquals } from 'jsr:@std/assert@1.0.13';

import { businessOf, planFrom, sameSecret } from './plan.ts';

const now = Date.parse('2026-12-01T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const iso = (t: number) => new Date(t).toISOString();

const subscriber = (product: string, expires: number | null, sub: Record<string, unknown> = {}) => ({
  entitlements: { kiln_pro: { product_identifier: product, expires_date: expires === null ? null : iso(expires) } },
  subscriptions: { [product]: { store: 'app_store', period_type: 'normal', is_sandbox: false, ...sub } },
});

Deno.test('a paid plan is active until it ends', () => {
  assertEquals(planFrom(subscriber('kiln_team_1_3', now + 20 * day), now, false),
    { status: 'active', store: 'apple', productId: 'kiln_team_1_3', expiresAt: iso(now + 20 * day) });
});

Deno.test('the 14-day free trial is a trial, on Google Play too', () => {
  const plan = planFrom(subscriber('kiln_team_4_6:monthly', now + 14 * day, { store: 'play_store', period_type: 'trial' }), now, false);
  assertEquals([plan.status, plan.store, plan.productId], ['trial', 'google', 'kiln_team_4_6:monthly']);
});

Deno.test('a failed renewal inside the store\'s grace period still has access', () => {
  const plan = planFrom(subscriber('kiln_team_1_3', now - day, { grace_period_expires_date: iso(now + 5 * day) }), now, false);
  assertEquals([plan.status, plan.expiresAt], ['grace', iso(now + 5 * day)]);
});

Deno.test('ended, refunded, missing and never-ending plans have no access', () => {
  assertEquals(planFrom(subscriber('kiln_team_1_3', now - day), now, false).status, 'expired');
  assertEquals(planFrom(subscriber('kiln_team_1_3', now + 20 * day, { refunded_at: iso(now - day) }), now, false).status, 'expired');
  assertEquals(planFrom({ entitlements: {} }, now, false), { status: 'expired', store: null, productId: null, expiresAt: null });
  assertEquals(planFrom(null, now, false).status, 'expired');
  assertEquals(planFrom(subscriber('kiln_team_1_3', null), now, false).status, 'expired');
});

Deno.test('test purchases count only while testing is switched on', () => {
  const sandbox = subscriber('kiln_team_7_plus_yearly', now + 300 * day, { is_sandbox: true });
  assertEquals(planFrom(sandbox, now, false).status, 'expired');
  assertEquals(planFrom(sandbox, now, true).status, 'active');
});

Deno.test('the business comes from the RevenueCat user id, never from anything else in the notice', () => {
  const id = '5F0C2A9E-1D4B-4C7A-9E2F-8B3D6A1C0E47';
  assertEquals(businessOf({ app_user_id: id }), id.toLowerCase());
  assertEquals(businessOf({ app_user_id: '$RCAnonymousID:abc', aliases: ['x', id] }), id.toLowerCase());
  assertEquals(businessOf({ app_user_id: "1' or 1=1" }), null);
  assertEquals(businessOf(null), null);
});

Deno.test('the webhook secret must match exactly', () => {
  const secret = 'a'.repeat(40);
  assertEquals(sameSecret(secret, secret), true);
  assertEquals(sameSecret(`${secret}x`, secret), false);
  assertEquals(sameSecret('a'.repeat(39), secret), false);
  assertEquals(sameSecret(null, secret), false);
});
