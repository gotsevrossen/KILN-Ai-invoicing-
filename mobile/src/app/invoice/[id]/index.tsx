import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { FixList } from '@/components/fix-list';
import { useInvoice } from '@/components/invoice-parts';
import { RecordGate } from '@/components/record-gate';
import { SendInvoiceSheet } from '@/components/send-invoice';
import { Button, ButtonRow, Card, Hair, Icon, IconButton, LineRow, ListRow, Notice, PageHeader, Pill, Row, Screen, T } from '@/components/ui';
import { billedPrice, hasInvoice, hoursFor, invoiceSources, invoiceSummary, invoiceTax, invoiceTotals, paidOnline, receiptItemById, suggestionOpen, taxScope } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { localDate } from '@/lib/invoice-aging';
import { lineTotal } from '@/lib/money';
import { font, radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/** Short enough for one summary row. */
function clip(text: string, max = 60): string {
  const s = text.trim().replace(/\s+/g, ' ');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Invoice: the charges and total, with billing, proof of work, and options
 * each one tap away on their own page (like Settings).
 */
function InvoiceDraft() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { invoice, job, customer, sent, paid, billing, agreed, lines, fixes, mode, dueDays, dueDate } = useInvoice();
  const sources = invoiceSources(state, invoice);
  const [sendOpen, setSendOpen] = useState(false);
  const online = paidOnline(state, invoice.id);
  const opened = state.opened[invoice.id];
  const waiting = sent && !paid && state.mode === 'connected';

  // the customer opens and pays outside the app: check now, then every 15 seconds while it's open here
  const { refreshPay } = actions;
  useFocusEffect(useCallback(() => {
    if (!waiting) return;
    void refreshPay();
    const timer = setInterval(() => void refreshPay(), 15_000);
    return () => clearInterval(timer);
  }, [waiting, refreshPay]));

  const totals = invoiceTotals(state, invoice);
  const labor = lines.filter((l) => l.kind !== 'material');
  const materials = lines.filter((l) => l.kind === 'material');
  const suggestion = invoice.suggestion;
  const showSuggestion = !sent && billing.materials === 'additional' && suggestion && suggestionOpen(state, invoice);
  const suggestionPrice = suggestion ? billedPrice(state, receiptItemById(suggestion.receiptItemId), job.id) : 0;
  const scope = taxScope(state, invoice);
  const tax = invoiceTax(state, invoice);
  const taxKey = scope === 'all' ? 'invoice.taxAll' : scope === 'labor' ? 'invoice.taxLabor' : scope === 'materials' ? 'invoice.taxMaterials' : null;
  const summary = invoiceSummary(state, invoice).trim();
  const seeAsCustomer = () => router.push(`/customer/invoice/${invoice.id}`);

  const billingSub = [
    job.pricing === 'hourly' ? (billing.labor === 'actual' ? t('review.actual') : t('review.estimate')) : null,
    billing.materials === 'included' ? t('invoice.materialsIncluded') : t('invoice.materialsExtra'),
  ].filter(Boolean).join(' · ');
  const dueText = dueDays === 0 ? t('invoice.dueOnReceipt') : t('invoice.dueIn', { days: dueDays });
  const paidHow = online.method === 'wallet' || online.method === 'card' ? t('invoice.paidWallet') : online.method === 'bank' ? t('invoice.paidBank')
    : online.method === 'cash' ? t('invoice.paidCash') : t('invoice.paidOther');
  const sentStatus = online.pending > 0 ? t('invoice.bankOnWay', { amount: f.money(online.pending) })
    : online.failed ? t('invoice.payFailed')
      : opened ? t('invoice.openedOn', { name: customer.firstName, date: f.date(localDate(opened)) })
        : t('invoice.sentDone', { name: customer.firstName });

  return (
    <Screen
      header={
        <PageHeader
          title={t('invoice.title')}
          sub={`${job.title} · #${invoice.number}`}
          back={() => router.back()}
          right={<Pill label={paid ? t('flow.paid') : sent ? t('invoice.sentPill') : t('invoice.notSent')} tone={paid ? 'accent' : sent ? 'inverse' : 'outline'} />}
        />
      }
      footer={
        paid ? (
          <Notice text={`${t('flow.paidDone')} ${paidHow}`} icon="check-circle" tone="accent" />
        ) : sent ? (
          <>
            <Notice text={sentStatus} icon={online.pending > 0 ? 'clock' : online.failed ? 'alert-circle' : opened ? 'eye' : 'send'} />
            <Row gap={10}>
              <IconButton icon="eye" label={t('invoice.seeAsCustomer', { name: customer.firstName })} onPress={seeAsCustomer} />
              {state.mode === 'connected' ? <Button label={t('invoice.sendAgain')} variant="outline" icon="send" flex onPress={() => setSendOpen(true)} /> : null}
              <Button label={t('invoice.markPaidCash')} icon="dollar-sign" variant="dark" flex onPress={() => actions.markPaid(invoice.id)} />
            </Row>
          </>
        ) : (
          <Row gap={10}>
            <IconButton icon="eye" label={t('invoice.seeAsCustomer', { name: customer.firstName })} onPress={seeAsCustomer} />
            <Button label={t('invoice.sendTo', { name: customer.firstName })} icon="send" big flex disabled={fixes.length > 0} onPress={() => setSendOpen(true)} />
          </Row>
        )
      }>
      <T v="small" muted>
        {t('invoice.builtFrom', { photos: sources.photos, voice: sources.voice, receipts: sources.receipts, hours: f.qty(hoursFor(state, job.id)) })}
      </T>

      <FixList items={fixes} />

      {showSuggestion && suggestion ? (
        <Card tone="flag" style={{ gap: 10 }}>
          <Row gap={8}>
            <Icon name="alert-triangle" color={p.onFlag} />
            <T v="eyebrow" color={p.onFlag}>{t('invoice.possiblyMissed')}</T>
          </Row>
          <T v="h3" color={p.onFlag}>{suggestion.title}</T>
          <T v="body" color={p.onFlag}>{t(suggestion.reasonKey)}</T>
          <ButtonRow>
            <Button label={t('invoice.addIt', { amount: f.money(suggestionPrice) })} variant="dark" flex onPress={() => actions.acceptSuggestion(suggestion.id)} />
            <Button label={t('invoice.notBillable')} variant="outline" onPress={() => actions.dismissSuggestion(suggestion.id)} />
          </ButtonRow>
        </Card>
      ) : null}

      <Card style={{ gap: 6 }}>
        <T v="eyebrow">{t('invoice.labor')}</T>
        {labor.map((line) => (
          <LineRow
            key={line.id}
            label={line.description}
            sub={line.unit === 'hour' ? `${f.qty(line.qtyHundredths)} h × ${f.money(line.unitCents)}` : undefined}
            value={f.money(lineTotal(line.qtyHundredths, line.unitCents))}
          />
        ))}
        <Hair style={{ marginVertical: 8 }} />
        <T v="eyebrow">{t('invoice.materials')}</T>
        {mode === 'items' ? (
          materials.map((line) => <LineRow key={line.id} label={line.description} value={f.money(lineTotal(line.qtyHundredths, line.unitCents))} />)
        ) : (
          <LineRow label={t('invoice.materials')} value={f.money(totals.materials)} />
        )}
        <Hair style={{ marginVertical: 8 }} />
        <LineRow label={t('invoice.subtotal')} value={f.money(totals.subtotal)} />
        {taxKey ? <LineRow label={t(taxKey, { pct: f.pct(tax.rateBps) })} value={f.money(totals.tax)} /> : null}
        <Row style={{ justifyContent: 'space-between', backgroundColor: p.inverse, borderRadius: radius.sm, padding: 16, marginTop: 8 }}>
          <T v="eyebrow" color={p.onInverse}>{t('invoice.total')}</T>
          <T v="money" color={p.onInverse} style={{ fontFamily: font.black, fontSize: 28 }}>{f.money(totals.total)}</T>
        </Row>
      </Card>

      <Card style={{ gap: 4 }}>
        {/* billing choices only matter before sending, and only with an agreed price */}
        {!sent && agreed ? (
          <>
            <ListRow icon="sliders" iconTone={billing.reviewed ? 'soft' : 'flag'} title={t('invoice.billing')} sub={billingSub}
              onPress={() => router.push(`/invoice/${invoice.id}/billing`)} />
            <Hair />
          </>
        ) : null}
        <ListRow icon="camera" title={t('invoice.proof')} sub={summary ? clip(summary) : t('invoice.noSummary')}
          onPress={() => router.push(`/invoice/${invoice.id}/proof`)} />
        <Hair />
        <ListRow icon="settings" title={t('invoice.options')}
          sub={`${mode === 'items' ? t('invoice.itemized') : t('invoice.oneTotal')} · ${dueText} (${f.date(dueDate)})`}
          onPress={() => router.push(`/invoice/${invoice.id}/options`)} />
      </Card>

      <SendInvoiceSheet open={sendOpen} onClose={() => setSendOpen(false)} invoiceId={invoice.id} number={invoice.number}
        customer={customer} totalCents={totals.total} />
    </Screen>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function InvoiceDraftRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasInvoice(id)}><InvoiceDraft /></RecordGate>;
}
