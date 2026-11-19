import type { Lang } from '@/i18n';
import type { SignatureInk } from '@/components/signature-pad';
import type { AlternativeMethod, AlternativeMethods, OnlineCheckout, WalletKind } from '@/lib/invoice-payment';
import type { Totals } from '@/lib/money';

import { callFunction, PayFailed } from './db-pay';
import { db, ok } from './db-client';
import type { JobScope } from './types';

// The customer's invoice page talks only to the pay function, with the link's code.
// No sign-in; nothing here can reach any other invoice or the owner's data.

export interface PayPageLine {
  description: string;
  kind: 'labor' | 'fee' | 'material';
  qtyHundredths: number;
  unitCents: number;
  unit: string | null;
}

export interface PayPage {
  hash: string;
  alternativeMethods: AlternativeMethods;
  acceptance: InvoiceAcceptance | null;
  testMode: boolean;
  /** email and address are empty for businesses that haven't added them (or older servers). */
  business: { name: string; phone: string; email?: string; address?: string };
  customer: { name: string; lang: Lang };
  invoice: {
    number: string;
    issuedOn: string | null;
    dueDays: number;
    address: string;
    workOrder: string | null;
    summary: string;
    materialsMode: 'items' | 'total';
    scope: JobScope | null;
    excludedScope: string[];
    tax: { rateBps: number; labor: boolean; materials: boolean };
    paid: boolean;
    paidAt?: string | null;
  };
  lines: PayPageLine[];
  totals: Totals;
  paid: number;
  pending: number;
  payments?: { amountCents: number; method: string; paidAt: string; status: 'succeeded' }[];
  reservation?: { amountCents: number; method: 'wallet' | 'bank' | 'card' } | null;
  due: number;
  photos: { url: string; tag: 'before' | 'after'; takenAt: string; lat?: number; lng?: number }[];
  /** How the customer can pay online; null when they can't (not set up, paid, or a payment is on its way). */
  pay: OnlineCheckout | null;
  expiresAt: string;
}

export interface InvoiceAcceptance {
  name: string;
  signedAt: string;
  alternativeMethod: AlternativeMethod | null;
  ink: SignatureInk;
}

export async function returnSignedInvoice(token: string, hash: string, name: string, ink: SignatureInk, method: AlternativeMethod | null) {
  const result = await callFunction('pay', { action: 'accept', token, hash, name, ink, method, agreed: true }) as { acceptance?: InvoiceAcceptance };
  if (!result?.acceptance) throw new PayFailed('failed');
  return result.acceptance;
}

export async function loadInvoiceAcceptance(invoiceId: string) {
  const row = ok(await db().from('invoice_acceptances').select('signer_name,signed_at,alternative_method,ink,methods:snapshot->alternativeMethods')
    .eq('invoice_id', invoiceId).maybeSingle<{ signer_name: string; signed_at: string; alternative_method: AlternativeMethod | null;
      ink: SignatureInk; methods: AlternativeMethods }>());
  return row ? { name: row.signer_name, signedAt: row.signed_at, alternativeMethod: row.alternative_method, ink: row.ink,
    alternativeMethods: row.methods } : null;
}

export function loadInvoiceOptions() {
  return callFunction('payments', { action: 'invoiceOptions' }) as Promise<{ wallet: boolean; card: boolean; bank: boolean; testMode: boolean }>;
}

export function loadPayPage(token: string): Promise<PayPage> {
  return callFunction('pay', { action: 'view', token }) as Promise<PayPage>;
}

/** A Stripe payment for what's left on the invoice; the amount is set on the server. */
export async function startPayment(token: string, method: 'wallet' | 'bank' | 'card', amountCents: number, wallet?: WalletKind): Promise<string> {
  const res = await callFunction('pay', { action: 'start', token, method, amountCents, wallet }) as { clientSecret?: unknown; amount?: number };
  if (typeof res?.clientSecret !== 'string' || res.amount !== amountCents) throw new PayFailed('not_ready');
  return res.clientSecret;
}

export function invoiceCheckout(invoiceId: string, cancel = false) {
  return callFunction('payments', { action: cancel ? 'cancelInvoiceCheckout' : 'invoiceCheckout', invoiceId }) as Promise<{ active: boolean; canCancel: boolean }>;
}

/** After paying: asks the server to check with Stripe and save it now, without waiting for Stripe's notice. */
export async function checkPayment(token: string, intent: string): Promise<'succeeded' | 'processing' | 'not_paid'> {
  const res = await callFunction('pay', { action: 'check', token, intent }) as { status?: unknown };
  return res?.status === 'succeeded' || res?.status === 'processing' ? res.status : 'not_paid';
}
