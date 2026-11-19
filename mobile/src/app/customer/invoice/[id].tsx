import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { CustomerPage } from '@/components/customer-page';
import { InvoicePaymentChoices } from '@/components/invoice-payment-choices';
import { ProofPhotos } from '@/components/job-photos';
import { ScopeCard } from '@/components/job-scope';
import { RecordGate } from '@/components/record-gate';
import { Card, Hair, LineRow, Row, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { customerOf, documentScope, hasInvoice, invoiceById, invoiceLines, invoiceSummary, invoiceTax, invoiceTotals, jobById, paidOnline, taxScope } from '@/data/selectors';
import { loadInvoiceOptions } from '@/data/pay-page';
import { onLiveRefresh } from '@/data/live-events';
import { useStore } from '@/data/store';
import { useTFor } from '@/i18n';
import { useInvoiceAcceptance } from '@/data/use-invoice-acceptance';
import { addDays, formatters } from '@/lib/format';
import { businessDate } from '@/lib/invoice-aging';
import { lineTotal } from '@/lib/money';
import { radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

function CustomerInvoice() {
  const p = usePalette();
  const { state } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoice = invoiceById(id)!;
  const job = jobById(invoice.jobId);
  const customer = customerOf(job);
  const tc = useTFor(customer.lang);
  const fc = formatters(customer.lang);
  const connected = state.mode === 'connected';
  const businessId = state.businessId;
  const [options, setOptions] = useState<{ businessId: string; value: Awaited<ReturnType<typeof loadInvoiceOptions>> } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!connected || !businessId) return;
    let active = true;
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      void loadInvoiceOptions().then((value) => { if (active && request === revision) setOptions({ businessId, value }); })
        .catch(() => { if (active && request === revision) setOptions(null); });
    };
    refresh();
    const unsubscribe = onLiveRefresh(refresh);
    return () => { active = false; unsubscribe(); };
  }, [connected, businessId]));
  const online = options?.businessId === businessId ? options?.value : undefined;
  const acceptance = useInvoiceAcceptance(invoice.id, businessId, connected && state.sentInvoices.includes(invoice.id));

  const lines = invoiceLines(state, invoice);
  const totals = invoiceTotals(state, invoice);
  const issued = state.issuedInvoices[invoice.id];
  const issuedOn = issued?.issuedOn ?? businessDate(state.mode, sample.TODAY);
  const itemized = (issued?.materialsMode ?? state.materialsMode[invoice.id] ?? 'items') === 'items';
  const shown = itemized ? lines : lines.filter((l) => l.kind !== 'material');
  const pending = paidOnline(state, invoice.id).pending;
  const scope = taxScope(state, invoice);
  const tax = invoiceTax(state, invoice);
  const taxKey = scope === 'all' ? 'customer.taxAll' : scope === 'labor' ? 'customer.taxLabor' : scope === 'materials' ? 'customer.taxMaterials' : null;

  return (
    // customer links last 90 days from when they're made (supabase/functions/payments)
    <CustomerPage who={customer.firstName} tc={tc} expires={fc.date(addDays(issuedOn, 90))}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 2 }}>
          <T v="label">{tc('customer.invoiceNo', { n: invoice.number })}</T>
          <T v="small" muted>{tc('customer.forName', { name: customer.name })}</T>
          <T v="small" muted>{issued?.address ?? job.address}</T>
          {(issued ? issued.workOrder : job.workOrder) ? <T v="small" muted>{issued ? issued.workOrder : job.workOrder}</T> : null}
        </View>
        <View style={{ gap: 2, alignItems: 'flex-end' }}>
          <T v="small" muted>{tc('customer.sent', { date: fc.date(issuedOn) })}</T>
          <T v="label">{tc('customer.due', { date: fc.date(addDays(issuedOn, issued?.dueDays ?? state.invoiceDueDays?.[invoice.id] ?? state.settings.dueDays)) })}</T>
        </View>
      </Row>

      <Card tone="accent" style={{ gap: 10, padding: 22, borderRadius: radius.lg }}>
        <T v="eyebrow" color={p.onAccent}>{tc('customer.amountDue')}</T>
        <T v="moneyBig" color={p.onAccent}>{fc.money(totals.due)}</T>
      </Card>
      <InvoicePaymentChoices lang={customer.lang} methods={acceptance?.alternativeMethods ?? issued?.alternativeMethods ?? state.settings.alternativeMethods ?? {}}
        wallet={!!online?.wallet} card={!!online?.card} bank={!!online?.bank} testMode={online?.testMode} canPay={totals.due > 0 && pending === 0}
        acceptance={acceptance} />

      <Card style={{ gap: 6 }}>
        <T v="eyebrow">{tc('customer.payingFor')}</T>
        {shown.map((line) => (
          <LineRow
            key={line.id}
            label={line.description}
            sub={line.unit === 'hour' ? `${fc.qty(line.qtyHundredths)} h × ${fc.money(line.unitCents)}` : undefined}
            value={fc.money(lineTotal(line.qtyHundredths, line.unitCents))}
          />
        ))}
        {!itemized ? <LineRow label={tc('invoice.materials')} value={fc.money(totals.materials)} /> : null}
        <Hair style={{ marginVertical: 6 }} />
        <LineRow label={tc('customer.subtotal')} value={fc.money(totals.subtotal)} />
        {taxKey ? <LineRow label={tc(taxKey, { pct: fc.pct(tax.rateBps) })} value={fc.money(totals.tax)} /> : null}
        <Hair style={{ marginVertical: 6, backgroundColor: p.ink, height: 2 }} />
        <LineRow label={tc('customer.total')} value={fc.money(totals.total)} strong />
      </Card>

      <ScopeCard scope={issued ? issued.scope : documentScope(state, job)}
        excluded={issued ? issued.excludedScope : state.estimates[job.id]?.lines.filter((l) => l.excluded).map((l) => l.description)} t={tc} />
      <Card style={{ gap: 10 }}>
        <T v="eyebrow">{tc('customer.theWork')}</T>
        <ProofPhotos jobId={job.id} t={tc} ids={issued?.proofPhotoIds ?? state.invoiceProofPhotos?.[invoice.id]} showLocation={!!state.showLocation[invoice.id]} height={120} />
        <T v="body">{invoiceSummary(state, invoice)}</T>
      </Card>
    </CustomerPage>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function CustomerInvoiceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasInvoice(id)}><CustomerInvoice /></RecordGate>;
}
