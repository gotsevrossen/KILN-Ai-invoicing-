import { DeliveryStatus } from '@/components/delivery-status';
import { SendEstimateSheet } from '@/components/send-estimate';
import { OfflineStatus } from '@/components/offline-status';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { MissedItems } from '@/components/ai-parts';
import { EstimateLineRow, parseDollars, pickJobType, useEstimate, useLineMaker } from '@/components/estimate-parts';
import { FixList } from '@/components/fix-list';
import { PriceItemPicker } from '@/components/price-item-picker';
import { RecordGate } from '@/components/record-gate';
import { Sheet } from '@/components/sheet';
import { Button, ButtonRow, Card, Chip, Field, Hair, Icon, ListCard, ListRow, Notice, PageHeader, Row, Screen, T } from '@/components/ui';
import { aiReady } from '@/data/ai';
import { hasJob } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { assistantCopy, fillIn } from '@/i18n/assistant';
import { estimateReady } from '@/lib/billing';
import { useFormat } from '@/lib/format';
import { font } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/** Short enough for one summary row. */
function clip(text: string, max = 60): string {
  const s = text.trim().replace(/\s+/g, ' ');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Estimate builder: the line items, with job details, customer text, and deposit
 * each one tap away on their own page (like Settings).
 */
function EstimateBuilder() {
  const p = usePalette();
  const { t, lang } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { job, customer, draft, totals, issuedInvoice, locked } = useEstimate();
  const { unitLabel, fromItem, priceItem } = useLineMaker(customer.lang);

  const [sendOpen, setSendOpen] = useState(false);
  // opened by the KILN chat: check the estimate, then send it
  const chat = useLocalSearchParams<{ review?: string; send?: string }>();
  const [reviewOpen, setReviewOpen] = useState(chat.review === '1');
  const [listOpen, setListOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDesc, setCustomDesc] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  const trades = state.profile.trades;
  const { trade, jobType, isCustom } = pickJobType(trades, job.id, draft.scope);
  const hourly = job.pricing === 'hourly';
  const optionalFees = [...new Set([...(hourly ? ['trip'] : []), ...(isCustom ? [] : (jobType.extras ?? []))])]
    .filter((id) => !draft.lines.some((line) => line.priceItemId === id && !line.excluded));
  const ready = estimateReady(draft);
  // the marked rows above; the general rule covers anything else blocking Send
  const toFix = draft.lines.filter((l) => !l.excluded && (l.unitCents === null || l.qtyHundredths <= 0 || !l.description.trim())).length;
  const fixes = draft.lines.length === 0 || ready ? []
    : [{ key: 'lines', text: toFix ? t('estimate.linesToFix', { count: toFix }) : t('review.unresolved') }];
  const customCents = customPrice.trim() ? parseDollars(customPrice) : null;
  const customBad = customPrice.trim().length > 0 && customCents === null;

  const header = <PageHeader title={t('estimate.title')} sub={`${job.title} · ${customer.name}`} back={() => router.back()} />;

  if (locked) return <Screen header={header}>
    <DeliveryStatus jobId={job.id} refresh={sendOpen} />
    {draft.declinedAt ? <Notice text={lang === 'es' ? 'El cliente rechazó el presupuesto.' : 'The customer declined this estimate.'} tone="flag" /> : null}
    <Notice text={t('review.frozen')} tone="soft" />
    <T v="money">{f.money(totals.total)}</T>
    <Button label={issuedInvoice ? t('flow.viewInvoice') : t('estimate.preview')}
      onPress={() => router.push(issuedInvoice ? `/customer/invoice/${issuedInvoice.id}` : `/customer/estimate/${job.id}`)} />
    <SendEstimateSheet open={sendOpen} onClose={() => setSendOpen(false)} jobId={job.id} customer={customer} />
    {!draft.declinedAt ? <Button label={t('estimate.send')} icon="send" onPress={() => setSendOpen(true)} /> : null}
  </Screen>;

  const openDetails = () => router.push(`/estimate/${job.id}/details`);
  const typeName = isCustom ? t('estimate.customType') : t(`jobTypes.${jobType.id}` as 'jobTypes.leak');
  const detailsSub = draft.scope?.jobTypeId
    ? [trades.length > 1 ? t(`trades.${trade.id}`) : null, typeName].filter(Boolean).join(' · ')
    : t('estimate.detailsEmpty');
  const notes = draft.scope?.notes?.trim();

  return (
    <Screen
      header={header}
      footer={<>
        <Row style={{ justifyContent: 'space-between' }} gap={12}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="eyebrow" muted>{t('estimate.total')}</T>
            {draft.depositOn && totals.deposit > 0 ? <T v="small" muted>{t('estimate.depositLine', { amount: f.money(totals.deposit) })}</T> : null}
          </View>
          <T v="money" style={{ fontSize: 26, fontFamily: font.black }}>{f.money(totals.total)}</T>
        </Row>
        <ButtonRow gap={10}>
          <Button label={t('estimate.preview')} variant="outline" onPress={() => router.push(`/customer/estimate/${job.id}`)} />
          <Button label={t('estimate.send')} icon="send" flex big disabled={!ready} onPress={() => { if (state.mode === 'connected') setSendOpen(true); else void actions.sendEstimate(job.id).catch(() => {}); }} />
        </ButtonRow>
      </>}>

      <SendEstimateSheet open={sendOpen} onClose={() => setSendOpen(false)} jobId={job.id} customer={customer} />
      <OfflineStatus />
      {reviewOpen ? (
        <Card tone="accent" style={{ gap: 10 }}>
          <Row gap={8}><Icon name="zap" color={p.onAccent} /><T v="h3" color={p.onAccent} style={{ flex: 1 }}>{assistantCopy[lang].review}</T></Row>
          {!ready ? <T v="small" color={p.onAccent}>{assistantCopy[lang].reviewFix}</T> : null}
          <ButtonRow gap={10}>
            <Button label={assistantCopy[lang].reviewEdit} variant="outline" onPress={() => setReviewOpen(false)} />
            {chat.send === '1' ? <Button label={fillIn(assistantCopy[lang].reviewSend, { name: customer.firstName })} icon="send" variant="dark" flex disabled={!ready}
              onPress={() => { setReviewOpen(false); if (state.mode === 'connected') setSendOpen(true); else void actions.sendEstimate(job.id).catch(() => {}); }} /> : null}
          </ButtonRow>
        </Card>
      ) : null}
      <ListCard>
        <ListRow icon="clipboard" iconTone={draft.scope?.jobTypeId ? 'soft' : 'accent'} title={t('estimate.details')} sub={detailsSub} onPress={openDetails} />
      </ListCard>

      <T v="eyebrow" style={{ marginTop: 8 }}>{t('estimate.fromList')}</T>
      {draft.lines.length === 0 ? (
        <Card style={{ gap: 12 }}>
          <T v="body" muted>{t('estimate.empty')}</T>
          <Button label={t('estimate.startDetails')} icon="zap" variant="dark" onPress={openDetails} />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {draft.lines.map((line, i) => (
            <EstimateLineRow key={line.id} line={line} first={i === 0} unitLabel={unitLabel}
              onPress={() => router.push(`/estimate/${job.id}/line/${line.id}`)} />
          ))}
        </Card>
      )}
      <FixList items={fixes} />
      {aiReady(state.mode) ? (
        <MissedItems jobId={job.id} leaveOut={optionalFees} onAdd={(id) => actions.addLines(job.id, [fromItem(priceItem(id))])} />
      ) : null}
      {/* optional fees: one compact row of chips, not a stack of full-width buttons */}
      {optionalFees.length ? <View style={{ gap: 8 }}>
        <T v="eyebrow">{t('review.optionalFees')}</T>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {optionalFees.map((id) =>
            <Chip key={id} selected={false} label={`+ ${t(`items.${id}` as 'items.trip')}`}
              onPress={() => {
                const existing = draft.lines.find((line) => line.priceItemId === id && line.excluded);
                if (existing) actions.updateLine(job.id, existing.id, { excluded: false });
                else actions.addLines(job.id, [fromItem(priceItem(id))]);
              }} />)}
        </Row>
      </View> : null}
      <ButtonRow>
        <Button label={t('estimate.addFromList')} icon="list" variant="soft" flex style={{ backgroundColor: p.card }} onPress={() => setListOpen(true)} />
        <Button label={t('estimate.addCustom')} icon="plus" variant="soft" flex style={{ backgroundColor: p.card }} onPress={() => setCustomOpen(true)} />
      </ButtonRow>

      <ListCard style={{ marginTop: 8 }}>
        <ListRow icon="file-text" title={t('estimate.customerSees')} sub={notes ? clip(notes) : t('estimate.customerSeesEmpty')}
          onPress={() => router.push(`/estimate/${job.id}/scope`)} />
        <Hair />
        <ListRow icon="percent" title={t('estimate.deposit')}
          sub={draft.depositOn ? `${f.pct(draft.depositBps)}% · ${f.money(totals.deposit)}` : t('estimate.depositOff')}
          onPress={() => router.push(`/estimate/${job.id}/deposit`)} />
      </ListCard>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title={t('estimate.addFromList')} scroll={false}>
        <PriceItemPicker items={state.priceList} onPick={(item) => {
          actions.addLines(job.id, [fromItem(item)]);
          setListOpen(false);
        }} />
      </Sheet>

      <Sheet open={customOpen} onClose={() => setCustomOpen(false)} title={t('estimate.customTitle')}>
        <Field label={t('estimate.description')} value={customDesc} onChangeText={setCustomDesc} autoCapitalize="sentences" />
        <Field label={t('estimate.price')} value={customPrice} onChangeText={setCustomPrice} placeholder={t('estimate.pricePlaceholder')} keyboardType="decimal-pad" />
        {customBad ? <T v="small" color={p.danger}>{t('estimate.priceBad')}</T> : null}
        <Button
          label={t('estimate.addCustom')}
          icon="plus"
          disabled={customDesc.trim().length < 2 || customBad}
          onPress={() => {
            actions.addLines(job.id, [{ description: customDesc.trim(), unit: 'flat', qtyHundredths: 100, unitCents: customCents }]);
            setCustomDesc('');
            setCustomPrice('');
            setCustomOpen(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function EstimateBuilderRoute() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { state } = useStore();
  return <RecordGate found={() => hasJob(jobId)}><EstimateBuilder key={`${state.businessId ?? 'example'}:${jobId}`} /></RecordGate>;
}
