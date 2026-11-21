import type { ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';

import type { JobScope } from '@/data/types';
import type { TFn } from '@/i18n';
import { addDays, type formatters } from '@/lib/format';
import { lineTotal, type LineKind, type TaxRule } from '@/lib/money';
import { radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { ScopeCard } from './job-scope';
import { LogoMark } from './logo';
import { Card, Hair, Icon, LineRow, Row, T } from './ui';

export interface InvoiceDocumentData {
  business: { name: string; phone: string; email?: string; address?: string };
  number: string;
  customerName: string;
  address?: string;
  workOrder?: string | null;
  issuedOn: string;
  dueDays: number;
  /** When the private link stops working (YYYY-MM-DD). */
  linkExpires: string;
  lines: { description: string; kind: LineKind; qtyHundredths: number; unitCents: number; unit?: string | null }[];
  /** Materials listed one by one, or as one total. */
  itemized: boolean;
  totals: { subtotal: number; tax: number; total: number; materials: number };
  tax: TaxRule;
  due: number;
  paid: boolean;
  /** A bank payment on its way. */
  pending: number;
  scope?: JobScope;
  excludedScope?: string[];
  summary: string;
}

/**
 * The invoice exactly as the customer sees it. The real customer page (/pay/<code>) and the
 * owner's preview both draw it from here, so they can't drift apart. Only the data source and
 * what the pay buttons do differ (`payment`).
 */
export function InvoiceDocument({ data, tc, fc, payment, photos, hasPhotos, paidLabel, onTheWayLabel, after }: {
  data: InvoiceDocumentData;
  /** Text and formats in the customer's language. */
  tc: TFn;
  fc: ReturnType<typeof formatters>;
  /** The pay choices: Bank transfer, Apple Pay / Google Pay, Alternate. */
  payment?: ReactNode;
  /** Before/after photos for "The work". */
  photos?: ReactNode;
  hasPhotos: boolean;
  paidLabel?: string;
  onTheWayLabel?: string;
  /** Below the invoice: download/print buttons. */
  after?: ReactNode;
}) {
  const p = usePalette();
  const { business, totals, tax } = data;
  const shown = data.itemized ? data.lines : data.lines.filter((l) => l.kind !== 'material');
  const taxKey = tax.rateBps > 0 && (tax.labor || tax.materials)
    ? tax.labor && tax.materials ? 'customer.taxAll' : tax.labor ? 'customer.taxLabor' : 'customer.taxMaterials'
    : null;
  const onTheWay = !data.paid && data.pending > 0;

  return <>
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      {/* the business's first letter until logo upload exists */}
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
        <T v="h3" color={p.onAccent}>{business.name.trim().charAt(0).toUpperCase() || 'K'}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T v="h3">{business.name}</T>
        {business.phone ? (
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${business.phone.replace(/[^\d+]/g, '')}`)}>
            <T v="small" muted style={{ textDecorationLine: 'underline' }}>{business.phone}</T>
          </Pressable>
        ) : null}
        {business.email ? (
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`mailto:${business.email}`)}>
            <T v="small" muted style={{ textDecorationLine: 'underline' }}>{business.email}</T>
          </Pressable>
        ) : null}
        {business.address ? <T v="small" muted>{business.address}</T> : null}
      </View>
    </Card>

    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <View style={{ gap: 2, flex: 1 }}>
        <T v="label">{tc('customer.invoiceNo', { n: data.number })}</T>
        <T v="small" muted>{tc('customer.forName', { name: data.customerName })}</T>
        {data.address ? <T v="small" muted>{data.address}</T> : null}
        {data.workOrder ? <T v="small" muted>{data.workOrder}</T> : null}
      </View>
      <View style={{ gap: 2, alignItems: 'flex-end' }}>
        <T v="small" muted>{tc('customer.sent', { date: fc.date(data.issuedOn) })}</T>
        <T v="label">{tc('customer.due', { date: fc.date(addDays(data.issuedOn, data.dueDays)) })}</T>
      </View>
    </Row>

    <Card tone="accent" style={{ gap: 10, padding: 22, borderRadius: radius.lg }}>
      {data.paid ? <>
        <T v="eyebrow" color={p.onAccent}>{tc('customer.total')}</T>
        <T v="moneyBig" color={p.onAccent}>{fc.money(totals.total)}</T>
        <Row gap={8}><Icon name="check-circle" color={p.onAccent} /><T v="label" color={p.onAccent}>{paidLabel ?? tc('pay.paid')}</T></Row>
      </> : <>
        <T v="eyebrow" color={p.onAccent}>{tc('customer.amountDue')}</T>
        <T v="moneyBig" color={p.onAccent}>{fc.money(onTheWay ? data.pending || data.due : data.due)}</T>
        {onTheWay ? <T v="label" color={p.onAccent}>{onTheWayLabel ?? tc('pay.onTheWay', { amount: fc.money(data.pending) })}</T> : null}
      </>}
    </Card>

    {payment}

    <Card style={{ gap: 6 }}>
      <T v="eyebrow">{tc('customer.payingFor')}</T>
      {shown.map((line, i) => (
        <LineRow key={i} label={line.description}
          sub={line.unit === 'hour' ? `${fc.qty(line.qtyHundredths)} h × ${fc.money(line.unitCents)}` : undefined}
          value={fc.money(lineTotal(line.qtyHundredths, line.unitCents))} />
      ))}
      {!data.itemized ? <LineRow label={tc('invoice.materials')} value={fc.money(totals.materials)} /> : null}
      <Hair style={{ marginVertical: 6 }} />
      <LineRow label={tc('customer.subtotal')} value={fc.money(totals.subtotal)} />
      {taxKey ? <LineRow label={tc(taxKey, { pct: fc.pct(tax.rateBps) })} value={fc.money(totals.tax)} /> : null}
      <Hair style={{ marginVertical: 6, backgroundColor: p.ink, height: 2 }} />
      <LineRow label={tc('customer.total')} value={fc.money(totals.total)} strong />
    </Card>

    <ScopeCard scope={data.scope} excluded={data.excludedScope} t={tc} />

    {data.summary.trim() || hasPhotos ? (
      <Card style={{ gap: 10 }}>
        <T v="eyebrow">{tc('customer.theWork')}</T>
        {hasPhotos ? photos : null}
        {data.summary.trim() ? <T v="body">{data.summary}</T> : null}
      </Card>
    ) : null}

    {after}
    <Hair />
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Row gap={6}>
        <Icon name="lock" size={14} color={p.muted} />
        <T v="small" muted>{tc('customer.privateLink', { date: fc.date(data.linkExpires) })}</T>
      </Row>
      <Row gap={6}>
        <LogoMark size={18} />
        <T v="small" muted>{tc('customer.sentWith')}</T>
      </Row>
    </View>
  </>;
}
