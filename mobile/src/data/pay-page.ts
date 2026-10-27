import type { Lang } from '@/i18n';
import type { Totals } from '@/lib/money';

import { callFunction, PayFailed } from './db-pay';
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
  business: { name: string; phone: string };
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
  };
  lines: PayPageLine[];
  totals: Totals;
  paid: number;
  pending: number;
  due: number;
  photos: { url: string; tag: 'before' | 'after'; takenAt: string; lat?: number; lng?: number }[];
  /** How the customer can pay online; null when they can't (not set up, paid, or a payment is on its way). */
  pay: { wallet: boolean; bank: boolean; account: string; publishableKey: string } | null;
  expiresAt: string;
}

export function loadPayPage(token: string): Promise<PayPage> {
  return callFunction('pay', { action: 'view', token }) as Promise<PayPage>;
}

/** A Stripe payment for what's left on the invoice; the amount is set on the server. */
export async function startPayment(token: string, method: 'wallet' | 'bank'): Promise<string> {
  const res = await callFunction('pay', { action: 'start', token, method }) as { clientSecret?: unknown };
  if (typeof res?.clientSecret !== 'string') throw new PayFailed('failed');
  return res.clientSecret;
}

/** After paying: asks the server to check with Stripe and save it now, without waiting for Stripe's notice. */
export async function checkPayment(token: string, intent: string): Promise<'succeeded' | 'processing' | 'not_paid'> {
  const res = await callFunction('pay', { action: 'check', token, intent }) as { status?: unknown };
  return res?.status === 'succeeded' || res?.status === 'processing' ? res.status : 'not_paid';
}
