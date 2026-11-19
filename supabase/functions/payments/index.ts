import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { cors, hashToken, newToken, Refused, reply, serviceClient, setting } from '../_shared/invoice.ts';
import { invoiceOnlineOptions, merchantCapabilities, merchantWalletDomain, stripe, stripeAccountColumns, stripeCheckoutEnabled,
  stripeConfigured, StripeError, stripeTestMode, type StripeAccount } from '../_shared/stripe.ts';
import { invoiceEmail } from './invoice-email.ts';

// POST /functions/v1/payments — the signed-in owner's payment setup and invoice links:
//   { action: 'connect' }              Stripe's sign-up page for the business's own Stripe account
//   { action: 'status' }               whether Apple Pay / Google Pay and bank payments are ready
//   { action: 'link', invoiceId }      a private link that opens one sent invoice for the customer
// Money goes straight to the owner's Stripe account and Stripe bills its fees to them; KILN only
// keeps the account id. The link's code is returned once and only its hash is stored.

const LINK_DAYS = 90;

interface Owner { businessId: string; businessName: string; email: string | undefined; isOwner: boolean }

/** Who's asking, checked by the database's own rules with their sign-in. */
async function whoIs(auth: string): Promise<Owner> {
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const me = await user.auth.getUser(auth.replace(/^Bearer /, ''));
  if (me.error || !me.data.user) throw new Refused(401, 'signed_out');
  const member = await user.from('business_members').select('business_id, role, businesses(name)')
    .eq('user_id', me.data.user.id).eq('status', 'active').maybeSingle<{ business_id: string; role: string; businesses: { name: string } | null }>();
  if (member.error || !member.data || !['owner', 'manager'].includes(member.data.role)) throw new Refused(403, 'owner_only');
  return {
    businessId: member.data.business_id, businessName: member.data.businesses?.name ?? '',
    email: me.data.user.email, isOwner: member.data.role === 'owner',
  };
}

/** The pay page's web address (Expo hosting, or the laptop while testing). */
function payUrl(): string {
  const url = setting('KILN_PAY_URL');
  if (!/^https?:\/\/[^/\s]+$/.test(url)) throw new Refused(503, 'not_set_up');
  return url;
}

function stripeKey(): string {
  const key = setting('STRIPE_SECRET_KEY');
  if (!key) throw new Refused(503, 'not_set_up');
  return key;
}

async function savedAccount(db: SupabaseClient, businessId: string, claimLegacy = false) {
  const testMode = stripeTestMode();
  const { data, error } = await db.from('stripe_accounts').select(stripeAccountColumns)
    .eq('business_id', businessId).eq('test_mode', testMode).maybeSingle<StripeAccount>();
  if (error) throw new Error('load failed');
  if (data || !claimLegacy) return data;
  const legacy = await db.from('stripe_accounts').select('account_id').eq('business_id', businessId).is('test_mode', null)
    .maybeSingle<{ account_id: string }>();
  if (legacy.error) throw new Error('load failed');
  if (!legacy.data) return null;
  try {
    await merchantCapabilities(stripeKey(), legacy.data.account_id);
  } catch (error) {
    if (error instanceof StripeError && (error.status === 404 || ['resource_missing', 'account_mode_mismatch'].includes(error.code))) return null;
    throw error;
  }
  const classified = await db.from('stripe_accounts').update({ test_mode: testMode, card_ready: false, bank_ready: false,
    wallet_ready: false, apple_pay_ready: false, google_pay_ready: false, domain_registered: null })
    .eq('account_id', legacy.data.account_id).eq('business_id', businessId).is('test_mode', null);
  if (classified.error && classified.error.code !== '23505') throw new Error('save failed');
  return savedAccount(db, businessId);
}

async function connect(db: SupabaseClient, who: Owner) {
  if (!who.isOwner) throw new Refused(403, 'owner_only');
  if (!stripeConfigured()) throw new Refused(503, 'not_set_up');
  const key = stripeKey();
  const base = payUrl();
  const testMode = stripeTestMode();
  let account = (await savedAccount(db, who.businessId, true))?.account_id;
  if (!account) {
    const made = await stripe<{ id: string; livemode: boolean }>(key, {
      method: 'POST', path: '/v2/core/accounts', idempotencyKey: `kiln-connect/${testMode ? 'test' : 'live'}/${who.businessId}`,
      body: {
        display_name: who.businessName.slice(0, 100) || undefined,
        contact_email: who.email,
        identity: { country: 'us' },
        // the owner's own full Stripe account: Stripe bills its fees to them and handles disputes
        dashboard: 'full',
        defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
        configuration: { merchant: { capabilities: { card_payments: { requested: true }, ach_debit_payments: { requested: true } } } },
        metadata: { kiln_business: who.businessId },
      },
    });
    if (made.livemode !== !testMode) throw new Refused(409, 'not_ready');
    const saved = await db.from('stripe_accounts').upsert({ business_id: who.businessId, account_id: made.id, test_mode: testMode },
      { onConflict: 'business_id,test_mode', ignoreDuplicates: true });
    if (saved.error) throw new Error('save failed');
    account = (await savedAccount(db, who.businessId))?.account_id;
    if (!account) throw new Error('account could not be loaded');
  }
  const link = await stripe<{ url: string }>(key, {
    method: 'POST', path: '/v2/core/account_links',
    body: {
      account,
      use_case: {
        type: 'account_onboarding',
        // Stripe no longer takes a configurations list here; the account's merchant setup decides what's asked
        account_onboarding: { return_url: `${base}/stripe-done`, refresh_url: `${base}/stripe-done?again=1` },
      },
    },
  });
  return { url: link.url };
}

async function status(db: SupabaseClient, who: Owner, recheck: boolean) {
  if (!stripeConfigured()) return { configured: false, connected: false, walletReady: false, bankReady: false };
  const saved = await savedAccount(db, who.businessId, true);
  const testMode = stripeTestMode();
  if (!saved) return { configured: true, connected: false, walletReady: false, bankReady: false, testMode };
  const key = stripeKey();
  const caps = await merchantCapabilities(key, saved.account_id);
  const payoutsReady = caps.payouts;
  const checkoutEnabled = stripeCheckoutEnabled();
  const enabled = checkoutEnabled && (testMode || payoutsReady);
  const cardReady = enabled && caps.card;
  const bankReady = enabled && caps.bank;
  const host = new URL(payUrl()).hostname;
  let domain: Awaited<ReturnType<typeof merchantWalletDomain>> | null = null;
  let walletCheckFailed = false;
  if (caps.card) {
    try {
      domain = await merchantWalletDomain(key, saved.account_id, host, checkoutEnabled ? (recheck ? 'recheck' : 'register') : 'inspect');
    } catch (error) {
      walletCheckFailed = true;
      console.warn('payments: wallet domain check failed', error instanceof StripeError ? error.code : 'unavailable');
    }
  }
  const applePayReady = cardReady && !!domain?.applePay;
  const googlePayReady = cardReady && !!domain?.googlePay;
  const walletReady = applePayReady || googlePayReady;
  const update = await db.from('stripe_accounts').update({
    wallet_ready: walletReady, apple_pay_ready: applePayReady, google_pay_ready: googlePayReady, bank_ready: bankReady, card_ready: cardReady,
    domain_registered: domain?.registered ? host : null, updated_at: new Date().toISOString(),
  }).eq('business_id', who.businessId).eq('account_id', saved.account_id).eq('test_mode', testMode);
  if (update.error) throw new Error('save failed');
  return { configured: true, connected: true, walletReady, applePayReady, googlePayReady, bankReady, cardReady, testMode, payoutsReady,
    checkoutEnabled, walletCheckFailed, walletDomain: host, walletDomainEnabled: !!domain?.enabled };
}

async function link(db: SupabaseClient, who: Owner, invoiceId: unknown) {
  if (typeof invoiceId !== 'string' || !/^[0-9a-f-]{36}$/.test(invoiceId)) throw new Refused(400, 'bad_request');
  const base = payUrl();
  const { data: invoice, error } = await db.from('invoices').select('id, sent_at')
    .eq('id', invoiceId).eq('business_id', who.businessId).maybeSingle<{ id: string; sent_at: string | null }>();
  if (error) throw new Error('load failed');
  // a customer only ever sees an invoice after it's sent (and can't change)
  if (!invoice?.sent_at) throw new Refused(409, 'not_sent');
  const choices = await db.rpc('invoice_acceptance_view', { p_invoice: invoice.id });
  if (choices.error) throw new Error('load payment choices failed');
  if (!Object.keys(choices.data?.alternativeMethods ?? {}).length) throw new Refused(422, 'alternative_methods_required');
  const token = newToken();
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
  const saved = await db.from('share_links').insert({
    business_id: who.businessId, token_hash: await hashToken(token), document_type: 'invoice', document_id: invoice.id, expires_at: expiresAt,
  });
  if (saved.error) throw new Error('save failed');
  return { url: `${base}/pay/${token}`, expiresAt };
}

async function invoiceCheckout(db: SupabaseClient, who: Owner, invoiceId: unknown, cancel: boolean) {
  if (typeof invoiceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new Refused(400, 'bad_request');
  const invoice = await db.from('invoices').select('id').eq('business_id', who.businessId).eq('id', invoiceId).maybeSingle();
  if (invoice.error) throw new Error('invoice lookup failed');
  if (!invoice.data) throw new Refused(404, 'not_found');
  const attempt = await db.from('invoice_payment_reservations').select('intent_id,attempt_key').eq('invoice_id', invoiceId)
    .maybeSingle<{ intent_id: string | null; attempt_key: string | null }>();
  if (attempt.error) throw new Error('checkout lookup failed');
  if (!cancel || !attempt.data) return { active: !!attempt.data, canCancel: !!attempt.data };
  const intentId = attempt.data.intent_id;
  if (!intentId) {
    const released = await db.rpc('release_unbound_invoice_checkout', { p_invoice: invoiceId, p_attempt: attempt.data.attempt_key });
    if (released.error) throw new Error('checkout release failed');
    if (!released.data) throw new Refused(409, 'not_ready');
    return { active: false, canCancel: false };
  }
  const account = await savedAccount(db, who.businessId);
  if (!/^pi_[A-Za-z0-9]{8,64}$/.test(intentId) || !account) throw new Refused(409, 'not_ready');
  const key = stripeKey();
  const path = `/v1/payment_intents/${intentId}`;
  type Intent = { id: string; status: string; metadata?: { invoice_id?: string; business_id?: string } };
  const intent = await stripe<Intent>(key, { method: 'GET', path, account: account.account_id });
  if (intent.id !== intentId || intent.metadata?.invoice_id !== invoiceId || intent.metadata.business_id !== who.businessId) throw new Refused(409, 'not_ready');
  const canceled = intent.status === 'canceled' ? intent : await stripe<Intent>(key, { method: 'POST', path: `${path}/cancel`, account: account.account_id });
  if (canceled.id !== intentId || canceled.status !== 'canceled') throw new Refused(409, 'not_ready');
  const released = await db.rpc('release_canceled_invoice_payment', { p_invoice: invoiceId, p_intent: intentId });
  if (released.error) throw new Error('checkout release failed');
  return { active: false, canCancel: false };
}

async function changeOrderLink(db: SupabaseClient, who: Owner, documentId: unknown) {
  if (typeof documentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(documentId)) throw new Refused(400, 'bad_request');
  const change = await db.from('change_orders').select('id').eq('id', documentId).eq('business_id', who.businessId)
    .not('sent_at', 'is', null).maybeSingle();
  if (change.error) throw new Error('change order lookup failed');
  if (!change.data) throw new Refused(404, 'not_found');
  const base = payUrl();
  const token = newToken();
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
  const saved = await db.from('share_links').insert({ business_id: who.businessId, document_id: change.data.id,
    document_type: 'change_order', token_hash: await hashToken(token), expires_at: expiresAt });
  if (saved.error) throw new Error('save failed');
  return { url: `${base}/change/${token}`, expiresAt };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'bad_request' });
  const auth = req.headers.get('Authorization');
  if (!auth) return reply(401, { error: 'signed_out' });
  try {
    let body: { action?: unknown; invoiceId?: unknown; requestId?: unknown; attemptId?: unknown; recipient?: unknown; reminder?: unknown; recheck?: unknown };
    try {
      body = JSON.parse(await req.text());
    } catch {
      throw new Refused(400, 'bad_request');
    }
    const who = await whoIs(auth);
    const db = serviceClient();
    if (body.action === 'requestLink') {
      if (typeof body.requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.requestId)) throw new Refused(400, 'bad_request');
      const request = await db.from('job_payment_requests').select('id').eq('id', body.requestId).eq('business_id', who.businessId).maybeSingle();
      if (request.error || !request.data) throw new Refused(404, 'not_found');
      const token = newToken();
      const expiresAt = new Date(Date.now() + LINK_DAYS * 86400000).toISOString();
      const saved = await db.from('job_payment_requests').update({token_hash: await hashToken(token), expires_at: expiresAt}).eq('id', request.data.id);
      if (saved.error) throw new Error('save failed');
      return reply(200, {url: `${payUrl()}/collect/${token}`, expiresAt});
    }
    if (body.action === 'link') return reply(200, await link(db, who, body.invoiceId));
    if (body.action === 'changeOrderLink') return reply(200, await changeOrderLink(db, who, body.requestId));
    if (body.action === 'invoiceCheckout' || body.action === 'cancelInvoiceCheckout') {
      return reply(200, await invoiceCheckout(db, who, body.invoiceId, body.action === 'cancelInvoiceCheckout'));
    }
    if (body.action === 'invoiceOptions') {
      const methods = invoiceOnlineOptions(await savedAccount(db, who.businessId));
      return reply(200, { wallet: !!methods?.wallet, applePay: !!methods?.applePay, googlePay: !!methods?.googlePay,
        card: !!methods?.card, bank: !!methods?.bank, testMode: stripeTestMode() });
    }
    if (body.action === 'invoiceEmail' || body.action === 'invoiceEmailStatus') {
      const send = body.action === 'invoiceEmail' ? { attemptId: body.attemptId, recipient: body.recipient, reminder: body.reminder === true } : null;
      return reply(200, await invoiceEmail(db, who.businessId, body.invoiceId, send, async (id) => (await link(db, who, id)).url));
    }
    if (!who.isOwner) throw new Refused(403, 'owner_only');
    if (body.action === 'connect') return reply(200, await connect(db, who));
    if (body.action === 'status') return reply(200, await status(db, who, body.recheck === true));
    throw new Refused(400, 'bad_request');
  } catch (e) {
    if (e instanceof Refused) return reply(e.status, { error: e.code });
    if (e instanceof StripeError) {
      console.error(`payments: Stripe said ${e.status} ${e.code}`);
      return reply(502, { error: 'stripe_failed' });
    }
    console.error('payments: unexpected error', e instanceof Error ? e.message : typeof e);
    return reply(500, { error: 'failed' });
  }
});
