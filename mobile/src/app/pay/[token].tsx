import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { ScopeCard } from '@/components/job-scope';
import { LogoMark } from '@/components/logo';
import { StripePay } from '@/components/stripe-pay';
import { Button, Card, Hair, Icon, LineRow, Notice, Row, Screen, T } from '@/components/ui';
import { PayFailed } from '@/data/db-pay';
import { checkPayment, loadPayPage, type PayPage } from '@/data/pay-page';
import { useTFor, type Lang } from '@/i18n';
import { useLang } from '@/i18n';
import { addDays, formatters } from '@/lib/format';
import { localDate } from '@/lib/invoice-aging';
import { lineTotal } from '@/lib/money';
import { radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/**
 * The customer's invoice, opened from the link the owner texted or emailed. No app, no account:
 * the link's code opens this one invoice. Everything shown is the copy saved when it was sent.
 */
export default function PayInvoice() {
  const p = usePalette();
  const { lang: deviceLang } = useLang();
  const { token, payment_intent: returnedIntent } = useLocalSearchParams<{ token: string; payment_intent?: string }>();
  const [page, setPage] = useState<PayPage | null>(null);
  const [problem, setProblem] = useState<'not_found' | 'failed' | null>(null);
  const [done, setDone] = useState<'succeeded' | 'processing' | null>(null);
  const lang: Lang = page?.customer.lang ?? deviceLang;
  const tc = useTFor(lang);
  const fc = formatters(lang);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setPage(await loadPayPage(String(token)));
    } catch (e) {
      setProblem(e instanceof PayFailed && e.code === 'not_found' ? 'not_found' : 'failed');
    }
  }, [token]);

  useEffect(() => {
    void (async () => {
      // back from a bank's or wallet's own page: record what happened first
      if (returnedIntent) {
        const status = await checkPayment(String(token), String(returnedIntent)).catch(() => 'not_paid' as const);
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
          <T v="body" muted style={{ textAlign: 'center' }}>{problem === 'not_found' ? tc('pay.notFound') : problem ? tc('pay.failed') : tc('pay.loading')}</T>
          {problem === 'failed' ? <Button label={tc('pay.tryAgain')} variant="outline" onPress={load} /> : null}
        </View>
      </Screen>
    );
  }

  const { invoice, totals } = page;
  const itemized = invoice.materialsMode === 'items';
  const shown = itemized ? page.lines : page.lines.filter((l) => l.kind !== 'material');
  const issuedOn = invoice.issuedOn ?? localDate();
  const taxKey = invoice.tax.rateBps > 0 && (invoice.tax.labor || invoice.tax.materials)
    ? invoice.tax.labor && invoice.tax.materials ? 'customer.taxAll' : invoice.tax.labor ? 'customer.taxLabor' : 'customer.taxMaterials'
    : null;
  const paidNow = invoice.paid || done === 'succeeded';
  const onTheWay = !paidNow && (page.pending > 0 || done === 'processing');

  const paid = async (status: 'succeeded' | 'processing') => {
    setDone(status);
    await load();
  };

  return (
    <Screen>
      <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 14 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flex: 1 }}>
            <T v="h3">{page.business.name}</T>
            {page.business.phone ? (
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${page.business.phone.replace(/[^\d+]/g, '')}`)}>
                <T v="small" muted style={{ textDecorationLine: 'underline' }}>{page.business.phone}</T>
              </Pressable>
            ) : null}
          </View>
        </Card>

        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 2, flex: 1 }}>
            <T v="label">{tc('customer.invoiceNo', { n: invoice.number })}</T>
            <T v="small" muted>{tc('customer.forName', { name: page.customer.name })}</T>
            {invoice.address ? <T v="small" muted>{invoice.address}</T> : null}
            {invoice.workOrder ? <T v="small" muted>{invoice.workOrder}</T> : null}
          </View>
          <View style={{ gap: 2, alignItems: 'flex-end' }}>
            <T v="small" muted>{tc('customer.sent', { date: fc.date(issuedOn) })}</T>
            <T v="label">{tc('customer.due', { date: fc.date(addDays(issuedOn, invoice.dueDays)) })}</T>
          </View>
        </Row>

        <Card tone="accent" style={{ gap: 10, padding: 22, borderRadius: radius.lg }}>
          {paidNow ? (
            <>
              <T v="eyebrow" color={p.onAccent}>{tc('customer.total')}</T>
              <T v="moneyBig" color={p.onAccent}>{fc.money(totals.total)}</T>
              <Row gap={8}><Icon name="check-circle" color={p.onAccent} /><T v="label" color={p.onAccent}>{done === 'succeeded' ? tc('pay.received') : tc('pay.paid')}</T></Row>
            </>
          ) : onTheWay ? (
            <>
              <T v="eyebrow" color={p.onAccent}>{tc('customer.amountDue')}</T>
              <T v="moneyBig" color={p.onAccent}>{fc.money(page.pending || page.due)}</T>
              <T v="label" color={p.onAccent}>{done === 'processing' ? tc('pay.processing', { business: page.business.name }) : tc('pay.onTheWay', { amount: fc.money(page.pending) })}</T>
            </>
          ) : (
            <>
              <T v="eyebrow" color={p.onAccent}>{tc('customer.amountDue')}</T>
              <T v="moneyBig" color={p.onAccent}>{fc.money(page.due)}</T>
              {page.pay ? (
                <StripePay token={String(token)} pay={page.pay} amountCents={page.due} amountText={fc.money(page.due)} lang={lang} tc={tc} onDone={paid} />
              ) : null}
              <T v="small" color={p.onAccent}>{tc('pay.offline', { business: page.business.name })}</T>
              {page.business.phone ? (
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${page.business.phone.replace(/[^\d+]/g, '')}`)}
                  style={{ minHeight: tap.min, justifyContent: 'center' }}>
                  <T v="label" color={p.onAccent} style={{ textDecorationLine: 'underline' }}>{tc('pay.call', { phone: page.business.phone })}</T>
                </Pressable>
              ) : null}
            </>
          )}
        </Card>

        <Card style={{ gap: 6 }}>
          <T v="eyebrow">{tc('customer.payingFor')}</T>
          {shown.map((line, i) => (
            <LineRow
              key={i}
              label={line.description}
              sub={line.unit === 'hour' ? `${fc.qty(line.qtyHundredths)} h × ${fc.money(line.unitCents)}` : undefined}
              value={fc.money(lineTotal(line.qtyHundredths, line.unitCents))}
            />
          ))}
          {!itemized ? <LineRow label={tc('invoice.materials')} value={fc.money(totals.materials)} /> : null}
          <Hair style={{ marginVertical: 6 }} />
          <LineRow label={tc('customer.subtotal')} value={fc.money(totals.subtotal)} />
          {taxKey ? <LineRow label={tc(taxKey, { pct: fc.pct(invoice.tax.rateBps) })} value={fc.money(totals.tax)} /> : null}
          <Hair style={{ marginVertical: 6, backgroundColor: p.ink, height: 2 }} />
          <LineRow label={tc('customer.total')} value={fc.money(totals.total)} strong />
        </Card>

        <ScopeCard scope={invoice.scope ?? undefined} excluded={invoice.excludedScope} t={tc} />

        {invoice.summary.trim() || page.photos.length ? (
          <Card style={{ gap: 10 }}>
            <T v="eyebrow">{tc('customer.theWork')}</T>
            {page.photos.length ? (
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {page.photos.map((photo, i) => (
                  <View key={i} style={{ width: '48%', gap: 4 }}>
                    <Image source={{ uri: photo.url }} style={{ width: '100%', height: 140, borderRadius: radius.sm }} contentFit="cover"
                      accessibilityLabel={tc(photo.tag === 'before' ? 'job.before' : 'job.after')} />
                    <T v="small" muted>{tc(photo.tag === 'before' ? 'job.before' : 'job.after')}</T>
                    {photo.lat !== undefined && photo.lng !== undefined
                      ? <T v="small" muted>{tc('pay.takenAt', { lat: photo.lat.toFixed(5), lng: photo.lng.toFixed(5) })}</T> : null}
                  </View>
                ))}
              </Row>
            ) : null}
            {invoice.summary.trim() ? <T v="body">{invoice.summary}</T> : null}
          </Card>
        ) : null}

        <Hair />
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Row gap={6}>
            <Icon name="lock" size={14} color={p.muted} />
            <T v="small" muted>{tc('customer.privateLink', { date: fc.date(localDate(page.expiresAt)) })}</T>
          </Row>
          <Row gap={6}>
            <LogoMark size={18} />
            <T v="small" muted>{tc('customer.sentWith')}</T>
          </Row>
        </View>
        {done === 'processing' && !onTheWay ? <Notice text={tc('pay.processing', { business: page.business.name })} icon="clock" /> : null}
      </View>
    </Screen>
  );
}
