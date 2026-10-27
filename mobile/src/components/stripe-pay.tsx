import type { Lang, TFn } from '@/i18n';

import { T } from './ui';

export interface StripePayProps {
  token: string;
  pay: { wallet: boolean; bank: boolean; account: string; publishableKey: string };
  amountCents: number;
  amountText: string;
  lang: Lang;
  tc: TFn;
  onDone: (status: 'succeeded' | 'processing') => void;
}

/** Customers pay on the web page (stripe-pay.web.tsx). Inside the app, the link just says so. */
export function StripePay({ tc }: StripePayProps) {
  return <T v="small">{tc('pay.nativeOnly')}</T>;
}
