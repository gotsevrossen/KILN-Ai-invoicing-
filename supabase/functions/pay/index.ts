import type { SupabaseClient } from '@supabase/supabase-js';

import { balance, cors, hashToken, type LineRow, Refused, reply, serviceClient, setting, tokenShape, totalsOf } from '../_shared/invoice.ts';
import { stripe, StripeError } from '../_shared/stripe.ts';

// POST /functions/v1/pay  — the customer's invoice page. No sign-in: the link's code is the key,
// and it opens only that one invoice, until it expires. Actions:
//   { action: 'view', token }                    the invoice, as sent, and how it can be paid
//   { action: 'start', token, method }           a Stripe payment for what's left ('wallet' | 'bank')
//   { action: 'check', token, intent }           after paying: what Stripe says, saved right away
// Never returned: private notes, the customer's phone or email, photo locations (unless the owner
// chose to show them), or anything from another invoice.

const PHOTO_URL_SECONDS = 60 * 60;

interface Link { business_id: string; document_id: string; expires_at: string; opened_at: string | null; id: string }

async function openLink(db: SupabaseClient, token: unknown): Promise<Link> {
  // every way a link can fail looks the same, so a guess learns nothing
  if (!tokenShape(token)) throw new Refused(404, 'not_found');
  const { data } = await db.from('share_links')
    .select('id, business_id, document_id, expires_at, opened_at')
    .eq('token_hash', await hashToken(token)).eq('document_type', 'invoice').is('revoked_at', null)
    .maybeSingle<Link>();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) throw new Refused(404, 'not_found');
  return data;
}

interface InvoiceRow {
  id: string; business_id: string; job_id: string; number: string; summary: string; materials_mode: 'items' | 'total';
  show_location: boolean; sent_at: string | null; paid_at: string | null; tax_rate_bps: number | null; tax_labor: boolean | null;
  tax_materials: boolean | null; issued_scope: Record<string, string> | null; excluded_scope: string[]; due_days: number | null;
  issued_on: string | null; issued_address: string | null; issued_work_order: string | null;
}

async function loadInvoice(db: SupabaseClient, link: Link) {
  const { data: invoice } = await db.from('invoices')
    .select('id, business_id, job_id, number, summary, materials_mode, show_location, sent_at, paid_at, tax_rate_bps, tax_labor, tax_materials, issued_scope, excluded_scope, due_days, issued_on, issued_address, issued_work_order')
    .eq('id', link.document_id).eq('business_id', link.business_id).maybeSingle<InvoiceRow>();
  // a link only ever opens a sent invoice
  if (!invoice?.sent_at) throw new Refused(404, 'not_found');
  const [lines, payments, account] = await Promise.all([
    db.from('invoice_lines').select('description, kind, qty_hundredths, unit_cents, unit, position').eq('invoice_id', invoice.id).order('position').returns<LineRow[]>(),
    db.from('payments').select('amount_cents, status, method').eq('invoice_id', invoice.id).returns<{ amount_cents: number; status: 'processing' | 'succeeded' | 'failed'; method: string }[]>(),
    db.from('stripe_accounts').select('account_id, wallet_ready, bank_ready').eq('business_id', invoice.business_id).maybeSingle<{ account_id: string; wallet_ready: boolean; bank_ready: boolean }>(),
  ]);
  if (lines.error || payments.error || account.error) throw new Error('load failed');
  const totals = totalsOf(lines.data, invoice);
  const money = balance(totals.total, payments.data);
  // paid in cash (marked by the owner) means nothing is left to pay online
  const due = invoice.paid_at ? 0 : money.due;
  return { invoice, lines: lines.data, totals, money: { ...money, due }, account: account.data };
}

async function view(db: SupabaseClient, link: Link) {
  const { invoice, lines, totals, money, account } = await loadInvoice(db, link);
  const [business, job, photos] = await Promise.all([
    db.from('businesses').select('name, phone').eq('id', invoice.business_id).single<{ name: string; phone: string }>(),
    db.from('jobs').select('customer_id').eq('id', invoice.job_id).single<{ customer_id: string }>(),
    db.from('photos').select('storage_path, tag, lat, lng, taken_at').eq('job_id', invoice.job_id).in('tag', ['before', 'after']).order('taken_at')
      .returns<{ storage_path: string; tag: 'before' | 'after'; lat: number | null; lng: number | null; taken_at: string }[]>(),
  ]);
  if (business.error || job.error || photos.error) throw new Error('load failed');
  const customer = await db.from('customers').select('name, lang').eq('id', job.data.customer_id).single<{ name: string; lang: 'en' | 'es' }>();
  if (customer.error) throw new Error('load failed');

  const shown = photos.data.slice(0, 12);
  const signed = shown.length
    ? await db.storage.from('job-photos').createSignedUrls(shown.map((p) => p.storage_path), PHOTO_URL_SECONDS)
    : { data: [], error: null };
  if (signed.error) throw new Error('load failed');

  // the first time it's opened, the owner sees it in the app
  if (!link.opened_at) {
    await db.from('share_links').update({ opened_at: new Date().toISOString() }).eq('id', link.id);
    await db.from('audit_log').insert({ business_id: invoice.business_id, actor: null, action: 'invoice.opened', entity: 'invoice', entity_id: invoice.id });
  }

  const publishableKey = setting('STRIPE_PUBLISHABLE_KEY');
  const payable = !!account && (account.wallet_ready || account.bank_ready) && !!publishableKey && money.due > 0 && money.pending === 0;
  return {
    business: { name: business.data.name, phone: business.data.phone },
    customer: { name: customer.data.name, lang: customer.data.lang },
    invoice: {
      number: invoice.number, issuedOn: invoice.issued_on, dueDays: invoice.due_days ?? 0, address: invoice.issued_address ?? '',
      workOrder: invoice.issued_work_order, summary: invoice.summary, materialsMode: invoice.materials_mode,
      scope: invoice.issued_scope, excludedScope: invoice.excluded_scope,
      tax: { rateBps: invoice.tax_rate_bps ?? 0, labor: !!invoice.tax_labor, materials: !!invoice.tax_materials },
      paid: !!invoice.paid_at,
    },
    lines: lines.map((l) => ({ description: l.description, kind: l.kind, qtyHundredths: l.qty_hundredths, unitCents: l.unit_cents, unit: l.unit })),
    totals, ...money,
    photos: shown.map((p, i) => ({
      url: signed.data[i]?.signedUrl ?? null, tag: p.tag, takenAt: p.taken_at,
      ...(invoice.show_location && p.lat !== null ? { lat: p.lat, lng: p.lng } : {}),
    })).filter((p) => p.url),
    pay: payable && account ? { wallet: account.wallet_ready, bank: account.bank_ready, account: account.account_id, publishableKey } : null,
    expiresAt: link.expires_at,
  };
}

async function start(db: SupabaseClient, link: Link, method: unknown) {
  if (method !== 'wallet' && method !== 'bank') throw new Refused(400, 'bad_request');
  const key = setting('STRIPE_SECRET_KEY');
  if (!key) throw new Refused(503, 'not_set_up');
  const { invoice, money, account } = await loadInvoice(db, link);
  if (!account || !(method === 'wallet' ? account.wallet_ready : account.bank_ready)) throw new Refused(409, 'not_ready');
  // one payment at a time: a bank payment on its way blocks a second one
  if (money.due <= 0 || money.pending > 0) throw new Refused(409, 'nothing_due');

  const intent = await stripe<{ id: string; client_secret: string }>(key, {
    method: 'POST', path: '/v1/payment_intents', account: account.account_id,
    body: {
      amount: money.due,
      currency: 'usd',
      // Apple Pay and Google Pay are paid through the card network; the page shows only those buttons
      payment_method_types: [method === 'wallet' ? 'card' : 'us_bank_account'],
      description: `Invoice #${invoice.number}`.slice(0, 100),
      metadata: { invoice_id: invoice.id, business_id: invoice.business_id, kiln_method: method },
      ...(method === 'bank' ? { payment_method_options: { us_bank_account: { financial_connections: { permissions: ['payment_method'] } } } } : {}),
    },
  });
  return { clientSecret: intent.client_secret, amount: money.due };
}

async function check(db: SupabaseClient, link: Link, intentId: unknown) {
  if (typeof intentId !== 'string' || !/^pi_[A-Za-z0-9]{8,64}$/.test(intentId)) throw new Refused(400, 'bad_request');
  const key = setting('STRIPE_SECRET_KEY');
  if (!key) throw new Refused(503, 'not_set_up');
  const { invoice, totals, account } = await loadInvoice(db, link);
  if (!account) throw new Refused(409, 'not_ready');
  const intent = await stripe<{ id: string; status: string; amount_received: number; amount: number; metadata: Record<string, string> }>(key, {
    method: 'GET', path: `/v1/payment_intents/${intentId}`, account: account.account_id,
  });
  // only a payment made for this invoice counts
  if (intent.metadata?.invoice_id !== invoice.id) throw new Refused(404, 'not_found');
  const status = intent.status === 'succeeded' ? 'succeeded' : intent.status === 'processing' ? 'processing' : null;
  if (status) {
    const saved = await db.rpc('record_stripe_payment', {
      p_business: invoice.business_id, p_invoice: invoice.id, p_intent: intent.id, p_amount_cents: intent.amount,
      p_method: intent.metadata.kiln_method === 'bank' ? 'bank' : 'wallet', p_status: status, p_invoice_total: totals.total,
    });
    if (saved.error) throw new Error('save failed');
  }
  return { status: status ?? 'not_paid' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'bad_request' });
  try {
    const raw = await req.text();
    if (raw.length > 2000) throw new Refused(413, 'bad_request');
    let body: { action?: unknown; token?: unknown; method?: unknown; intent?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Refused(400, 'bad_request');
    }
    const db = serviceClient();
    const link = await openLink(db, body.token);
    if (body.action === 'view') return reply(200, await view(db, link));
    if (body.action === 'start') return reply(200, await start(db, link, body.method));
    if (body.action === 'check') return reply(200, await check(db, link, body.intent));
    throw new Refused(400, 'bad_request');
  } catch (e) {
    if (e instanceof Refused) return reply(e.status, { error: e.code });
    if (e instanceof StripeError) {
      console.error(`pay: Stripe said ${e.status} ${e.code}`);
      return reply(502, { error: 'stripe_failed' });
    }
    console.error('pay: unexpected error', e instanceof Error ? e.message : typeof e);
    return reply(500, { error: 'failed' });
  }
});
