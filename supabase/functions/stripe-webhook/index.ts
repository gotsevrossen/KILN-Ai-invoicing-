import { serviceClient, setting, totalsOf, type LineRow } from '../_shared/invoice.ts';
import { validPaymentProof } from '../_shared/payment-proof.ts';
import { verifyWebhook } from '../_shared/stripe.ts';

// POST /functions/v1/stripe-webhook — Stripe telling KILN a payment changed: on its way (bank
// payments take a few business days), went through, or failed. Only notices signed with KILN's
// webhook secret count. Each one is saved once, whatever order they come in; when the paid total
// reaches the invoice total, the invoice is marked paid and the owner sees it in the app.

interface Intent {
  id: string;
  amount: number;
  amount_received:number;
  currency:string;
  metadata?: { invoice_id?: string; business_id?: string; kiln_method?: string; request_id?: string };
}

const STATUS: Record<string, 'processing' | 'succeeded' | 'failed'> = {
  'payment_intent.processing': 'processing',
  'payment_intent.succeeded': 'succeeded',
  'payment_intent.payment_failed': 'failed',
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('no', { status: 405 });
  const payload = await req.text();
  if (payload.length > 200_000) return new Response('too big', { status: 413 });
  if (!(await verifyWebhook(payload, req.headers.get('Stripe-Signature'), setting('STRIPE_WEBHOOK_SECRET')))) {
    return new Response('bad signature', { status: 400 });
  }

  let event: { type?: string; account?: string; data?: { object?: Intent } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('bad payload', { status: 400 });
  }
  const status = STATUS[event.type ?? ''];
  const intent = event.data?.object;
  // anything else (or a payment KILN didn't start) is acknowledged and ignored
  if (!status || !intent?.metadata?.business_id || (!intent.metadata.invoice_id && !intent.metadata.request_id)) return new Response('ok');
  if (!validPaymentProof(intent,status)) return new Response('invalid payment',{status:400});
  const { invoice_id: invoiceId, business_id: businessId, kiln_method: method } = intent.metadata;
  if ((invoiceId && !uuid.test(invoiceId)) || !uuid.test(businessId)) return new Response('ok');

  const db = serviceClient();
  // the payment must have been made on that business's own Stripe account
  const account = await db.from('stripe_accounts').select('account_id').eq('business_id', businessId).maybeSingle<{ account_id: string }>();
  if (account.error) return new Response('try again', { status: 500 });
  if (!account.data || account.data.account_id !== event.account) return new Response('ok');

  if (intent.metadata.request_id) {
    if (!uuid.test(intent.metadata.request_id)) return new Response('ok');
    const r = await db.from('job_payment_requests').select('business_id,intent_id').eq('id',intent.metadata.request_id).maybeSingle();
    if (r.error) return new Response('try again',{status:500});
    if (!r.data || r.data.business_id!==businessId || (r.data.intent_id && r.data.intent_id!==intent.id)) return new Response('ok');
    // A webhook may arrive between Stripe creating the intent and our durable bind. Retry it.
    if (!r.data.intent_id) return new Response('try again',{status:500});
    const saved=await db.rpc('record_job_payment',{p_id:intent.metadata.request_id,p_intent:intent.id,p_amount:intent.amount,p_method:method,p_status:status});
    return new Response(saved.error?'try again':'ok',{status:saved.error?500:200});
  }
  const [invoice, lines] = await Promise.all([
    db.from('invoices').select('tax_rate_bps, tax_labor, tax_materials').eq('id', invoiceId).eq('business_id', businessId)
      .maybeSingle<{ tax_rate_bps: number | null; tax_labor: boolean | null; tax_materials: boolean | null }>(),
    db.from('invoice_lines').select('description, kind, qty_hundredths, unit_cents, unit, position').eq('invoice_id', invoiceId).returns<LineRow[]>(),
  ]);
  if (invoice.error || lines.error) return new Response('try again', { status: 500 });
  // the job (and its invoice) was deleted: the money is still in Stripe, nothing to attach it to
  if (!invoice.data) return new Response('ok');

  const saved = await db.rpc('record_stripe_payment', {
    p_business: businessId, p_invoice: invoiceId, p_intent: intent.id, p_amount_cents: intent.amount,
    p_method: method === 'bank' ? 'bank' : 'wallet', p_status: status, p_invoice_total: totalsOf(lines.data, invoice.data).total,
  });
  // a failed save asks Stripe to send it again later
  if (saved.error) {
    console.error('stripe-webhook: save failed', saved.error.code);
    return new Response('try again', { status: 500 });
  }
  return new Response('ok');
});
