// Payment pieces that must be exactly right: Stripe's signature check, link codes, and what's owed.
// Run: npx deno@2.9.6 test supabase/functions/_shared/shared.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';

import { balance, hashToken, newToken, tokenShape, totalsOf } from './invoice.ts';
import { formBody, merchantWalletDomain, verifyWebhook } from './stripe.ts';

async function sign(secret: string, time: number, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${time}.${payload}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.test('a notice signed with the webhook secret is accepted', async () => {
  const payload = '{"type":"payment_intent.succeeded"}';
  const now = 1_800_000_000;
  const header = `t=${now},v1=${await sign('whsec_test', now, payload)}`;
  assert(await verifyWebhook(payload, header, 'whsec_test', now));
  // Stripe may list more than one signature while a secret is being replaced
  assert(await verifyWebhook(payload, `t=${now},v1=${'0'.repeat(64)},v1=${await sign('whsec_test', now, payload)}`, 'whsec_test', now));
});

Deno.test('forged, changed, old, or unsigned notices are refused', async () => {
  const payload = '{"type":"payment_intent.succeeded"}';
  const now = 1_800_000_000;
  const good = await sign('whsec_test', now, payload);
  assertEquals(await verifyWebhook(payload, `t=${now},v1=${await sign('wrong', now, payload)}`, 'whsec_test', now), false);
  assertEquals(await verifyWebhook(payload.replace('succeeded', 'processing'), `t=${now},v1=${good}`, 'whsec_test', now), false);
  assertEquals(await verifyWebhook(payload, `t=${now},v1=${good}`, 'whsec_test', now + 301), false);
  assertEquals(await verifyWebhook(payload, null, 'whsec_test', now), false);
  assertEquals(await verifyWebhook(payload, `t=${now},v1=${good}`, '', now), false);
  assertEquals(await verifyWebhook(payload, `v1=${good}`, 'whsec_test', now), false);
});

Deno.test('link codes are long, random, and stored only as a hash', async () => {
  const a = newToken();
  const b = newToken();
  assert(tokenShape(a) && tokenShape(b));
  assert(a !== b);
  assertEquals((await hashToken(a)).length, 64);
  assert((await hashToken(a)) !== a);
  for (const bad of ['', 'short', `${a}x`, `${a.slice(0, 42)}!`, null, 42]) assertEquals(tokenShape(bad), false);
});

Deno.test('the amount charged matches the app: per-line rounding, then tax once', () => {
  const lines = [
    { description: 'Labor', kind: 'labor' as const, qty_hundredths: 250, unit_cents: 8500, unit: 'hour', position: 0 },
    { description: 'Faucet', kind: 'material' as const, qty_hundredths: 100, unit_cents: 12999, unit: null, position: 1 },
    { description: 'Trip fee', kind: 'fee' as const, qty_hundredths: 100, unit_cents: 4500, unit: null, position: 2 },
  ];
  const totals = totalsOf(lines, { tax_rate_bps: 700, tax_labor: false, tax_materials: true });
  assertEquals(totals.subtotal, 21250 + 12999 + 4500);
  assertEquals(totals.tax, 910);
  assertEquals(totals.total, 38749 + 910);
});

Deno.test("what's left to pay counts paid and on-the-way payments, never failed ones", () => {
  assertEquals(balance(10000, []), { paid: 0, pending: 0, due: 10000 });
  assertEquals(balance(10000, [{ amount_cents: 4000, status: 'succeeded' }, { amount_cents: 3000, status: 'failed' }]), { paid: 4000, pending: 0, due: 6000 });
  assertEquals(balance(10000, [{ amount_cents: 10000, status: 'processing' }]), { paid: 0, pending: 10000, due: 0 });
  // paid twice (cash and online) never shows a negative amount due
  assertEquals(balance(10000, [{ amount_cents: 10000, status: 'succeeded' }, { amount_cents: 10000, status: 'succeeded' }]).due, 0);
});

Deno.test("Stripe's form style for nested fields and lists", () => {
  assertEquals(
    decodeURIComponent(formBody({ amount: 500, allowed_payment_method_types: ['card'], metadata: { invoice_id: 'x' }, skip: undefined })),
    'amount=500&allowed_payment_method_types[0]=card&metadata[invoice_id]=x',
  );
});

Deno.test('wallet readiness comes from the connected merchant, domain, and environment', async () => {
  const original = globalThis.fetch;
  const host = 'checkout.example.test';
  const domain = { id: 'pmd_example', domain_name: host, livemode: false, enabled: true,
    apple_pay: { status: 'inactive' }, google_pay: { status: 'active' } };
  const calls: string[] = [];
  globalThis.fetch = (_input, init) => {
    const url = new URL(String(_input));
    assertEquals(new Headers(init?.headers).get('Stripe-Account'), 'acct_merchant');
    calls.push(`${init?.method} ${url.pathname}`);
    if (init?.method === 'GET') {
      assertEquals(url.searchParams.get('domain_name'), host);
      return Promise.resolve(Response.json({ data: [{ ...domain, livemode: true }, domain] }));
    }
    return Promise.resolve(Response.json({ ...domain, apple_pay: { status: 'active' } }));
  };
  try {
    assertEquals(await merchantWalletDomain('sk_test_example', 'acct_merchant', host, 'inspect'),
      { registered: true, enabled: true, applePay: false, googlePay: true });
    assertEquals(await merchantWalletDomain('sk_test_example', 'acct_merchant', host, 'recheck'),
      { registered: true, enabled: true, applePay: true, googlePay: true });
    assertEquals(calls, ['GET /v1/payment_method_domains', 'GET /v1/payment_method_domains', 'POST /v1/payment_method_domains/pmd_example/validate']);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test('a disabled wallet domain stays off during an owner recheck', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_input, init) => {
    assertEquals(init?.method, 'GET');
    return Promise.resolve(Response.json({ data: [{ id: 'pmd_example', domain_name: 'checkout.example.test', livemode: true,
      enabled: false, apple_pay: { status: 'active' }, google_pay: { status: 'active' } }] }));
  };
  try {
    assertEquals(await merchantWalletDomain('sk_live_example', 'acct_merchant', 'checkout.example.test', 'recheck'),
      { registered: true, enabled: false, applePay: false, googlePay: false });
  } finally {
    globalThis.fetch = original;
  }
});
