import { serviceClient, setting, totalsOf, type LineRow } from '../_shared/invoice.ts';
import { verifyWebhook } from '../_shared/stripe.ts';

// POST /functions/v1/stripe-webhook — Stripe telling KILN a payment changed: on its way (bank
// payments take a few business days), went through, or failed. Only notices signed with KILN's
// webhook secret count. Each one is saved once, whatever order they come in; when the paid total
// reaches the invoice total, the invoice is marked paid and the owner sees it in the app.

interface Intent {
  id: string;
  amount: number;
  metadata?: { invoice_id?: string; business_id?: string; kiln_method?: string };
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
  if (!status || !intent?.metadata?.invoice_id || !intent.metadata.business_id) return new Response('ok');
  const { invoice_id: invoiceId, business_id: businessId, kiln_method: method } = intent.metadata;
  if (!uuid.test(invoiceId) || !uuid.test(businessId)) return new Response('ok');

  const db = serviceClient();
  // the payment must have been made on that business's own Stripe account
  const account = await db.from('stripe_accounts').select('account_id').eq('business_id', businessId).maybeSingle<{ account_id: string }>();
  if (account.error) return new Response('try again', { status: 500 });
  if (!account.data || account.data.account_id !== event.account) return new Response('ok');

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
