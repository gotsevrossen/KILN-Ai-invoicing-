import { setting } from './invoice.ts';

// Talks to Stripe directly over its web API (no Stripe library): a handful of requests, and the
// check that a payment notice (webhook) really came from Stripe. The secret key lives only in the
// server's settings (supabase/.env locally, project secrets when hosted), never in the app.

export const STRIPE_VERSION = '2026-09-30.endive';
const API = 'https://api.stripe.com';

export function stripeConfigured(): boolean {
  const secret = /^sk_(test|live)_/.exec(setting('STRIPE_SECRET_KEY'));
  const publishable = /^pk_(test|live)_/.exec(setting('STRIPE_PUBLISHABLE_KEY'));
  return !!secret && secret[1] === publishable?.[1] && !!setting('STRIPE_WEBHOOK_SECRET') && /^https:\/\/[^/\s]+$/.test(setting('KILN_PAY_URL'));
}

export function stripeTestMode(): boolean {
  return setting('STRIPE_SECRET_KEY').startsWith('sk_test_');
}

/** A sandbox payment can only be recorded in an explicitly enabled test environment. */
export function stripeCheckoutEnabled(): boolean {
  return stripeConfigured() && (!stripeTestMode() || setting('KILN_STRIPE_TEST_CHECKOUT') === 'true');
}

export const stripeAccountColumns = 'account_id, apple_pay_ready, google_pay_ready, bank_ready, card_ready, test_mode, domain_registered';
export interface StripeAccount {
  account_id: string;
  apple_pay_ready: boolean;
  google_pay_ready: boolean;
  bank_ready: boolean;
  card_ready: boolean;
  test_mode: boolean;
  domain_registered: string | null;
}

export function invoiceOnlineOptions(account: StripeAccount | null) {
  if (!account || !stripeCheckoutEnabled() || account.test_mode !== stripeTestMode()) return null;
  const registered = account.card_ready && account.domain_registered === new URL(setting('KILN_PAY_URL')).hostname;
  const applePay = registered && account.apple_pay_ready;
  const googlePay = registered && account.google_pay_ready;
  return { wallet: applePay || googlePay, applePay, googlePay,
    bank: account.bank_ready, card: account.card_ready, account: account.account_id, publishableKey: setting('STRIPE_PUBLISHABLE_KEY') };
}

export type WalletKind = 'applePay' | 'googlePay';
export const isWalletKind = (value: unknown): value is WalletKind => value === 'applePay' || value === 'googlePay';

interface PaymentDomain {
  id: string;
  domain_name: string;
  enabled: boolean;
  livemode: boolean;
  apple_pay?: { status: string };
  google_pay?: { status: string };
}

function walletState(domain: PaymentDomain | undefined, host: string, live: boolean) {
  const registered = domain?.domain_name === host && domain.livemode === live;
  const enabled = registered && domain.enabled;
  return { registered, enabled, applePay: enabled && domain.apple_pay?.status === 'active',
    googlePay: enabled && domain.google_pay?.status === 'active' };
}

/** Direct charges require registration on the connected merchant, in the same Stripe mode. */
export async function merchantWalletDomain(key: string, account: string, host: string, operation: 'inspect' | 'register' | 'recheck') {
  const path = '/v1/payment_method_domains';
  const live = key.startsWith('sk_live_');
  const listed = await stripe<{ data: PaymentDomain[] }>(key, {
    method: 'GET', path: `${path}?domain_name=${encodeURIComponent(host)}`, account,
  });
  let domain = listed.data.find((item) => item.domain_name === host && item.livemode === live);
  if (!domain && operation !== 'inspect') {
    domain = await stripe<PaymentDomain>(key, {
      method: 'POST', path, account, body: { domain_name: host }, idempotencyKey: `kiln-domain/${host}`,
    });
  } else if (domain?.enabled && operation === 'recheck' &&
    (domain.apple_pay?.status !== 'active' || domain.google_pay?.status !== 'active')) {
    domain = await stripe<PaymentDomain>(key, { method: 'POST', path: `${path}/${domain.id}/validate`, account });
  }
  const state = walletState(domain, host, live);
  // A registered domain is not enough: the wallet must also be switched on in the merchant's
  // payment method settings, or Stripe never shows its button (Google Pay was off by default).
  if (!state.enabled) return state;
  const methods = await merchantWalletMethods(key, account, operation !== 'inspect');
  return { ...state, applePay: state.applePay && methods.applePay, googlePay: state.googlePay && methods.googlePay };
}

interface MethodSetting { display_preference?: { overridable?: boolean | null; preference?: string; value?: string } }
interface MethodConfiguration { id: string; active: boolean; is_default?: boolean; parent?: string | null; apple_pay?: MethodSetting; google_pay?: MethodSetting }

/** Read-only: which wallets a configuration turns on. */
export function walletsOn(config: Pick<MethodConfiguration, 'apple_pay' | 'google_pay'> | undefined) {
  return { applePay: config?.apple_pay?.display_preference?.value === 'on', googlePay: config?.google_pay?.display_preference?.value === 'on' };
}

/**
 * The merchant's default payment method settings. Stripe can list two defaults for a connected
 * account (its own and the platform-managed copy); a wallet counts as on only when every default
 * has it on. With `turnOn`, a wallet that is off is switched on wherever Stripe lets the platform.
 */
async function merchantWalletMethods(key: string, account: string, turnOn: boolean) {
  const listed = await stripe<{ data: MethodConfiguration[] }>(key, { method: 'GET', path: '/v1/payment_method_configurations', account });
  const defaults = listed.data.filter((c) => c.active && c.is_default);
  if (!defaults.length) return { applePay: false, googlePay: false };
  const result = { applePay: true, googlePay: true };
  for (let config of defaults) {
    const off = (['apple_pay', 'google_pay'] as const).filter((m) => config[m]?.display_preference?.value !== 'on'
      && config[m]?.display_preference?.overridable !== false);
    if (turnOn && off.length) {
      const body: Record<string, unknown> = {};
      for (const m of off) body[m] = { display_preference: { preference: 'on' } };
      config = await stripe<MethodConfiguration>(key, { method: 'POST', path: `/v1/payment_method_configurations/${config.id}`, account, body });
    }
    const on = walletsOn(config);
    result.applePay &&= on.applePay;
    result.googlePay &&= on.googlePay;
  }
  return result;
}

export async function walletAvailable(key: string, account: string, wallet: WalletKind | undefined) {
  const domain = await merchantWalletDomain(key, account, new URL(setting('KILN_PAY_URL')).hostname, 'inspect');
  return wallet ? domain[wallet] : domain.applePay || domain.googlePay;
}

export async function merchantCapabilities(key: string, account: string) {
  type Capability = { status?: string };
  const result = await stripe<{ id: string; livemode: boolean; configuration?: { merchant?: { capabilities?: {
    ach_debit_payments?: Capability; card_payments?: Capability; stripe_balance?: { payouts?: Capability };
  } } } }>(key, { method: 'GET', path: `/v2/core/accounts/${account}?include=configuration.merchant` });
  const caps = result.configuration?.merchant?.capabilities;
  if (result.id !== account || result.livemode !== key.startsWith('sk_live_')) throw new StripeError(409, 'account_mode_mismatch');
  return { card: caps?.card_payments?.status === 'active', bank: caps?.ach_debit_payments?.status === 'active',
    payouts: caps?.stripe_balance?.payouts?.status === 'active' };
}

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
  idempotencyKey?: string;
}

/** One request to Stripe. A refusal is thrown as a StripeError with Stripe's error code. */
export async function stripe<T>(secretKey: string, call: Call): Promise<T> {
  const v2 = call.path.startsWith('/v2/');
  const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}`, 'Stripe-Version': STRIPE_VERSION };
  if (call.account) headers['Stripe-Account'] = call.account;
  if (call.idempotencyKey) headers['Idempotency-Key'] = call.idempotencyKey;
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
