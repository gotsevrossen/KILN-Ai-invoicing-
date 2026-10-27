import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { documentTotals, type LineKind, type Totals } from './money.ts';

// Shared by the pay page, the owner's payment requests, and Stripe's notices: who's asking,
// the link's code, and what an invoice adds up to, always from the sent copy saved on the server.

/** Full access, for the server only (never sent anywhere). Each function checks who may see what. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * A server setting, or '' when it isn't set. Locally, a setting listed in config.toml but missing
 * from supabase/.env arrives as the literal text "env(NAME)", which counts as not set.
 */
export function setting(name: string): string {
  const value = Deno.env.get(name) ?? '';
  return value.startsWith('env(') ? '' : value;
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export class Refused extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

// ---------------------------------------------------------------- customer link codes

/** 32 random bytes as URL-safe text: impossible to guess. Only its hash is stored. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A code from a link looks like newToken()'s output; anything else is refused before any lookup. */
export function tokenShape(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

// ---------------------------------------------------------------- invoice totals

export interface LineRow {
  description: string;
  kind: LineKind;
  qty_hundredths: number;
  unit_cents: number;
  unit: string | null;
  position: number;
}

export interface TaxRow {
  tax_rate_bps: number | null;
  tax_labor: boolean | null;
  tax_materials: boolean | null;
}

/** The invoice's totals, exactly as the app works them out (same money code). */
export function totalsOf(lines: LineRow[], tax: TaxRow): Totals {
  return documentTotals(
    lines.map((l) => ({ kind: l.kind, qtyHundredths: l.qty_hundredths, unitCents: l.unit_cents })),
    { rateBps: tax.tax_rate_bps ?? 0, labor: !!tax.tax_labor, materials: !!tax.tax_materials },
  );
}

export interface PaymentRow {
  amount_cents: number;
  status: 'processing' | 'succeeded' | 'failed';
}

/** Paid, on its way (a bank payment takes a few days), and what's left to pay. */
export function balance(totalCents: number, payments: PaymentRow[]) {
  const sum = (status: PaymentRow['status']) => payments.filter((p) => p.status === status).reduce((a, p) => a + p.amount_cents, 0);
  const paid = sum('succeeded');
  const pending = sum('processing');
  return { paid, pending, due: Math.max(0, totalCents - paid - pending) };
}
