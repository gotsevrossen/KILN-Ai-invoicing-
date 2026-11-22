import { createClient } from '@supabase/supabase-js';

import { cors, reply, serviceClient, setting } from '../_shared/invoice.ts';
import { BodyTooLarge, InvalidBody, readObject } from '../_shared/request.ts';
import { businessOf, planFrom, sameSecret, type Subscriber } from './plan.ts';

// POST /functions/v1/subscriptions
//   * From RevenueCat (its webhook, with our secret in the Authorization header): a business's
//     subscription changed. Nothing in the notice is trusted except which business it's about;
//     the current state is read from RevenueCat's API and saved.
//   * From the app (signed in): { action: 'refresh' } right after buying or restoring, so the owner
//     doesn't wait for RevenueCat's notice. Answers with the caller's my_subscription().
// Secrets: REVENUECAT_SECRET_KEY (RevenueCat API), REVENUECAT_WEBHOOK_AUTH (32+ characters, the same
// text set as the webhook's Authorization header in RevenueCat). KILN_REVENUECAT_SANDBOX=true lets
// test purchases count (testing only; leave it off once KILN is live).

async function subscriber(appUserId: string): Promise<Subscriber | null> {
  const key = setting('REVENUECAT_SECRET_KEY');
  if (!key) throw new Error('not_set_up');
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`revenuecat_${res.status}`);
  const body = await res.json() as { subscriber?: Subscriber };
  return body.subscriber ?? null;
}

/** Reads the business's current plan from RevenueCat and saves it. */
async function sync(businessId: string): Promise<void> {
  const plan = planFrom(await subscriber(businessId), Date.now(), setting('KILN_REVENUECAT_SANDBOX') === 'true');
  const saved = await serviceClient().rpc('save_business_subscription', {
    p_business: businessId, p_status: plan.status, p_store: plan.store, p_product: plan.productId, p_expires: plan.expiresAt,
  });
  if (saved.error) {
    // a notice for a business that no longer exists (deleted account) is done, not an error to retry
    if (saved.error.code === 'P0002') return;
    throw new Error(`save_failed_${saved.error.code}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'bad_request' });
  const auth = req.headers.get('Authorization');
  const webhookSecret = setting('REVENUECAT_WEBHOOK_AUTH');
  try {
    const body = await readObject(req, 64_000);

    if (webhookSecret.length >= 32 && sameSecret(auth, webhookSecret)) {
      const event = body.event as { type?: unknown } | undefined;
      if (event?.type === 'TEST') return reply(200, { ok: true });
      const businessId = businessOf(event);
      // not one of KILN's businesses (or not a business id): nothing to save, and RevenueCat shouldn't retry
      if (!businessId) return reply(200, { ok: true, ignored: true });
      await sync(businessId);
      return reply(200, { ok: true });
    }

    // the app, signed in
    if (!auth) return reply(401, { error: 'signed_out' });
    if (body.action !== 'refresh') return reply(400, { error: 'bad_request' });
    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const before = await user.rpc('my_subscription');
    if (before.error) return reply(401, { error: 'signed_out' });
    const businessId = (before.data as { businessId?: unknown }).businessId;
    if (typeof businessId !== 'string') return reply(401, { error: 'signed_out' });
    await sync(businessId);
    const after = await user.rpc('my_subscription');
    if (after.error) return reply(401, { error: 'signed_out' });
    return reply(200, after.data);
  } catch (e) {
    if (e instanceof BodyTooLarge) return reply(413, { error: 'too_big' });
    if (e instanceof InvalidBody) return reply(400, { error: 'bad_request' });
    if (e instanceof Error && e.message === 'not_set_up') return reply(503, { error: 'not_set_up' });
    console.error('subscriptions: failed', e instanceof Error ? e.message : typeof e);
    // RevenueCat retries a failed notice; the app shows its friendly error and can try again
    return reply(502, { error: 'failed' });
  }
});
