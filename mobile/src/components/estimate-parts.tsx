import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import * as sample from '@/data/sample';
import { customerOf, estimateDraft, estimateTotals, jobById } from '@/data/selectors';
import { useStore, type EstimateLine } from '@/data/store';
import { ITEM_UNITS, tradeById, type TradeId } from '@/data/trades';
import type { JobScope, PriceItem, Unit } from '@/data/types';
import { useLang, useTFor, type Lang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { priceLooksOff, usualPrice } from '@/lib/billing';
import { lineTotal } from '@/lib/money';
import { usePalette } from '@/theme/use-palette';

import { Icon, Notice, PageHeader, Pill, Screen, T } from './ui';

/** Job type id for "Custom": a job none of the trade's job types fit. */
export const CUSTOM = 'custom';

/** "2.5" -> 250 hundredths. Above 0, up to two decimals. */
export function parseQty(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return n > 0 ? n : null;
}

/** "$45" or "45.50" -> cents, or null. */
export function parseDollars(text: string): number | null {
  const s = text.replace(/[$,\s]/g, '');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return n >= 0 ? n : null;
}

/** "35" -> 3500 bps. Whole percents from 1 to 100, else null. */
export function parsePercent(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= 1 && n <= 100 ? n * 100 : null;
}

/** The estimate the current page is about (the job id in the address). */
export function useEstimate() {
  const { state } = useStore();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const job = jobById(jobId);
  const draft = estimateDraft(state, job.id);
  const issuedInvoice = sample.invoices.find((invoice) => invoice.jobId === job.id && state.sentInvoices.includes(invoice.id));
  return {
    job,
    customer: customerOf(job),
    draft,
    totals: estimateTotals(state, job.id),
    issuedInvoice,
    // a sent estimate, or one already on a sent invoice, can't change
    locked: draft.sent || !!issuedInvoice,
  };
}

/** The trade and job type saved on the estimate, or the first ones the owner does. */
export function pickJobType(trades: TradeId[], jobId: string, scope?: JobScope) {
  const saved = scope?.tradeId && trades.includes(scope.tradeId) ? scope.tradeId : undefined;
  const trade = tradeById(saved ?? (trades.includes('carpentry') && jobId === 'walsh' ? 'carpentry' : trades[0]));
  const jobTypeId = saved && scope?.jobTypeId ? scope.jobTypeId : trade.jobTypes[0].id;
  const isCustom = jobTypeId === CUSTOM;
  const jobType = trade.jobTypes.find((jt) => jt.id === jobTypeId) ?? trade.jobTypes[0];
  return { trade, jobTypeId, isCustom, jobType };
}

/** Turns price list items into estimate lines, with descriptions in the customer's language. */
export function useLineMaker(customerLang: Lang) {
  const { t } = useLang();
  const tc = useTFor(customerLang);
  const { state } = useStore();
  const unitLabel = (u: Unit) => (u === 'flat' ? '' : t(`estimate.units.${u}`));
  const fromItem = (item: PriceItem, qtyHundredths = 100): Omit<EstimateLine, 'id'> => ({
    priceItemId: item.id,
    description: ITEM_UNITS[item.id] ? tc(`items.${item.id}` as 'items.trip') : item.name,
    kind: ['trip', 'diag', 'haul'].includes(item.id) ? 'fee' : 'labor',
    unit: item.unit,
    qtyHundredths,
    unitCents: item.unitCents,
  });
  /** The owner's price list item, or the starter item (no price yet) if they removed it. */
  const priceItem = (id: string): PriceItem =>
    state.priceList.find((x) => x.id === id) ?? { id, name: t(`items.${id}` as 'items.trip'), unit: ITEM_UNITS[id] ?? 'flat', unitCents: null };
  return { unitLabel, fromItem, priceItem };
}

/** An estimate page below the builder: the job in the header, and locked once the estimate is issued. */
export function EstimatePage({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) {
  const { t } = useLang();
  const { job, customer, locked } = useEstimate();
  return (
    <Screen
      header={<PageHeader title={title} sub={`${job.title} · ${customer.name}`} back={() => router.back()} />}
      footer={locked ? undefined : footer}>
      {locked ? <Notice text={t('review.frozen')} tone="soft" /> : children}
    </Screen>
  );
}

/** One estimate line as a short row: what it is, how many at what price, and its total. Tap to edit. */
export function EstimateLineRow({ line, unitLabel, first, onPress }: {
  line: EstimateLine; unitLabel: (u: Unit) => string; first?: boolean; onPress: () => void;
}) {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state } = useStore();
  const kind = line.kind ?? 'labor';
  const unit = unitLabel(line.unit);
  const qty = `${f.qty(line.qtyHundredths)}${unit ? ` ${unit}` : ''}`;
  const priced = line.unitCents !== null;
  const needsFix = !line.excluded && (!priced || line.qtyHundredths <= 0 || !line.description.trim());
  // a likely typo ($15 for a $150 item); the owner can keep it
  const checkPrice = !line.excluded && priceLooksOff(line.unitCents, usualPrice(line, state.priceList));
  const sub = [
    kind !== 'labor' ? t(`review.${kind}`) : null,
    line.unitCents !== null ? `${qty} × ${f.money(line.unitCents)}` : qty,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={line.description || t('estimate.description')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 64,
        paddingVertical: 8,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: p.line,
        opacity: pressed ? 0.7 : 1,
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" numberOfLines={2} muted={line.excluded || !line.description.trim()}
          style={{ fontSize: 16, textDecorationLine: line.excluded ? 'line-through' : 'none' }}>
          {line.description.trim() || t('estimate.description')}
        </T>
        <T v="small" muted>{sub}</T>
      </View>
      {line.excluded ? (
        <Pill label={t('estimate.excludedPill')} tone="outline" />
      ) : needsFix ? (
        <Pill label={priced ? t('estimate.needsFix') : t('estimate.needsPrice')} tone="flag" />
      ) : (
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {checkPrice ? <Pill label={t('estimate.priceOffShort')} tone="flag" /> : null}
          <T v="money">{f.money(lineTotal(line.qtyHundredths, line.unitCents ?? 0))}</T>
        </View>
      )}
      <Icon name="chevron-right" size={22} color={p.muted} />
    </Pressable>
  );
}
