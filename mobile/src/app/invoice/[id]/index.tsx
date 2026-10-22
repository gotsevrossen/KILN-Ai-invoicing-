import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ScopeCard } from '@/components/job-scope';
import { needsActualHours } from '@/lib/billing';

import { Button, ButtonRow, Card, Checkbox, Field, Hair, Icon, IconButton, LineRow, Notice, PageHeader, PhotoTile, Pill, Row, Screen, Segmented, SwitchRow, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { changeOrdersForJob, customerOf, hoursFor, invoiceById, invoiceLines, invoiceTotals, jobById, receiptItemById, billedPrice, suggestionOpen, taxScope, invoiceSources, invoiceBilling, invoiceSummary, invoiceTax } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { addDays, useFormat } from '@/lib/format';
import { lineTotal } from '@/lib/money';
import { font, radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

export default function InvoiceDraft() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoice = invoiceById(id)!;
  const job = jobById(invoice.jobId);
  const customer = customerOf(job);
  const sent = state.sentInvoices.includes(invoice.id);
  const paid = state.paidInvoices.includes(invoice.id);
  const sources = invoiceSources(state, invoice);

  const summary = invoiceSummary(state, invoice);
  const billing = invoiceBilling(state, invoice);
  const issued = state.issuedInvoices[invoice.id];
  const agreed = !!state.estimates[job.id]?.signed;
  const missingHours = needsActualHours(job, state.estimates[job.id], billing, hoursFor(state, job.id));
  const pendingChange = changeOrdersForJob(job.id).find((change) => !state.signed[change.id] && !state.declinedChanges.includes(change.id));
  const [showLocation, setShowLocation] = useState(false);
  const [byText, setByText] = useState(true);
  const [byEmail, setByEmail] = useState(true);

  const lines = invoiceLines(state, invoice);
  const totals = invoiceTotals(state, invoice);
  const labor = lines.filter((l) => l.kind !== 'material');
  const materials = lines.filter((l) => l.kind === 'material');
  const mode = issued?.materialsMode ?? state.materialsMode[invoice.id] ?? 'items';
  const suggestion = invoice.suggestion;
  const showSuggestion = !sent && billing.materials === 'additional' && suggestion && suggestionOpen(state, invoice);
  const suggestionPrice = suggestion ? billedPrice(state, receiptItemById(suggestion.receiptItemId), job.id) : 0;
  const dueDays = issued?.dueDays ?? state.settings.dueDays;
  const dueDate = addDays(issued?.issuedOn ?? sample.TODAY, dueDays);
  const scope = taxScope(state, invoice);
  const tax = invoiceTax(state, invoice);
  const taxKey = scope === 'all' ? 'invoice.taxAll' : scope === 'labor' ? 'invoice.taxLabor' : scope === 'materials' ? 'invoice.taxMaterials' : null;

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
          <Notice text={t('flow.paidDone')} icon="check-circle" tone="accent" />
        ) : sent ? (
          <>
            <Notice text={t('invoice.sentDone', { name: customer.firstName })} icon="send" />
            <ButtonRow gap={10}>
              <Button label={t('invoice.seeAsCustomer', { name: customer.firstName })} variant="outline" icon="eye" flex onPress={() => router.push(`/customer/invoice/${invoice.id}`)} />
              <Button label={t('flow.markPaid')} icon="dollar-sign" variant="dark" flex onPress={() => actions.markPaid(invoice.id)} />
            </ButtonRow>
          </>
        ) : (
          <>
            <Row gap={16}>
              <View style={{ flex: 1 }}><Checkbox label={t('invoice.byText')} value={byText} onChange={setByText} /></View>
              <View style={{ flex: 1 }}><Checkbox label={t('invoice.byEmail')} value={byEmail} onChange={setByEmail} /></View>
            </Row>
            <Row gap={10}>
              <IconButton icon="eye" label={t('invoice.seeAsCustomer', { name: customer.firstName })} onPress={() => router.push(`/customer/invoice/${invoice.id}`)} />
              <Button
                label={t('invoice.sendTo', { name: customer.firstName })}
                icon="send"
                big
                flex
                disabled={(!byText && !byEmail) || !billing.reviewed || lines.length === 0 || !!pendingChange || missingHours}
                onPress={() => actions.sendInvoice(invoice.id)}
              />
            </Row>
          </>
        )
      }>
      <T v="small" muted>
        {t('invoice.builtFrom', {
          photos: sources.photos,
          voice: sources.voice,
          receipts: sources.receipts,
          hours: f.qty(hoursFor(state, job.id)),
        })}
      </T>

      {!sent && agreed ? <Card style={{ gap: 12 }}>
        <T v="h3">{t('review.billBasis')}</T>
        {job.pricing === 'hourly' ? <>
          <Segmented label={t('invoice.labor')} value={billing.labor} options={[
            { key: 'actual', label: t('review.actual') }, { key: 'estimate', label: t('review.estimate') },
          ]} onChange={(labor) => actions.setInvoiceBilling(invoice.id, { labor, reviewed: false })} />
          <T v="small" muted>{t('review.laborHelp')}</T>
        </> : null}
        <SwitchRow label={t('review.materialsIncluded')} value={billing.materials === 'included'}
          onChange={(included) => actions.setInvoiceBilling(invoice.id, { materials: included ? 'included' : 'additional', reviewed: false })} />
        <T v="small" muted>{t('review.materialsHelp')}</T>
        <Checkbox label={t('review.billingConfirmed')} value={billing.reviewed}
          onChange={(reviewed) => actions.setInvoiceBilling(invoice.id, { reviewed })} />
      </Card> : null}
      {!lines.length ? <Notice text={t('review.emptyInvoice')} tone="soft" /> : null}
      {missingHours ? <Notice text={t('review.hoursNeeded')} tone="soft" /> : null}
      {pendingChange ? <Button label={t('review.changePending')} variant="outline"
        onPress={() => router.push(`/change-order/${pendingChange.id}`)} /> : null}
      <ScopeCard scope={issued ? issued.scope : state.estimates[job.id]?.scope}
        excluded={issued ? issued.excludedScope : state.estimates[job.id]?.lines.filter((l) => l.excluded).map((l) => l.description)} t={t} />

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
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="eyebrow">{t('invoice.materials')}</T>
        </Row>
        {!sent ? <Segmented
          label={t('invoice.materials')}
          value={mode}
          onChange={(m) => actions.setMaterialsMode(invoice.id, m)}
          options={[
            { key: 'items', label: t('invoice.itemized') },
            { key: 'total', label: t('invoice.oneTotal') },
          ]}
        /> : null}
        {mode === 'items' ? (
          materials.map((line) => <LineRow key={line.id} label={line.description} value={f.money(lineTotal(line.qtyHundredths, line.unitCents))} />)
        ) : (
          <LineRow label={t('invoice.materials')} value={f.money(totals.materials)} />
        )}
        <T v="small" muted>{t('invoice.markupHidden', { pct: f.pct(state.settings.markupBps) })}</T>
        <Hair style={{ marginVertical: 8 }} />
        <LineRow label={t('invoice.subtotal')} value={f.money(totals.subtotal)} />
        {taxKey ? <LineRow label={t(taxKey, { pct: f.pct(tax.rateBps) })} value={f.money(totals.tax)} /> : null}
        <Row style={{ justifyContent: 'space-between', backgroundColor: p.inverse, borderRadius: radius.sm, padding: 16, marginTop: 8 }}>
          <T v="eyebrow" color={p.onInverse}>{t('invoice.total')}</T>
          <T v="money" color={p.onInverse} style={{ fontFamily: font.black, fontSize: 28 }}>{f.money(totals.total)}</T>
        </Row>
      </Card>

      <Card style={{ gap: 12 }}>
        <T v="eyebrow">{t('invoice.proof')}</T>
        <Row gap={8}>
          <PhotoTile tag={t('job.before')} height={110} />
          <PhotoTile tag={t('job.after')} height={110} />
        </Row>
        <Field label={t('invoice.summaryLabel')} value={summary} editable={!sent} maxLength={4000}
          onChangeText={(text) => actions.setInvoiceSummary(invoice.id, text)} multiline style={{ minHeight: 100, paddingTop: 14, textAlignVertical: 'top', fontSize: 16 }} />
        <SwitchRow label={t('invoice.showLocation')} value={showLocation} onChange={setShowLocation} />
      </Card>

      <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="body">{dueDays === 0 ? t('invoice.dueOnReceipt') : t('invoice.dueIn', { days: dueDays })}</T>
        <T v="money">{f.date(dueDate)}</T>
      </Card>
    </Screen>
  );
}
