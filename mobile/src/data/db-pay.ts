import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

import { db, ok } from './db-client';

// Getting paid online. The phone never talks to Stripe: KILN's server functions do
// (supabase/functions/payments for the owner, pay for the customer's page), and Stripe's
// notices land in the database. The app reads the results like any other saved data.

export type PayErrorCode = 'not_set_up' | 'not_sent' | 'owner_only' | 'stripe_failed' | 'signed_out' | 'not_found' | 'nothing_due' | 'not_ready' | 'offline' | 'failed';

export class PayFailed extends Error {
  constructor(readonly code: PayErrorCode) {
    super(code);
  }
}

const CODES: PayErrorCode[] = ['not_set_up', 'not_sent', 'owner_only', 'stripe_failed', 'signed_out', 'not_found', 'nothing_due', 'not_ready'];

export async function callFunction(name: 'payments' | 'pay', body: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new PayFailed('not_set_up');
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const res = await (error.context as Response).json().catch(() => null) as { error?: string } | null;
    const code = CODES.find((c) => c === res?.error);
    throw new PayFailed(code ?? 'failed');
  }
  throw new PayFailed('offline');
}

/** A private link that opens this one sent invoice for the customer. */
export async function invoiceLink(invoiceId: string): Promise<string> {
  const res = await callFunction('payments', { action: 'link', invoiceId }) as { url?: unknown };
  if (typeof res?.url !== 'string' || !/^https?:\/\//.test(res.url)) throw new PayFailed('failed');
  return res.url;
}

/** Stripe's own page where the owner sets up (or finishes setting up) their Stripe account. */
export async function stripeSetupUrl(): Promise<string> {
  const res = await callFunction('payments', { action: 'connect' }) as { url?: unknown };
  if (typeof res?.url !== 'string' || !res.url.startsWith('https://')) throw new PayFailed('failed');
  return res.url;
}

export interface OnlinePay {
  connected: boolean;
  /** Apple Pay and Google Pay. */
  walletReady: boolean;
  bankReady: boolean;
}

/** Asks Stripe (through the server) what the owner's account can take now. */
export async function checkStripe(): Promise<OnlinePay> {
  const res = await callFunction('payments', { action: 'status' }) as Partial<OnlinePay>;
  return { connected: !!res?.connected, walletReady: !!res?.walletReady, bankReady: !!res?.bankReady };
}

export type PaymentMethod = 'wallet' | 'bank' | 'card' | 'cash' | 'check' | 'other';

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  amountCents: number;
  method: PaymentMethod;
  status: 'processing' | 'succeeded' | 'failed';
  paidAt: string;
}

export interface PayState {
  payments: PaymentRecord[];
  /** When the customer first opened each invoice's link. */
  opened: Record<string, string>;
  paidInvoices: string[];
  online: OnlinePay;
}

/** Payments, opened links, and paid invoices as saved on the server (row rules limit it to this business). */
export async function loadPayState(): Promise<PayState> {
  const [payments, links, invoices, account] = await Promise.all([
    db().from('payments').select('id, invoice_id, amount_cents, method, status, paid_at').not('invoice_id', 'is', null).order('paid_at')
      .returns<{ id: string; invoice_id: string; amount_cents: number; method: PaymentMethod; status: PaymentRecord['status']; paid_at: string }[]>(),
    db().from('share_links').select('document_id, opened_at').eq('document_type', 'invoice').not('opened_at', 'is', null)
      .returns<{ document_id: string; opened_at: string }[]>(),
    db().from('invoices').select('id').not('paid_at', 'is', null).returns<{ id: string }[]>(),
    db().from('stripe_accounts').select('wallet_ready, bank_ready').maybeSingle<{ wallet_ready: boolean; bank_ready: boolean }>(),
  ]);
  const opened: Record<string, string> = {};
  for (const l of ok(links) ?? []) if (!opened[l.document_id] || l.opened_at < opened[l.document_id]) opened[l.document_id] = l.opened_at;
  const acct = ok(account);
  return {
    payments: (ok(payments) ?? []).map((p) => ({ id: p.id, invoiceId: p.invoice_id, amountCents: p.amount_cents, method: p.method, status: p.status, paidAt: p.paid_at })),
    opened,
    paidInvoices: (ok(invoices) ?? []).map((i) => i.id),
    online: { connected: !!acct, walletReady: !!acct?.wallet_ready, bankReady: !!acct?.bank_ready },
  };
}
