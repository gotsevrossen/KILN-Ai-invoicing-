// Talks to Stripe directly over its web API (no Stripe library): a handful of requests, and the
// check that a payment notice (webhook) really came from Stripe. The secret key lives only in the
// server's settings (supabase/.env locally, project secrets when hosted), never in the app.

export const STRIPE_VERSION = '2026-09-30.endive';
const API = 'https://api.stripe.com';

export class StripeError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

/** Stripe's form style for its older (v1) API: {a: {b: 1}, c: ['x']} -> a[b]=1&c[0]=x. */
export function formBody(params: Record<string, unknown>): string {
  const out = new URLSearchParams();
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => add(`${key}[${i}]`, v));
    else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) add(`${key}[${k}]`, v);
    else out.append(key, String(value));
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  return out.toString();
}

interface Call {
  method: 'GET' | 'POST';
  path: string;
  /** Form fields (v1) or JSON (v2). */
  body?: Record<string, unknown>;
  /** The business's own Stripe account, for payments made on it. */
  account?: string;
}

/** One request to Stripe. A refusal is thrown as a StripeError with Stripe's error code. */
export async function stripe<T>(secretKey: string, call: Call): Promise<T> {
  const v2 = call.path.startsWith('/v2/');
  const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}`, 'Stripe-Version': STRIPE_VERSION };
  if (call.account) headers['Stripe-Account'] = call.account;
  let body: string | undefined;
  if (call.body && call.method === 'POST') {
    headers['Content-Type'] = v2 ? 'application/json' : 'application/x-www-form-urlencoded';
    body = v2 ? JSON.stringify(call.body) : formBody(call.body);
  }
  const res = await fetch(API + call.path, { method: call.method, headers, body });
  const data = await res.json().catch(() => ({})) as { error?: { code?: string; type?: string } };
  if (!res.ok) throw new StripeError(res.status, data.error?.code ?? data.error?.type ?? 'stripe_error');
  return data as T;
}

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Compares two strings without leaking, through timing, how much of them matched. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True when a webhook's Stripe-Signature header ("t=<time>,v1=<signature>") matches the payload
 * signed with the webhook's secret, and it was signed within the last 5 minutes (so an old notice
 * caught on the way can't be sent again later).
 */
export async function verifyWebhook(payload: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header || !secret) return false;
  const fields = header.split(',').map((part) => {
    const at = part.indexOf('=');
    return at < 0 ? ['', ''] : [part.slice(0, at).trim(), part.slice(at + 1).trim()];
  });
  const time = fields.find(([k]) => k === 't')?.[1] ?? '';
  const signatures = fields.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!/^\d{1,12}$/.test(time) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(time)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc(`${time}.${payload}`)));
  return signatures.some((s) => sameText(s, expected));
}
