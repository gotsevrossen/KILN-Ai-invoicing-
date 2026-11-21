import { useCallback, useEffect, useState } from 'react';

import { checkPayment } from '@/data/pay-page';
import { loadCollectionPage, type CollectionPage } from '@/data/job-payments';
import { onLiveRefresh } from '@/data/live-events';
import { useTFor, type Lang } from '@/i18n';
import { jobPaymentCopy } from '@/i18n/job-payment-copy';
import { formatters } from '@/lib/format';

import { InvoicePaymentChoices } from './invoice-payment-choices';
import { StripePay } from './stripe-pay';
import { Button, Card, Notice, T } from './ui';

/**
 * Paying a deposit, with the same choices as an invoice: Apple Pay / Google Pay, bank transfer
 * (and card), or an alternate method. Used on the estimate page and the deposit link page.
 * `token` is the deposit request's own link code; `returnedIntent` comes back from a bank's page.
 */
export function DepositPayment({ token, lang, returnedIntent, header = false }: {
  token: string; lang: Lang; returnedIntent?: string;
  /** Show who it's from and for which job (the stand-alone deposit link page). */
  header?: boolean;
}) {
  const [page, setPage] = useState<CollectionPage | null>(null);
  const [error, setError] = useState(false);
  const customerLang = page?.customer.lang ?? lang;
  const c = jobPaymentCopy[customerLang];
  const tc = useTFor(customerLang);
  const f = formatters(customerLang);

  const reload = useCallback(async () => {
    try {
      const result = await loadCollectionPage(token);
      if (!result?.request) throw new Error('missing');
      setPage(result);
      setError(false);
    } catch { setError(true); }
  }, [token]);
  useEffect(() => {
    let live = true;
    (returnedIntent ? checkPayment(token, returnedIntent).catch(() => null).then(() => loadCollectionPage(token)) : loadCollectionPage(token))
      .then((result) => { if (live) setPage(result); }, () => { if (live) setError(true); });
    return () => { live = false; };
  }, [token, returnedIntent]);
  useEffect(() => onLiveRefresh(() => void reload()), [reload]);
  // a bank payment takes a few days: keep checking while it's on its way
  useEffect(() => {
    if (!page?.pending) return;
    const timer = setInterval(() => void reload(), 15000);
    return () => clearInterval(timer);
  }, [page?.pending, reload]);

  if (!page) return <>
    {error ? <Notice text={c.unavailable} tone="danger" /> : <T muted>{tc('pay.loading')}</T>}
    {error ? <Button label={c.reload} variant="outline" onPress={() => void reload()} /> : null}
  </>;
  const amount = page.request.amountCents;
  return <>
    {header ? <>
      <T v="title">{page.business.name}</T>
      <T>{page.request.job}</T>
      <T v="small" muted>{page.request.address}</T>
    </> : null}
    <Card style={{ gap: 4 }}>
      <T v="eyebrow">{page.request.label}</T>
      <T v="money" style={{ fontSize: 28 }}>{f.money(amount)}</T>
    </Card>
    {page.paid ? <Notice text={c.thanks} icon="check-circle" /> : page.pending ? <Notice text={c.waiting} icon="clock" /> : <>
      <InvoicePaymentChoices lang={customerLang} methods={page.alternativeMethods ?? {}} wallet={!!page.pay?.wallet}
        card={!!page.pay?.card} bank={!!page.pay?.bank} canPay acceptance={null} signable={false}
        online={(choice) => page.pay ? <StripePay key={choice} token={token}
          pay={{ ...page.pay, wallet: choice === 'wallet' && page.pay.wallet, card: choice === 'stripe' && !!page.pay.card, bank: choice === 'stripe' && page.pay.bank }}
          amountCents={amount} amountText={f.money(amount)} lang={customerLang} tc={tc} onAccent={false} onDone={() => reload()} /> : null} />
      {!page.pay ? <T v="small" muted>{c.web}</T> : null}
    </>}
    {error ? <Notice text={c.unavailable} tone="danger" /> : null}
  </>;
}
