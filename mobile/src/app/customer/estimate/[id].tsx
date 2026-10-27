import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { CustomerPage } from '@/components/customer-page';
import { ScopeCard } from '@/components/job-scope';
import { estimateReady } from '@/lib/billing';
import { RecordGate } from '@/components/record-gate';
import { SignaturePad } from '@/components/signature-pad';
import { Button, Card, Checkbox, Field, Hair, LineRow, Notice, Row, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { customerOf, estimateDocLines, estimateDraft, hasCustomerEstimate, jobById } from '@/data/selectors';
import { useStore } from '@/data/store';
import type { DocLine } from '@/data/types';
import { useTFor } from '@/i18n';
import { addDays, formatters } from '@/lib/format';
import { documentTotals, lineTotal, percentOf } from '@/lib/money';
import { font, radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/** Customer estimate page. `id` is a sent estimate (e-208) or a job whose draft is being previewed (walsh). */
function CustomerEstimate() {
  const p = usePalette();
  const { state, actions } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();

  const saved = sample.customerEstimates.find((e) => e.id === id);
  const job = jobById(saved ? saved.jobId : id);
  const customer = customerOf(job);
  const tc = useTFor(customer.lang);
  const fc = formatters(customer.lang);

  // Incomplete drafts are clearly marked and cannot be accepted.
  const draft = saved ? null : estimateDraft(state, job.id);
  const lines: DocLine[] = saved ? saved.lines : estimateDocLines(draft!);
  // non-breaking hyphen keeps "E-208" on one line under the big title
  const number = (saved ? saved.number : draft?.number ?? 'E-209').replace('-', '‑');
  const goodUntil = saved ? saved.goodUntil : addDays(sample.TODAY, 14);
  const tax = saved ? saved.tax ?? { rateBps: 0, labor: false, materials: false } : draft?.tax ?? state.settings.tax;
  const totals = documentTotals(lines, tax);
  const total = totals.total;
  const askDeposit = draft ? draft.depositOn : true;
  const depositBps = draft ? draft.depositBps : state.settings.depositBps;
  const deposit = askDeposit ? percentOf(total, depositBps) : 0;

  const [name, setName] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);
  const canAccept = saved ? true : !!draft?.sent && !draft.signed && estimateReady(draft);
  const ready = canAccept && name.trim().length > 1 && hasInk && agreed;
  const unit = (l: DocLine) => (l.unit ? tc(`estimate.units.${l.unit}`) : '');

  return (
    <CustomerPage who={customer.firstName} tc={tc} expires={fc.date(goodUntil)} scrollEnabled={!drawing}>
      <View style={{ gap: 4 }}>
        <T v="title">{tc('customer.estimateNo', { n: number })}</T>
        <T v="small" muted>
          {tc('customer.forName', { name: customer.name })} · {job.address} · {tc('customer.goodUntil', { date: fc.date(goodUntil) })}
        </T>
      </View>

      {!saved && !draft?.sent ? <Notice text={tc('review.previewOnly')} tone="soft" /> : null}
      {draft?.signed ? <Notice text={tc('review.accepted')} /> : null}
      {draft && !estimateReady(draft) ? <Notice text={tc('review.unresolved')} tone="soft" /> : null}
      <ScopeCard scope={draft?.scope} excluded={draft?.lines.filter((line) => line.excluded).map((line) => line.description)} t={tc} />
      <Card style={{ gap: 6 }}>
        {lines.map((l) => (
          <LineRow
            key={l.id}
            label={l.description}
            sub={l.unit && l.unit !== 'flat' ? `${fc.qty(l.qtyHundredths)} ${unit(l)} × ${fc.money(l.unitCents)}` : undefined}
            value={fc.money(lineTotal(l.qtyHundredths, l.unitCents))}
          />
        ))}
        <Hair style={{ marginVertical: 6, backgroundColor: p.ink, height: 2 }} />
        {totals.tax > 0 ? <>
          <LineRow label={tc('invoice.subtotal')} value={fc.money(totals.subtotal)} />
          <LineRow label={tc('customer.taxAll', { pct: fc.pct(tax.rateBps) })} value={fc.money(totals.tax)} />
        </> : null}
        <LineRow label={tc('customer.total')} value={fc.money(total)} strong />
      </Card>

      {askDeposit ? (
        <Card tone="inverse" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="label" color={p.onInverse}>{tc('customer.depositTitle', { pct: fc.pct(depositBps) })}</T>
            <T v="small" color={p.onInverseMuted}>{tc('customer.depositSub')}</T>
          </View>
          <T v="money" color={p.onInverse} style={{ fontFamily: font.black, fontSize: 24 }}>{fc.money(deposit)}</T>
        </Card>
      ) : null}

      {done ? (
        <Notice text={askDeposit ? tc('customer.signedDeposit', { business: state.profile.businessName }) : tc('customer.signed')} icon="check-circle" />
      ) : canAccept ? (
        <>
          <Field label={tc('customer.yourName')} value={name} onChangeText={setName} placeholder={tc('customer.namePlaceholder')} autoComplete="name" />
          <View style={{ gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="label">{tc('customer.signFinger')}</T>
              <Pressable onPress={() => { setPadKey((k) => k + 1); setHasInk(false); }} accessibilityRole="button" style={{ minHeight: tap.min, justifyContent: 'center', paddingHorizontal: 8 }}>
                <T v="label" style={{ textDecorationLine: 'underline' }}>{tc('changeOrder.clear')}</T>
              </Pressable>
            </Row>
            <SignaturePad key={padKey} placeholder={tc('customer.signHere')} label={tc('customer.signFinger')} onInk={() => setHasInk(true)} onDrawing={setDrawing} />
          </View>
          <Checkbox
            label={tc('customer.accept', { total: fc.money(total), deposit: fc.money(deposit) })}
            value={agreed}
            onChange={setAgreed}
          />
          <Button label={tc('customer.signPay')} big disabled={!ready} onPress={() => {
              // signing a draft moves the job on to the work step
              if (!saved) actions.signEstimate(job.id, name.trim());
              setDone(true);
            }} style={{ borderRadius: radius.sm }} />
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ minHeight: tap.min, alignItems: 'center', justifyContent: 'center' }}>
            <T v="label" style={{ textDecorationLine: 'underline' }}>{tc('customer.decline')}</T>
          </Pressable>
        </>
      ) : null}
    </CustomerPage>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function CustomerEstimateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasCustomerEstimate(id)}><CustomerEstimate /></RecordGate>;
}
