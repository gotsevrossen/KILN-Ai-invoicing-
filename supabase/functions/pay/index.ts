import { BodyTooLarge, InvalidBody, readObject } from '../_shared/request.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

import { balance, cors, hashToken, type LineRow, Refused, reply, serviceClient, setting, tokenShape, totalsOf } from '../_shared/invoice.ts';
import { jobRequestAction, requestByToken } from '../_shared/job-payments.ts';
import { validPaymentProof } from '../_shared/payment-proof.ts';
import { invoiceOnlineOptions, isWalletKind, merchantCapabilities, stripe, stripeAccountColumns, stripeCheckoutEnabled,
  StripeError, stripeTestMode, walletAvailable, type StripeAccount } from '../_shared/stripe.ts';

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
  proof_photo_ids: string[] | null;
  id: string; business_id: string; job_id: string; number: string; summary: string; materials_mode: 'items' | 'total';
  show_location: boolean; sent_at: string | null; paid_at: string | null; tax_rate_bps: number | null; tax_labor: boolean | null;
  tax_materials: boolean | null; issued_scope: Record<string, string> | null; excluded_scope: string[]; due_days: number | null;
  issued_on: string | null; issued_address: string | null; issued_work_order: string | null;
}

async function loadInvoice(db: SupabaseClient, link: Link) {
  const { data: invoice } = await db.from('invoices')
    .select('id, business_id, job_id, number, summary, materials_mode, show_location, sent_at, paid_at, tax_rate_bps, tax_labor, tax_materials, issued_scope, excluded_scope, due_days, issued_on, issued_address, issued_work_order, proof_photo_ids')
    .eq('id', link.document_id).eq('business_id', link.business_id).maybeSingle<InvoiceRow>();
  // a link only ever opens a sent invoice
  if (!invoice?.sent_at) throw new Refused(404, 'not_found');
  const [lines, payments, account, reservation] = await Promise.all([
    db.from('invoice_lines').select('description, kind, qty_hundredths, unit_cents, unit, position').eq('invoice_id', invoice.id).order('position').returns<LineRow[]>(),
    db.from('payments').select('amount_cents,status,method,alternative_method,paid_at,stripe_adjustment_kind').eq('job_id', invoice.job_id).order('paid_at')
      .returns<{ amount_cents: number; status: 'processing' | 'succeeded' | 'failed'; method: string; alternative_method: string | null; paid_at: string; stripe_adjustment_kind: string | null }[]>(),
    db.from('stripe_accounts').select(stripeAccountColumns)
      .eq('business_id', invoice.business_id).eq('test_mode', stripeTestMode())
      .maybeSingle<StripeAccount>(),
    db.from('invoice_payment_reservations').select('collection_method,collection_cents').eq('invoice_id', invoice.id)
      .maybeSingle<{ collection_method: 'wallet' | 'bank' | 'card'; collection_cents: number }>(),
  ]);
  if (lines.error || payments.error || account.error || reservation.error) throw new Error('load failed');
  const totals = totalsOf(lines.data, invoice);
  const advances = await db.from('job_payment_requests').select('id,amount_cents,intent_id,intent_method').eq('job_id', invoice.job_id).not('intent_method', 'is', null);
  if (advances.error) throw new Error('load failed');
  const settled = await db.from('payments').select('request_id,status').eq('job_id', invoice.job_id);
  if (settled.error) throw new Error('load failed');
  const unresolved = (advances.data ?? []).filter(r => !(settled.data ?? []).some(p => p.request_id === r.id && (p.status === 'succeeded' || p.status === 'processing'))).reduce((sum,r)=>sum+r.amount_cents,0);
  const money = balance(totals.total, payments.data);
  money.pending += unresolved;
  money.due = Math.max(0, money.due - unresolved);
  // paid in cash (marked by the owner) means nothing is left to pay online
  const due = invoice.paid_at ? 0 : money.due;
  const connected = account.data;
  const online = invoiceOnlineOptions(connected);
  return { invoice, lines: lines.data, totals, money: { ...money, due }, account: connected, online, payments: payments.data, reservation: reservation.data };
}

async function view(db: SupabaseClient, link: Link) {
  const { invoice, lines, totals, money, online, payments, reservation } = await loadInvoice(db, link);
  const [business, job, photos, terms] = await Promise.all([
    db.from('businesses').select('name, phone, email, address').eq('id', invoice.business_id).single<{ name: string; phone: string; email: string | null; address: string | null }>(),
    db.from('jobs').select('customer_id').eq('id', invoice.job_id).single<{ customer_id: string }>(),
    db.from('photos').select('id, storage_path, tag, lat, lng, taken_at').eq('job_id', invoice.job_id).in('tag', ['before', 'after']).order('taken_at').order('id')
      .returns<{ id: string; storage_path: string; tag: 'before' | 'after'; lat: number | null; lng: number | null; taken_at: string }[]>(),
    db.rpc('invoice_acceptance_view', { p_invoice: invoice.id }),
  ]);
  if (business.error || job.error || photos.error || terms.error || !terms.data) throw new Error('load failed');
  const customer = await db.from('customers').select('name, lang').eq('id', job.data.customer_id).single<{ name: string; lang: 'en' | 'es' }>();
  if (customer.error) throw new Error('load failed');

  const byId = new Map(photos.data.map((photo) => [photo.id, photo]));
  const shown = invoice.proof_photo_ids?.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []) ?? photos.data.slice(0, 12);
  const secondsLeft = Math.floor((Date.parse(link.expires_at) - Date.now()) / 1000);
  if (secondsLeft <= 0) throw new Refused(404, 'not_found');
  const signed = shown.length
    ? await db.storage.from('job-photos').createSignedUrls(shown.map((p) => p.storage_path), Math.min(PHOTO_URL_SECONDS, secondsLeft))
    : { data: [], error: null };
  if (signed.error) throw new Error('load failed');

  // the first time it's opened, the owner sees it in the app
  if (!link.opened_at) {
    const opened = await db.from('share_links').update({ opened_at: new Date().toISOString() })
      .eq('id', link.id).is('opened_at', null);
    if (opened.error) throw new Error('invoice view recording failed');
  }

  const walletAvailableForInvoice = !reservation || reservation.collection_method === 'wallet';
  return {
    ...terms.data,
    testMode: stripeTestMode(),
    business: { name: business.data.name, phone: business.data.phone, email: business.data.email ?? '', address: business.data.address ?? '' },
    customer: { name: customer.data.name, lang: customer.data.lang },
    invoice: {
      number: invoice.number, issuedOn: invoice.issued_on, dueDays: invoice.due_days ?? 0, address: invoice.issued_address ?? '',
      workOrder: invoice.issued_work_order, summary: invoice.summary, materialsMode: invoice.materials_mode,
      scope: invoice.issued_scope, excludedScope: invoice.excluded_scope,
      tax: { rateBps: invoice.tax_rate_bps ?? 0, labor: !!invoice.tax_labor, materials: !!invoice.tax_materials },
      paid: !!invoice.paid_at,
      paidAt: invoice.paid_at,
    },
    lines: lines.map((l) => ({ description: l.description, kind: l.kind, qtyHundredths: l.qty_hundredths, unitCents: l.unit_cents, unit: l.unit })),
    totals, ...money,
    payments: payments.filter((payment) => payment.status === 'succeeded').map((payment) => ({
      amountCents: payment.amount_cents, method: payment.stripe_adjustment_kind ?? payment.alternative_method ?? payment.method, paidAt: payment.paid_at, status: payment.status,
    })),
    photos: shown.map((p, i) => ({
      url: signed.data[i]?.signedUrl ?? null, tag: p.tag, takenAt: p.taken_at,
      ...(invoice.show_location && p.lat !== null ? { lat: p.lat, lng: p.lng } : {}),
    })).filter((p) => p.url),
    reservation: reservation ? { amountCents: reservation.collection_cents, method: reservation.collection_method } : null,
    pay: online && money.due > 0 && money.pending === 0 ? { ...online,
      wallet: online.wallet && walletAvailableForInvoice,
      applePay: online.applePay && walletAvailableForInvoice,
      googlePay: online.googlePay && walletAvailableForInvoice,
      card: online.card && (!reservation || reservation.collection_method === 'card'),
      bank: online.bank && (!reservation || reservation.collection_method === 'bank'),
    } : null,
    expiresAt: link.expires_at,
  };
}

async function start(db: SupabaseClient, link: Link, method: unknown, requested: unknown, wallet: unknown) {
  if (method !== 'wallet' && method !== 'bank' && method !== 'card') throw new Refused(400, 'bad_request');
  if (wallet !== undefined && (method !== 'wallet' || !isWalletKind(wallet))) throw new Refused(400, 'bad_request');
  if (requested !== undefined && (!Number.isSafeInteger(requested) || (requested as number) < 50)) throw new Refused(400, 'bad_request');
  const key = setting('STRIPE_SECRET_KEY');
  if (!stripeCheckoutEnabled()) throw new Refused(503, 'not_set_up');
  const { invoice, money, account, online } = await loadInvoice(db, link);
  if (!account || !online?.[method]) throw new Refused(409, 'not_ready');
  // one payment at a time: a bank payment on its way blocks a second one
  if (money.due <= 0 || money.pending > 0) throw new Refused(409, 'nothing_due');
  const capabilities = await merchantCapabilities(key, account.account_id);
  if (!(method === 'bank' ? capabilities.bank : capabilities.card) || (!stripeTestMode() && !capabilities.payouts)) {
    throw new Refused(409, 'not_ready');
  }
  if (method === 'wallet' && !(await walletAvailable(key, account.account_id, isWalletKind(wallet) ? wallet : undefined))) {
    throw new Refused(409, 'not_ready');
  }

  if ((requested ?? money.due) as number < 50) throw new Refused(409, 'not_ready');
  const reservation = await db.rpc('reserve_invoice_checkout', { p_invoice: invoice.id, p_method: method, p_amount_cents: requested ?? null });
  const saved = reservation.data as { amount: number; intent_id: string | null; created_at: string; attempt_key: string | null } | null;
  if (reservation.error || !saved || !Number.isSafeInteger(saved.amount) || saved.amount < 50) throw new Refused(409, 'nothing_due');
  const { amount } = saved;
  if (saved.intent_id) {
    const existing = await stripe<{id:string;client_secret:string;amount:number;currency:string;metadata:Record<string,string>}>(key,{method:'GET',path:`/v1/payment_intents/${saved.intent_id}`,account:account.account_id});
    if(existing.metadata?.invoice_id!==invoice.id || existing.metadata.business_id!==invoice.business_id || existing.metadata.kiln_method!==method || existing.amount!==amount || existing.currency!=='usd') throw new Refused(409,'not_ready');
    return {clientSecret:existing.client_secret,amount};
  }
  if(Date.now()-Date.parse(saved.created_at)>23*60*60*1000) throw new Refused(409,'not_ready');
  const intent = await stripe<{ id: string; client_secret: string }>(key, {
    method: 'POST', path: '/v1/payment_intents', account: account.account_id,
    idempotencyKey: `kiln-invoice-allowed-methods-${invoice.id}${saved.attempt_key ? `-${saved.attempt_key}` : ''}`,
    body: {
      amount,
      currency: 'usd',
      allowed_payment_method_types: [method === 'bank' ? 'us_bank_account' : 'card'],
      description: `Invoice #${invoice.number}`.slice(0, 100),
      metadata: { invoice_id: invoice.id, business_id: invoice.business_id, kiln_method: method },
      ...(method === 'bank' ? { payment_method_options: { us_bank_account: { financial_connections: { permissions: ['payment_method'] } } } } : {}),
    },
  });
  const bind = db.from('invoice_payment_reservations').update({intent_id:intent.id}).eq('invoice_id',invoice.id);
  const bound = await (saved.attempt_key ? bind.eq('attempt_key', saved.attempt_key) : bind.is('attempt_key', null)).select('invoice_id').maybeSingle();
  if(bound.error || !bound.data) throw new Error('save failed');
  return { clientSecret: intent.client_secret, amount };
}

async function check(db: SupabaseClient, link: Link, intentId: unknown) {
  if (typeof intentId !== 'string' || !/^pi_[A-Za-z0-9]{8,64}$/.test(intentId)) throw new Refused(400, 'bad_request');
  const key = setting('STRIPE_SECRET_KEY');
  if (!stripeCheckoutEnabled()) throw new Refused(503, 'not_set_up');
  const { invoice, totals, account } = await loadInvoice(db, link);
  if (!account) throw new Refused(409, 'not_ready');
  const intent = await stripe<{ id: string; status: string; amount_received: number; amount: number; currency:string; metadata: Record<string, string> }>(key, {
    method: 'GET', path: `/v1/payment_intents/${intentId}`, account: account.account_id,
  });
  // only a payment made for this invoice counts
  if (intent.metadata?.invoice_id !== invoice.id || intent.metadata.business_id !== invoice.business_id || intent.currency !== 'usd') throw new Refused(404, 'not_found');
  const method = intent.metadata.kiln_method;
  if (method !== 'wallet' && method !== 'bank' && method !== 'card') throw new Refused(404, 'not_found');
  const status = intent.status === 'succeeded' ? 'succeeded' : intent.status === 'processing' ? 'processing' : null;
  if (status && !validPaymentProof(intent,status)) throw new Refused(409,'not_ready');
  if (status) {
    const saved = await db.rpc('record_stripe_payment', {
      p_business: invoice.business_id, p_invoice: invoice.id, p_intent: intent.id, p_amount_cents: intent.amount,
      p_method: method, p_status: status, p_invoice_total: totals.total,
    });
    if (saved.error) throw new Error('save failed');
  }
  return { status: status ?? 'not_paid' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'bad_request' });
  try {
    const body = await readObject(req, 145_000);
    const db = serviceClient();
    const request = await requestByToken(db, body.token);
    if (request) return reply(200, await jobRequestAction(db, request, body));
    const link = await openLink(db, body.token);
    if (body.action === 'view') return reply(200, await view(db, link));
    if (body.action === 'start') return reply(200, await start(db, link, body.method, body.amountCents, body.wallet));
    if (body.action === 'check') return reply(200, await check(db, link, body.intent));
    if (body.action === 'accept') {
      if (!tokenShape(body.token) || body.agreed !== true || typeof body.name !== 'string' || body.name.length > 120 ||
        typeof body.hash !== 'string' || !/^[0-9a-f]{64}$/.test(body.hash) || !Array.isArray(body.ink) ||
        (body.method !== null && typeof body.method !== 'string')) throw new Refused(400, 'bad_request');
      const result = await db.rpc('accept_invoice_link', { p_hash: await hashToken(body.token), p_snapshot_hash: body.hash,
        p_name: body.name, p_ink: body.ink, p_method: body.method });
      if (result.error) throw new Refused(409, 'not_ready');
      return reply(200, result.data);
    }
    throw new Refused(400, 'bad_request');
  } catch (e) {
    if (e instanceof BodyTooLarge) return reply(413, { error: 'bad_request' });
    if (e instanceof InvalidBody) return reply(400, { error: 'bad_request' });
    if (e instanceof Refused) return reply(e.status, { error: e.code });
    if (e instanceof StripeError) {
      console.error(`pay: Stripe said ${e.status} ${e.code}`);
      return reply(502, { error: 'stripe_failed' });
    }
    console.error('pay: unexpected error', e instanceof Error ? e.message : typeof e);
    return reply(500, { error: 'failed' });
  }
});
