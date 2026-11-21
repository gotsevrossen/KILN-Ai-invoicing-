import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { InvoiceDocument } from '@/components/invoice-document';
import { CustomerDocumentExport } from '@/components/customer-document-export';
import type { SavedSnapshot } from '@/data/job-cleanup';
import { parseDollars } from '@/components/estimate-parts';
import { InvoicePaymentChoices } from '@/components/invoice-payment-choices';
import { LogoMark } from '@/components/logo';
import { StripePay } from '@/components/stripe-pay';
import { Button, Card, Checkbox, Field, Notice, Row, Screen, T } from '@/components/ui';
import { onLiveRefresh } from '@/data/live-events';
import { checkPayment, loadPayPage, returnSignedInvoice, type PayPage } from '@/data/pay-page';
import { useTFor, type Lang } from '@/i18n';
import { useLang } from '@/i18n';
import { addDays, formatters } from '@/lib/format';
import { localDate } from '@/lib/invoice-aging';
import { errorDetails, userError, type ErrorDetails } from '@/lib/user-errors';
import { radius } from '@/theme/tokens';

/**
 * The customer's invoice, opened from the link the owner texted or emailed. No app, no account:
 * the link's code opens this one invoice. Everything shown is the copy saved when it was sent.
 */
export default function PayInvoiceRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <PayInvoice key={token} />;
}

function PayInvoice() {
  const { lang: deviceLang } = useLang();
  const { token, payment_intent: returnedIntent } = useLocalSearchParams<{ token: string; payment_intent?: string }>();
  const [page, setPage] = useState<PayPage | null>(null);
  const [problem, setProblem] = useState<ErrorDetails | null>(null);
  const [done, setDone] = useState<'succeeded' | 'processing' | null>(null);
  const [paymentCheckFailed, setPaymentCheckFailed] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [partial, setPartial] = useState(false);
  const [amount, setAmount] = useState('');
  const lang: Lang = page?.customer.lang ?? deviceLang;
  const tc = useTFor(lang);
  const fc = formatters(lang);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setPage(await loadPayPage(String(token)));
    } catch (e) {
      setProblem(errorDetails(e));
    }
  }, [token]);
  // pull down to see the latest payment status
  useEffect(() => onLiveRefresh(() => void load()), [load]);

  useEffect(() => {
    void (async () => {
      // back from a bank's or wallet's own page: record what happened first
      if (returnedIntent) {
        const status = await checkPayment(String(token), String(returnedIntent)).catch(() => {
          setPaymentCheckFailed(true);
          return 'not_paid' as const;
        });
        if (status !== 'not_paid') setDone(status);
      }
      await load();
    })();
  }, [token, returnedIntent, load]);

  if (!page) {
    return (
      <Screen>
        <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 14, paddingTop: 40, alignItems: 'center' }}>
          <LogoMark size={48} />
          <T v="body" muted style={{ textAlign: 'center' }}>{problem?.code === 'not_found' ? tc('pay.notFound') : problem ? tc('pay.failed', { reason: userError(tc, problem) }) : tc('pay.loading')}</T>
          {problem && problem.code !== 'not_found' ? <Button label={tc('pay.tryAgain')} variant="outline" onPress={load} /> : null}
        </View>
      </Screen>
    );
  }

  const { invoice, totals } = page;
  const itemized = invoice.materialsMode === 'items';
  const issuedOn = invoice.issuedOn ?? localDate();
  const paidNow = invoice.paid;
  const onTheWay = !paidNow && page.pending > 0;
  const canPay = !paidNow && !onTheWay && !problem && page.due > 0;
  const charge = page.reservation?.amountCents ?? (partial ? parseDollars(amount) : page.due);
  const validCharge = charge !== null && charge >= 50 && charge <= page.due;
  const es = lang === 'es';
  const printable: SavedSnapshot = {
    type: 'invoice', business: page.business,
    customer: { ...page.customer, phone: null, email: null },
    job: { title: '', address: invoice.address, workOrder: invoice.workOrder },
    document: { number: invoice.number, issued_on: issuedOn, due_date: addDays(issuedOn, invoice.dueDays),
      paid_at: invoice.paidAt, signed_at: page.acceptance?.signedAt, materials_mode: invoice.materialsMode, scope: invoice.scope,
      tax_rate_bps: invoice.tax.rateBps, tax_labor: invoice.tax.labor, tax_materials: invoice.tax.materials,
      summary: [invoice.summary, invoice.scope?.location, invoice.scope?.notes, invoice.scope?.details,
        ...[invoice.scope?.exclusions, ...(invoice.excludedScope ?? [])].filter(Boolean)
          .map((text) => `${tc('scope.exclusions')}: ${text}`)].filter(Boolean).join('\n') },
    lines: page.lines.map((line) => ({ description: line.description, kind: line.kind, qty_hundredths: line.qtyHundredths, unit_cents: line.unitCents })),
    payments: page.payments ?? [],
    signatures: page.acceptance ? [{ ...page.acceptance, hash: page.hash, method: 'finger' }] : [],
  };

  const paid = async (status: 'succeeded' | 'processing') => {
    await load();
    setDone(status);
    setPartial(false);
    setAmount('');
  };

  return (
    <Screen scrollEnabled={!drawing}>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 14 }}>
        {paymentCheckFailed ? <Notice text={tc('pay.checkFailed')} tone="danger" icon="alert-circle" /> : null}
        {problem ? <>
          <Notice text={tc('pay.failed', { reason: userError(tc, problem) })} tone="danger" icon="alert-circle" />
          <Button label={tc('pay.tryAgain')} variant="outline" onPress={load} />
        </> : null}
        {/* the same view as the owner's preview (components/invoice-document.tsx) */}
        <InvoiceDocument tc={tc} fc={fc} hasPhotos={page.photos.length > 0}
          data={{
            business: page.business, number: invoice.number, customerName: page.customer.name, address: invoice.address,
            workOrder: invoice.workOrder, issuedOn, dueDays: invoice.dueDays, linkExpires: localDate(page.expiresAt),
            lines: page.lines, itemized, totals, tax: invoice.tax, due: page.due, paid: paidNow, pending: page.pending,
            scope: invoice.scope ?? undefined, excludedScope: invoice.excludedScope, summary: invoice.summary,
          }}
          paidLabel={done === 'succeeded' ? tc('pay.received') : undefined}
          onTheWayLabel={done === 'processing' ? tc('pay.processing', { business: page.business.name }) : undefined}
          payment={<>
            {canPay && page.reservation ? <Notice text={es ? `Pago en línea iniciado por ${fc.money(page.reservation.amountCents)}.` : `An online checkout was started for ${fc.money(page.reservation.amountCents)}.`} /> : null}
            {canPay && done === 'succeeded' ? <Notice text={es ? 'Pago recibido. Revisa el saldo restante.' : 'Payment received. See the remaining balance above.'} /> : null}
            {canPay && !page.reservation && (page.pay?.wallet || page.pay?.card || page.pay?.bank) && page.due >= 50 ? <Card>
              <Checkbox label={es ? 'Pagar otra cantidad' : 'Pay a different amount'} value={partial} onChange={setPartial} />
              {partial ? <Field label={es ? 'Cantidad a pagar' : 'Amount to pay'} value={amount} keyboardType="decimal-pad" onChangeText={setAmount} /> : null}
            </Card> : null}
            <InvoicePaymentChoices lang={lang} methods={page.alternativeMethods ?? {}} wallet={!!page.pay?.wallet}
              card={!!page.pay?.card} bank={!!page.pay?.bank} testMode={page.testMode} canPay={canPay} acceptance={page.acceptance ?? null}
              alternativesOnHold={!!page.reservation}
              onDrawing={setDrawing} onSign={page.hash ? async (name, ink, method) => {
                const acceptance = await returnSignedInvoice(String(token), page.hash, name, ink, method);
                setPage((current) => current ? { ...current, acceptance } : current);
              } : undefined}
              online={(choice) => page.pay && validCharge ? <StripePay key={`${choice}:${charge}`} token={String(token)}
                pay={{ ...page.pay, wallet: choice === 'wallet' && page.pay.wallet, card: choice === 'stripe' && page.pay.card, bank: choice === 'stripe' && page.pay.bank }}
                amountCents={charge} amountText={fc.money(charge)} lang={lang} tc={tc} onDone={paid} onAccent={false} />
                : <T v="small" muted>{es ? 'Ingresa al menos $0.50 y hasta el saldo restante.' : 'Enter at least $0.50 and up to the remaining balance.'}</T>} />
          </>}
          photos={<Row gap={8} style={{ flexWrap: 'wrap' }}>
            {page.photos.map((photo, i) => (
              <View key={i} style={{ width: '48%', gap: 4 }}>
                <Image source={{ uri: photo.url }} style={{ width: '100%', height: 140, borderRadius: radius.sm }} contentFit="cover"
                  accessibilityLabel={tc(photo.tag === 'before' ? 'job.before' : 'job.after')} />
                <T v="small" muted>{tc(photo.tag === 'before' ? 'job.before' : 'job.after')}</T>
                {photo.lat !== undefined && photo.lng !== undefined
                  ? <T v="small" muted>{tc('pay.takenAt', { lat: photo.lat.toFixed(5), lng: photo.lng.toFixed(5) })}</T> : null}
              </View>
            ))}
          </Row>}
          after={<>
            <CustomerDocumentExport snapshot={printable} lang={lang} />
            {printable.payments.length ? <CustomerDocumentExport snapshot={printable} lang={lang} receipt /> : null}
          </>} />
        {done === 'processing' && !onTheWay ? <Notice text={tc('pay.processing', { business: page.business.name })} icon="clock" /> : null}
      </View>
    </Screen>
  );
}
