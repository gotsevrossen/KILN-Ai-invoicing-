import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { userError } from '@/lib/user-errors';
import { checkPayment, startPayment } from '@/data/pay-page';
import type { Lang, TFn } from '@/i18n';
import { invoicePaymentCopy, type OnlineCheckout, type WalletKind } from '@/lib/invoice-payment';
import { usePalette } from '@/theme/use-palette';

import { Button, Notice, T } from './ui';

export interface StripePayProps {
  token: string;
  pay: OnlineCheckout;
  amountCents: number;
  amountText: string;
  lang: Lang;
  tc: TFn;
  onAccent?: boolean;
  /** The payment went through, or a bank payment is on its way. */
  onDone: (status: 'succeeded' | 'processing') => void | Promise<void>;
}

/**
 * Stripe collects wallet, card and bank credentials on the business's own account.
 */
export function StripePay({ token, pay, amountCents, amountText, lang, tc, onDone, onAccent = true }: StripePayProps) {
  const p = usePalette();
  const c = invoicePaymentCopy[lang];
  const walletBox = useRef<HTMLDivElement>(null);
  const bankBox = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [walletShown, setWalletShown] = useState<boolean | null>(null);
  const [method, setMethod] = useState<'bank' | 'card' | null>(null);
  const [paymentElements, setPaymentElements] = useState<StripeElements | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirming = useRef(false);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  const applePay = pay.wallet && pay.applePay !== false;
  const googlePay = pay.wallet && pay.googlePay !== false;

  useEffect(() => {
    let live = true;
    // the business's own Stripe account takes the payment
    loadStripe(pay.publishableKey, { stripeAccount: pay.account, locale: lang }).then((s) => {
      if (!live) return;
      setStripe(s);
      if (!s) setError(tc('pay.payFailed', { reason: tc('errors.unavailable') }));
    }).catch((e: unknown) => {
      if (live) setError(tc('pay.payFailed', { reason: userError(tc, e) }));
    });
    return () => {
      live = false;
    };
  }, [pay.publishableKey, pay.account, lang, tc]);

  const confirm = useCallback(async (elements: StripeElements, method: 'wallet' | 'bank' | 'card', wallet?: WalletKind) => {
    if (!stripe || confirming.current) return;
    confirming.current = true;
    setBusy(true);
    setError(null);
    try {
      const submitted = await elements.submit();
      if (submitted.error) throw submitted.error;
      const clientSecret = await startPayment(token, method, amountCents, wallet);
      const returnUrl = new URL(window.location.pathname, window.location.origin).href;
      const result = await stripe.confirmPayment({ elements, clientSecret, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
      if (result.error) throw result.error;
      try {
        const status = await checkPayment(token, result.paymentIntent.id);
        if (status === 'not_paid') setError(tc('pay.payFailedPlain'));
        else await done.current(status);
      } catch {
        setError(tc('pay.checkFailed'));
      }
    } finally {
      confirming.current = false;
      setBusy(false);
    }
  }, [stripe, token, amountCents, tc]);

  const showPaymentError = useCallback((e: unknown) => {
    setError(tc('pay.payFailed', { reason: userError(tc, e) }));
  }, [tc]);

  // Apple Pay / Google Pay
  useEffect(() => {
    if (!stripe || (!applePay && !googlePay) || !walletBox.current) return;
    const elements = stripe.elements({ mode: 'payment', amount: amountCents, currency: 'usd', allowedPaymentMethodTypes: ['card'], locale: lang });
    const buttons = elements.create('expressCheckout', {
      paymentMethods: { applePay: applePay ? 'always' : 'never', googlePay: googlePay ? 'always' : 'never',
        link: 'never', paypal: 'never', amazonPay: 'never', klarna: 'never' },
      buttonHeight: 55,
      buttonType: { applePay: 'plain', googlePay: 'pay' },
    });
    buttons.on('ready', ({ availablePaymentMethods }) => {
      setWalletShown(!!(availablePaymentMethods?.applePay || availablePaymentMethods?.googlePay));
    });
    buttons.on('availablepaymentmethodschange', ({ paymentMethods }) => {
      setWalletShown(!!(paymentMethods?.applePay || paymentMethods?.googlePay));
    });
    buttons.on('loaderror', ({ error }) => {
      setWalletShown(false);
      showPaymentError(error);
    });
    buttons.on('confirm', async (event) => {
      const wallet = event.expressPaymentType === 'apple_pay' && applePay ? 'applePay'
        : event.expressPaymentType === 'google_pay' && googlePay ? 'googlePay' : null;
      if (!wallet) { event.paymentFailed({ reason: 'fail' }); return; }
      try {
        await confirm(elements, 'wallet', wallet);
      } catch (e) {
        event.paymentFailed({ reason: 'fail' });
        showPaymentError(e);
      }
    });
    buttons.mount(walletBox.current);
    return () => buttons.destroy();
  }, [stripe, applePay, googlePay, amountCents, lang, confirm, showPaymentError]);

  // Separate forms keep the selected method on the server reservation and payment record.
  useEffect(() => {
    if (!stripe || !method || !bankBox.current) return;
    const elements = stripe.elements({ mode: 'payment', amount: amountCents, currency: 'usd',
      allowedPaymentMethodTypes: [method === 'bank' ? 'us_bank_account' : 'card'], locale: lang });
    const form = elements.create('payment', { layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } });
    form.mount(bankBox.current);
    setPaymentElements(elements);
    return () => {
      form.destroy();
      setPaymentElements(null);
    };
  }, [stripe, method, amountCents, lang]);

  return (
    <View style={{ gap: 10 }}>
      {pay.wallet ? <div ref={walletBox} /> : null}
      {pay.wallet && busy ? <T v="small" color={onAccent ? p.onAccent : p.ink}>{tc('pay.working')}</T> : null}
      {pay.wallet && walletShown === false ? <T v="small" color={onAccent ? p.onAccent : p.ink}>{tc('pay.noWallet')}</T> : null}
      {pay.card ? <Button label={c.card} variant={method === 'card' ? 'dark' : 'outline'} disabled={!stripe || busy} onPress={() => setMethod('card')} /> : null}
      {pay.bank && (pay.card || method !== 'bank') ? <Button label={pay.card ? c.bank : tc('pay.bank')} icon="briefcase"
        variant={method === 'bank' ? 'dark' : 'soft'} style={{ backgroundColor: method === 'bank' ? undefined : p.card }} disabled={!stripe || busy} onPress={() => setMethod('bank')} /> : null}
      {method ? <View style={{ gap: 10, backgroundColor: p.card, borderRadius: 16, padding: 14 }}>
        <div ref={bankBox} />
        {method === 'bank' ? <T v="small" muted>{tc('pay.bankHelp')}</T> : null}
        <Button label={busy ? tc('pay.working') : method === 'bank' ? tc('pay.bankPay', { amount: amountText }) : `${c.pay} · ${amountText}`}
          icon="lock" variant="dark" big disabled={busy || !paymentElements} onPress={() => {
            if (paymentElements) void confirm(paymentElements, method).catch(showPaymentError);
          }} />
      </View> : null}
      {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
    </View>
  );
}
