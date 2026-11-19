import type { Lang, TFn } from '@/i18n';
import type { OnlineCheckout } from '@/lib/invoice-payment';

import { T } from './ui';

export interface StripePayProps {
  token: string;
  pay: OnlineCheckout;
  amountCents: number;
  amountText: string;
  lang: Lang;
  tc: TFn;
  onAccent?: boolean;
  onDone: (status: 'succeeded' | 'processing') => void | Promise<void>;
}

/** Customers pay on the web page (stripe-pay.web.tsx). Inside the app, the link just says so. */
export function StripePay({ tc }: StripePayProps) {
  return <T v="small">{tc('pay.nativeOnly')}</T>;
}
