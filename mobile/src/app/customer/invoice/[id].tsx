import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { CustomerPage } from '@/components/customer-page';
import { ProofPhotos } from '@/components/job-photos';
import { ScopeCard } from '@/components/job-scope';
import { RecordGate } from '@/components/record-gate';
import { Button, ButtonRow, Card, Hair, LineRow, Notice, Row, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { customerOf, hasInvoice, invoiceById, invoiceLines, invoiceSummary, invoiceTax, invoiceTotals, jobById, taxScope } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useTFor } from '@/i18n';
import { addDays, formatters } from '@/lib/format';
import { businessDate } from '@/lib/invoice-aging';
import { lineTotal } from '@/lib/money';
import { radius, tap } from '@/theme/tokens';
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
  const [payTapped, setPayTapped] = useState(false);

  const lines = invoiceLines(state, invoice);
  const totals = invoiceTotals(state, invoice);
  const issued = state.issuedInvoices[invoice.id];
  const issuedOn = issued?.issuedOn ?? businessDate(state.mode, sample.TODAY);
  const itemized = (issued?.materialsMode ?? state.materialsMode[invoice.id] ?? 'items') === 'items';
  const shown = itemized ? lines : lines.filter((l) => l.kind !== 'material');
  const pay = () => setPayTapped(true);
  const scope = taxScope(state, invoice);
  const tax = invoiceTax(state, invoice);
  const taxKey = scope === 'all' ? 'customer.taxAll' : scope === 'labor' ? 'customer.taxLabor' : scope === 'materials' ? 'customer.taxMaterials' : null;

  return (
    <CustomerPage who={customer.firstName} tc={tc} expires={fc.date(addDays(sample.TODAY, 45))}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 2 }}>
          <T v="label">{tc('customer.invoiceNo', { n: invoice.number })}</T>
          <T v="small" muted>{tc('customer.forName', { name: customer.name })}</T>
          <T v="small" muted>{issued?.address ?? job.address}</T>
          {(issued ? issued.workOrder : job.workOrder) ? <T v="small" muted>{issued ? issued.workOrder : job.workOrder}</T> : null}
        </View>
        <View style={{ gap: 2, alignItems: 'flex-end' }}>
          <T v="small" muted>{tc('customer.sent', { date: fc.date(issuedOn) })}</T>
          <T v="label">{tc('customer.due', { date: fc.date(addDays(issuedOn, issued?.dueDays ?? state.settings.dueDays)) })}</T>
        </View>
      </Row>

      <Card tone="accent" style={{ gap: 10, padding: 22, borderRadius: radius.lg }}>
        <T v="eyebrow" color={p.onAccent}>{tc('customer.amountDue')}</T>
        <T v="moneyBig" color={p.onAccent}>{fc.money(totals.due)}</T>
        <Button label={tc('customer.wallet')} variant="dark" big onPress={pay} />
        <ButtonRow>
          <Button label={tc('customer.card')} variant="soft" flex style={{ backgroundColor: p.card }} onPress={pay} />
          <Button label={tc('customer.bank')} variant="soft" flex style={{ backgroundColor: p.card }} onPress={pay} />
        </ButtonRow>
        <Pressable onPress={pay} accessibilityRole="button" style={{ minHeight: tap.min, alignItems: 'center', justifyContent: 'center' }}>
          <T v="label" color={p.onAccent} style={{ textDecorationLine: 'underline' }}>{tc('customer.payPart')}</T>
        </Pressable>
      </Card>
      {payTapped ? <Notice text={tc('customer.payDemo')} icon="credit-card" /> : null}

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

      <ScopeCard scope={issued ? issued.scope : state.estimates[job.id]?.scope}
        excluded={issued ? issued.excludedScope : state.estimates[job.id]?.lines.filter((l) => l.excluded).map((l) => l.description)} t={tc} />
      <Card style={{ gap: 10 }}>
        <T v="eyebrow">{tc('customer.theWork')}</T>
        <ProofPhotos jobId={job.id} t={tc} showLocation={!!state.showLocation[invoice.id]} height={120} />
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
