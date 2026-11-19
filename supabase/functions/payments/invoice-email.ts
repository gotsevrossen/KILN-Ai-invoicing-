import type { SupabaseClient } from '@supabase/supabase-js';

import { Refused, setting } from '../_shared/invoice.ts';

const resend = 'https://api.resend.com/emails';
const emailAddress = /^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Status = 'sending' | 'accepted' | 'delivered' | 'delayed' | 'failed' | 'unknown';
type Attempt = { id: string; provider_id: string | null; status: Status; created_at: string };

export function deliveryStatus(event: unknown): Status | undefined {
  switch (event) {
    case 'sent': return 'accepted';
    case 'delivered': case 'opened': case 'clicked': return 'delivered';
    case 'delivery_delayed': return 'delayed';
    case 'bounced': case 'suppressed': case 'failed': case 'complained': case 'canceled': return 'failed';
    default: return undefined;
  }
}

export async function invoiceEmail(
  db: SupabaseClient, businessId: string, invoiceId: unknown, send: { attemptId: unknown; recipient: unknown; reminder?: boolean } | null,
  makeLink: (invoiceId: string) => Promise<string>,
) {
  if (typeof invoiceId !== 'string' || !uuid.test(invoiceId)) throw new Refused(400, 'bad_request');
  const invoice = await db.from('invoices').select('number,sent_at,paid_at,job_id,jobs(customers(email,lang)),businesses(name,email)')
    .eq('id', invoiceId).eq('business_id', businessId).maybeSingle<{
      number: string; sent_at: string | null; paid_at: string | null; job_id: string; jobs: { customers: { email: string | null; lang: string } | null } | null;
      businesses: { name: string; email: string | null } | null;
    }>();
  if (invoice.error) throw new Error('invoice lookup failed');
  if (!invoice.data) throw new Refused(404, 'not_found');
  if (!invoice.data.sent_at) throw new Refused(409, 'not_sent');

  const attempts = () => db.from('invoice_email_deliveries');
  const key = setting('KILN_RESEND_API_KEY');
  const headers = { Authorization: `Bearer ${key}` };
  const readStatus = async (attemptId?: string) => {
    let query = attempts().select('id,provider_id,status,created_at').eq('invoice_id', invoiceId);
    if (attemptId) query = query.eq('id', attemptId);
    const result = await query.order('created_at', { ascending: false }).limit(1).maybeSingle<Attempt>();
    if (result.error) throw new Error('email status lookup failed');
    const row = result.data;
    if (!row) return { status: null };
    const aged = Date.now() - Date.parse(row.created_at) > 60_000;
    if (row.status === 'sending' && aged) return { status: 'unknown' as const };
    if (!row.provider_id || row.status === 'delivered' || row.status === 'failed') return { status: row.status };
    if (!key) return { status: row.status, stale: true };
    const response = await fetch(`${resend}/${row.provider_id}`, { headers, signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!response?.ok) return { status: row.status, stale: true };
    const body = await response.json().catch(() => null) as { last_event?: string } | null;
    const next = deliveryStatus(body?.last_event);
    if (!next || next === row.status) return { status: row.status };
    const updated = await attempts().update({ status: next }).eq('id', row.id).eq('status', row.status).select('status').maybeSingle();
    if (updated.error) throw new Error('email status save failed');
    return { status: updated.data ? next : row.status, stale: !updated.data };
  };
  if (!send) return readStatus();

  if (typeof send.attemptId !== 'string' || !uuid.test(send.attemptId)) throw new Refused(400, 'bad_request');
  const attemptId = send.attemptId;
  const from = setting('KILN_INVOICE_FROM_EMAIL');
  if (!key || !from) throw new Refused(503, 'email_not_set_up');
  if (!/^https:\/\/[^/\s]+$/.test(setting('KILN_PAY_URL'))) throw new Refused(503, 'not_set_up');
  const customer = invoice.data.jobs?.customers;
  if (!customer?.email || customer.email !== send.recipient || customer.email.length > 254 || !emailAddress.test(customer.email)) {
    throw new Refused(409, 'email_changed');
  }
  if (send.reminder) {
    const [total, payments] = await Promise.all([
      db.rpc('invoice_total_cents', { p_invoice: invoiceId }),
      db.from('payments').select('amount_cents,status').eq('job_id', invoice.data.job_id).in('status', ['succeeded', 'processing']),
    ]);
    if (total.error || payments.error) throw new Error('invoice balance lookup failed');
    if (invoice.data.paid_at || payments.data.some((payment) => payment.status === 'processing') ||
      Number(total.data) <= payments.data.reduce((sum, payment) => sum + Number(payment.amount_cents), 0)) throw new Refused(409, 'nothing_due');
  }
  const reservation = await db.rpc('reserve_invoice_email', { p_invoice: invoiceId, p_attempt: attemptId });
  if (reservation.error?.code === 'PT429') throw new Refused(429, 'email_wait');
  if (reservation.error) throw new Error('email reservation failed');
  if (!reservation.data) return readStatus(attemptId);

  let status: Status = 'failed';
  let providerId: string | null = null;
  try {
    const url = await makeLink(invoiceId);
    const es = customer.lang === 'es';
    const business = (invoice.data.businesses?.name || 'KILN').replace(/[\r\n]/g, ' ');
    const number = String(invoice.data.number).replace(/[\r\n]/g, ' ');
    const subject = send.reminder ? (es ? `Recordatorio de pago de ${business} · ${number}` : `Payment reminder from ${business} · ${number}`)
      : es ? `Factura ${number} de ${business}` : `Invoice ${number} from ${business}`;
    const text = send.reminder ? (es ? `Consulta el saldo de tu factura de ${business}:\n\n${url}` : `Review your invoice balance from ${business}:\n\n${url}`)
      : es ? `Consulta tu factura de ${business}:\n\n${url}` : `View your invoice from ${business}:\n\n${url}`;
    const sender = (/<([^<>]+)>$/.exec(from)?.[1] ?? from).trim();
    const displayName = business.replace(/[<>",;\\]/g, '').trim() || 'KILN';
    const replyTo = invoice.data.businesses?.email;
    status = 'unknown';
    const response = await fetch(resend, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': `invoice/${attemptId}` },
      body: JSON.stringify({
        from: `${displayName} (via KILN) <${sender}>`, to: [customer.email], subject, text,
        ...(replyTo && emailAddress.test(replyTo) ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const result = await response.json() as { id?: unknown };
      if (typeof result.id === 'string' && uuid.test(result.id)) { providerId = result.id; status = 'accepted'; }
    } else if (response.status < 500 && response.status !== 408) status = 'failed';
  } catch {
    // A response lost after handing off the request may still result in an email.
  }
  const saved = await attempts().update({ provider_id: providerId, status }).eq('id', attemptId).eq('invoice_id', invoiceId);
  if (saved.error) throw new Error('email result save failed');
  return { status };
}
