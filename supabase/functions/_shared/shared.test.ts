// Payment pieces that must be exactly right: Stripe's signature check, link codes, and what's owed.
// Run: npx deno@2.9.6 test supabase/functions/_shared/shared.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';

import { balance, hashToken, newToken, tokenShape, totalsOf } from './invoice.ts';
import { formBody, verifyWebhook } from './stripe.ts';

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
    decodeURIComponent(formBody({ amount: 500, payment_method_types: ['card'], metadata: { invoice_id: 'x' }, skip: undefined })),
    'amount=500&payment_method_types[0]=card&metadata[invoice_id]=x',
  );
});
