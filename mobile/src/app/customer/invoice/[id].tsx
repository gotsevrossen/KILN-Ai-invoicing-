import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { CustomerPage } from '@/components/customer-page';
import { Button, Card, Hair, LineRow, Notice, PhotoTile, Row, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { customerOf, invoiceById, invoiceLines, invoiceTotals, jobById } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useTFor } from '@/i18n';
import { addDays, formatters } from '@/lib/format';
import { lineTotal } from '@/lib/money';
import { radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

export default function CustomerInvoice() {
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
  const itemized = (state.materialsMode[invoice.id] ?? 'items') === 'items';
  const shown = itemized ? lines : lines.filter((l) => l.kind !== 'material');
  const pay = () => setPayTapped(true);

  return (
    <CustomerPage who={customer.firstName} tc={tc} expires={fc.date(addDays(sample.TODAY, 45))}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 2 }}>
          <T v="label">{tc('customer.invoiceNo', { n: invoice.number })}</T>
          <T v="small" muted>{tc('customer.forName', { name: customer.name })}</T>
          <T v="small" muted>{job.address}</T>
        </View>
        <View style={{ gap: 2, alignItems: 'flex-end' }}>
          <T v="small" muted>{tc('customer.sent', { date: fc.date(sample.TODAY) })}</T>
          <T v="label">{tc('customer.due', { date: fc.date(addDays(sample.TODAY, sample.business.dueDays)) })}</T>
        </View>
      </Row>

      <Card tone="accent" style={{ gap: 10, padding: 22, borderRadius: radius.lg }}>
        <T v="eyebrow" color={p.onAccent}>{tc('customer.amountDue')}</T>
        <T v="moneyBig" color={p.onAccent}>{fc.money(totals.due)}</T>
        <Button label={tc('customer.wallet')} variant="dark" big onPress={pay} />
        <Row gap={8}>
          <Button label={tc('customer.card')} variant="soft" flex style={{ backgroundColor: p.card }} onPress={pay} />
          <Button label={tc('customer.bank')} variant="soft" flex style={{ backgroundColor: p.card }} onPress={pay} />
        </Row>
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
        <LineRow label={tc('customer.taxMaterials', { pct: fc.pct(sample.business.tax.rateBps) })} value={fc.money(totals.tax)} />
        <Hair style={{ marginVertical: 6, backgroundColor: p.ink, height: 2 }} />
        <LineRow label={tc('customer.total')} value={fc.money(totals.total)} strong />
      </Card>

      <Card style={{ gap: 10 }}>
        <T v="eyebrow">{tc('customer.theWork')}</T>
        <Row gap={8}>
          <PhotoTile tag={tc('job.before')} height={120} />
          <PhotoTile tag={tc('job.after')} height={120} />
        </Row>
        <T v="body">{invoice.summary}</T>
      </Card>
    </CustomerPage>
  );
}
