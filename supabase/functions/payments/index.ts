import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { cors, hashToken, newToken, Refused, reply, serviceClient, setting } from '../_shared/invoice.ts';
import { stripe, StripeError } from '../_shared/stripe.ts';

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
    .eq('user_id', me.data.user.id).limit(1).maybeSingle<{ business_id: string; role: string; businesses: { name: string } | null }>();
  if (member.error || !member.data) throw new Refused(403, 'no_business');
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

async function savedAccount(db: SupabaseClient, businessId: string) {
  const { data, error } = await db.from('stripe_accounts').select('account_id, wallet_ready, bank_ready, domain_registered')
    .eq('business_id', businessId).maybeSingle<{ account_id: string; wallet_ready: boolean; bank_ready: boolean; domain_registered: string | null }>();
  if (error) throw new Error('load failed');
  return data;
}

async function connect(db: SupabaseClient, who: Owner) {
  if (!who.isOwner) throw new Refused(403, 'owner_only');
  const key = stripeKey();
  const base = payUrl();
  let account = (await savedAccount(db, who.businessId))?.account_id;
  if (!account) {
    const made = await stripe<{ id: string }>(key, {
      method: 'POST', path: '/v2/core/accounts',
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
    const saved = await db.from('stripe_accounts').insert({ business_id: who.businessId, account_id: made.id });
    if (saved.error) throw new Error('save failed');
    account = made.id;
  }
  const link = await stripe<{ url: string }>(key, {
    method: 'POST', path: '/v2/core/account_links',
    body: {
      account,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: { configurations: ['merchant'], return_url: `${base}/stripe-done`, refresh_url: `${base}/stripe-done?again=1` },
      },
    },
  });
  return { url: link.url };
}

interface V2Account {
  configuration?: { merchant?: { capabilities?: Record<string, { status?: string }> } };
}

async function status(db: SupabaseClient, who: Owner) {
  const saved = await savedAccount(db, who.businessId);
  if (!saved) return { connected: false, walletReady: false, bankReady: false };
  const key = stripeKey();
  const acct = await stripe<V2Account>(key, { method: 'GET', path: `/v2/core/accounts/${saved.account_id}?include=configuration.merchant` });
  const caps = acct.configuration?.merchant?.capabilities ?? {};
  const walletReady = caps.card_payments?.status === 'active';
  const bankReady = caps.ach_debit_payments?.status === 'active';

  // Apple Pay shows only on web addresses Stripe knows for this account
  let domain = saved.domain_registered;
  const host = new URL(payUrl()).host;
  if (walletReady && domain !== host && payUrl().startsWith('https://')) {
    await stripe(key, { method: 'POST', path: '/v1/payment_method_domains', account: saved.account_id, body: { domain_name: host } })
      .catch((e) => {
        // already registered earlier counts as done
        if (!(e instanceof StripeError && e.status === 400)) throw e;
      });
    domain = host;
  }
  const update = await db.from('stripe_accounts').update({
    wallet_ready: walletReady, bank_ready: bankReady, domain_registered: domain, updated_at: new Date().toISOString(),
  }).eq('business_id', who.businessId);
  if (update.error) throw new Error('save failed');
  return { connected: true, walletReady, bankReady };
}

async function link(db: SupabaseClient, who: Owner, invoiceId: unknown) {
  if (typeof invoiceId !== 'string' || !/^[0-9a-f-]{36}$/.test(invoiceId)) throw new Refused(400, 'bad_request');
  const base = payUrl();
  const { data: invoice, error } = await db.from('invoices').select('id, sent_at')
    .eq('id', invoiceId).eq('business_id', who.businessId).maybeSingle<{ id: string; sent_at: string | null }>();
  if (error) throw new Error('load failed');
  // a customer only ever sees an invoice after it's sent (and can't change)
  if (!invoice?.sent_at) throw new Refused(409, 'not_sent');
  const token = newToken();
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
  const saved = await db.from('share_links').insert({
    business_id: who.businessId, token_hash: await hashToken(token), document_type: 'invoice', document_id: invoice.id, expires_at: expiresAt,
  });
  if (saved.error) throw new Error('save failed');
  return { url: `${base}/pay/${token}`, expiresAt };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'bad_request' });
  const auth = req.headers.get('Authorization');
  if (!auth) return reply(401, { error: 'signed_out' });
  try {
    let body: { action?: unknown; invoiceId?: unknown };
    try {
      body = JSON.parse(await req.text());
    } catch {
      throw new Refused(400, 'bad_request');
    }
    const who = await whoIs(auth);
    const db = serviceClient();
    if (body.action === 'connect') return reply(200, await connect(db, who));
    if (body.action === 'status') return reply(200, await status(db, who));
    if (body.action === 'link') return reply(200, await link(db, who, body.invoiceId));
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
