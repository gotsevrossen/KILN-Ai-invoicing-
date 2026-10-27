import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { PayFailed } from '@/data/db-pay';
import { checkPayment, startPayment } from '@/data/pay-page';
import type { Lang, TFn } from '@/i18n';
import { usePalette } from '@/theme/use-palette';

import { Button, Notice, T } from './ui';

export interface StripePayProps {
  token: string;
  pay: { wallet: boolean; bank: boolean; account: string; publishableKey: string };
  amountCents: number;
  amountText: string;
  lang: Lang;
  tc: TFn;
  /** The payment went through, or a bank payment is on its way. */
  onDone: (status: 'succeeded' | 'processing') => void;
}

/**
 * Stripe's own payment pieces on the customer's page: Apple Pay / Google Pay buttons (only those:
 * no card form, Link, PayPal, or others), and a bank account option. Card details and bank
 * logins go straight to Stripe; KILN never sees them. The amount is set by KILN's server.
 */
export function StripePay({ token, pay, amountCents, amountText, lang, tc, onDone }: StripePayProps) {
  const p = usePalette();
  const walletBox = useRef<HTMLDivElement>(null);
  const bankBox = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [walletShown, setWalletShown] = useState<boolean | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankElements, setBankElements] = useState<StripeElements | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // the business's own Stripe account takes the payment
    loadStripe(pay.publishableKey, { stripeAccount: pay.account, locale: lang }).then((s) => live && setStripe(s)).catch(() => live && setWalletShown(false));
    return () => {
      live = false;
    };
  }, [pay.publishableKey, pay.account, lang]);

  const failed = (e: unknown) => {
    if (e instanceof PayFailed) setError(tc('pay.payFailedPlain'));
    else setError(e instanceof Error && e.message ? tc('pay.payFailed', { reason: e.message }) : tc('pay.payFailedPlain'));
  };

  const finish = async (intentId: string) => {
    const status = await checkPayment(token, intentId);
    if (status === 'not_paid') setError(tc('pay.payFailedPlain'));
    else onDone(status);
  };

  // Apple Pay / Google Pay
  useEffect(() => {
    if (!stripe || !pay.wallet || !walletBox.current) return;
    const elements = stripe.elements({ mode: 'payment', amount: amountCents, currency: 'usd', allowedPaymentMethodTypes: ['card'], locale: lang });
    const buttons = elements.create('expressCheckout', {
      paymentMethods: { applePay: 'always', googlePay: 'always', link: 'never', paypal: 'never', amazonPay: 'never', klarna: 'never' },
      buttonHeight: 55,
      buttonType: { applePay: 'plain', googlePay: 'pay' },
    });
    buttons.on('ready', ({ availablePaymentMethods }) => {
      setWalletShown(!!availablePaymentMethods && (!!availablePaymentMethods.applePay || !!availablePaymentMethods.googlePay));
    });
    buttons.on('confirm', async (event) => {
      setError(null);
      try {
        const submitted = await elements.submit();
        if (submitted.error) throw new Error(submitted.error.message);
        const clientSecret = await startPayment(token, 'wallet');
        const result = await stripe.confirmPayment({ elements, clientSecret, confirmParams: { return_url: window.location.href }, redirect: 'if_required' });
        if (result.error) {
          event.paymentFailed({ reason: 'fail' });
          throw new Error(result.error.message);
        }
        await finish(result.paymentIntent.id);
      } catch (e) {
        failed(e);
      }
    });
    buttons.mount(walletBox.current);
    return () => buttons.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe, pay.wallet, amountCents, lang, token]);

  // bank account: Stripe's form opens when the customer picks it
  useEffect(() => {
    if (!stripe || !bankOpen || !bankBox.current) return;
    const elements = stripe.elements({ mode: 'payment', amount: amountCents, currency: 'usd', allowedPaymentMethodTypes: ['us_bank_account'], locale: lang });
    const form = elements.create('payment', { layout: 'tabs' });
    form.mount(bankBox.current);
    setBankElements(elements);
    return () => {
      form.destroy();
      setBankElements(null);
    };
  }, [stripe, bankOpen, amountCents, lang]);

  const payByBank = async () => {
    if (!stripe || !bankElements) return;
    setError(null);
    setBusy(true);
    try {
      const submitted = await bankElements.submit();
      if (submitted.error) throw new Error(submitted.error.message);
      const clientSecret = await startPayment(token, 'bank');
      const result = await stripe.confirmPayment({ elements: bankElements, clientSecret, confirmParams: { return_url: window.location.href }, redirect: 'if_required' });
      if (result.error) throw new Error(result.error.message);
      await finish(result.paymentIntent.id);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      {pay.wallet ? <div ref={walletBox} /> : null}
      {pay.wallet && walletShown === false ? <T v="small" color={p.onAccent}>{tc('pay.noWallet')}</T> : null}
      {pay.bank ? (
        bankOpen ? (
          <View style={{ gap: 10, backgroundColor: p.card, borderRadius: 16, padding: 14 }}>
            <div ref={bankBox} />
            <T v="small" muted>{tc('pay.bankHelp')}</T>
            <Button label={busy ? tc('pay.working') : tc('pay.bankPay', { amount: amountText })} icon="lock" variant="dark" big disabled={busy || !bankElements} onPress={payByBank} />
          </View>
        ) : (
          <Button label={tc('pay.bank')} icon="briefcase" variant="soft" style={{ backgroundColor: p.card }} disabled={!stripe} onPress={() => setBankOpen(true)} />
        )
      ) : null}
      {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
    </View>
  );
}
