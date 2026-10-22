import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { CUSTOM, EstimatePage, parseQty, pickJobType, useEstimate, useLineMaker } from '@/components/estimate-parts';
import { PriceItemPicker } from '@/components/price-item-picker';
import { RecordGate } from '@/components/record-gate';
import { Sheet } from '@/components/sheet';
import { Button, Card, Chip, Icon, IconButton, Row, T } from '@/components/ui';
import { hasJob } from '@/data/selectors';
import * as sample from '@/data/sample';
import { useStore } from '@/data/store';
import { tradeById, type TradeId } from '@/data/trades';
import type { JobScope } from '@/data/types';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { font, radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/** Job details: trade, job type, and the quantities that become owner-priced line items. */
function EstimateDetails() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { job, customer, draft } = useEstimate();
  const { unitLabel, fromItem, priceItem } = useLineMaker(customer.lang);

  const trades = state.profile.trades;
  const { trade, jobTypeId, isCustom, jobType } = pickJobType(trades, job.id, draft.scope);
  const setScope = (patch: Partial<JobScope>) =>
    actions.updateEstimate(job.id, { scope: { ...draft.scope, tradeId: trade.id, jobTypeId, ...patch } });

  // hourly jobs: hours go in the hours box at the top, so labor isn't asked twice
  const hourly = job.pricing === 'hourly';
  const laborItem = priceItem('labor');
  // the job's own rate first, then the labor price on the price list
  const hourlyRate = job.rateCents ?? laborItem.unitCents;

  // reopening the page shows the quantities already on the estimate
  const onEstimate = draft.lines.filter((l) => l.priceItemId && !l.excluded);
  const [hoursText, setHoursText] = useState(() => {
    const labor = onEstimate.find((l) => l.priceItemId === 'labor');
    return hourly && labor ? String(labor.qtyHundredths / 100) : '';
  });
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(onEstimate.map((l) => [l.priceItemId!, String(l.qtyHundredths / 100)])));
  // the job type's own questions, plus items the owner adds (a Custom job has only added ones)
  const baseAsk = isCustom ? [] : jobType.ask;
  const [extraAsk, setExtraAsk] = useState<string[]>(() =>
    [...new Set(onEstimate.filter((l) => l.kind !== 'fee').map((l) => l.priceItemId!))].filter((id) => !baseAsk.includes(id)));
  const [pickOpen, setPickOpen] = useState(false);
  const asks = [...new Set([...baseAsk, ...extraAsk])].filter((id) => !(hourly && id === 'labor'));

  const voice = sample.timeline.filter((x) => x.jobId === job.id && x.kind === 'voice');
  const photoCount = sample.timeline.reduce((a, x) => (x.jobId === job.id && x.kind === 'photos' ? a + x.tags.length : a), 0);

  // Quantities become owner-priced lines. Descriptive scope is retained verbatim;
  // this builder does not interpret voice recordings or photos.
  const build = () => {
    if (hourly) {
      const hours = parseQty(hoursText);
      if (hours !== null) {
        const existing = draft.lines.find((l) => l.priceItemId === 'labor');
        if (existing) actions.updateLine(job.id, existing.id, { qtyHundredths: hours, unitCents: hourlyRate });
        else actions.addLines(job.id, [{ ...fromItem(laborItem, hours), unitCents: hourlyRate }]);
      }
    }
    for (const id of asks) {
      const qty = parseQty(answers[id] ?? '');
      if (qty === null) continue;
      const existing = draft.lines.find((l) => l.priceItemId === id);
      if (existing) actions.updateLine(job.id, existing.id, { qtyHundredths: qty });
      else actions.addLines(job.id, [fromItem(priceItem(id), qty)]);
    }
    setScope({});
    router.back();
  };

  const qtyBox = { width: 86, minHeight: tap.min, borderRadius: radius.xs, backgroundColor: p.ground, textAlign: 'right' as const, paddingHorizontal: 12, fontFamily: font.bold, fontSize: 18, color: p.ink };

  return (
    <EstimatePage title={t('estimate.details')} footer={<Button label={t('estimate.build')} icon="zap" big onPress={build} />}>
      {/* three separate questions: which trade, which kind of job, and how much */}
      {trades.length > 1 ? (
        <Card style={{ gap: 12 }}>
          <T v="eyebrow">{t('estimate.tradeHeading')}</T>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {trades.map((id: TradeId) => (
              <Chip key={id} label={t(`trades.${id}`)} selected={id === trade.id} onPress={() => setScope({ tradeId: id, jobTypeId: tradeById(id).jobTypes[0].id })} />
            ))}
          </Row>
        </Card>
      ) : null}

      <Card style={{ gap: 12 }}>
        <T v="eyebrow">{t('estimate.jobTypeHeading')}</T>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {trade.jobTypes.map((jt) => (
            <Chip key={jt.id} label={t(`jobTypes.${jt.id}` as 'jobTypes.leak')} selected={!isCustom && jt.id === jobType.id}
              onPress={() => setScope({ jobTypeId: jt.id })} />
          ))}
          <Chip label={t('estimate.customType')} selected={isCustom} onPress={() => setScope({ jobTypeId: CUSTOM })} />
        </Row>
        {isCustom ? <T v="small" muted>{t('estimate.customTypeHelp')}</T> : null}
      </Card>

      <Card style={{ gap: 0 }}>
        <View style={{ gap: 2, paddingBottom: 8 }}>
          <T v="eyebrow">{t('estimate.qtyHeading')}</T>
          <T v="small" muted>{t('estimate.qtyHelp')}</T>
        </View>
        {hourly ? (
          <Row style={{ minHeight: 64, borderTopWidth: 1, borderTopColor: p.line, justifyContent: 'space-between' }} gap={10}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="body">{t('estimate.hoursLabel')}</T>
              <T v="small" muted>{hourlyRate !== null ? t('estimate.hoursAt', { rate: f.money(hourlyRate) }) : t('settings.needsPrice')}</T>
            </View>
            <TextInput value={hoursText} onChangeText={setHoursText} keyboardType="decimal-pad" accessibilityLabel={t('estimate.hoursLabel')}
              placeholder="0" placeholderTextColor={p.muted} selectTextOnFocus style={qtyBox} />
            <T v="small" muted style={{ width: 64 }}>{unitLabel('hour')}</T>
          </Row>
        ) : null}
        {asks.map((id) => {
          const item = priceItem(id);
          return (
            <Row key={id} style={{ minHeight: 64, borderTopWidth: 1, borderTopColor: p.line, justifyContent: 'space-between' }} gap={10}>
              {extraAsk.includes(id) ? (
                <IconButton icon="x" label={t('estimate.remove', { item: item.name })} onPress={() => setExtraAsk((ids) => ids.filter((x) => x !== id))} />
              ) : null}
              <T v="body" style={{ flex: 1 }}>{item.name}</T>
              <TextInput value={answers[id] ?? ''} onChangeText={(text) => setAnswers((a) => ({ ...a, [id]: text }))} keyboardType="decimal-pad"
                accessibilityLabel={item.name} placeholder="0" placeholderTextColor={p.muted} selectTextOnFocus style={qtyBox} />
              <T v="small" muted style={{ width: 64 }}>{unitLabel(item.unit)}</T>
            </Row>
          );
        })}
        <View style={{ paddingTop: 10 }}>
          <Button label={t('estimate.pickItem')} icon="plus" variant="outline" onPress={() => setPickOpen(true)} />
        </View>
      </Card>
      {voice.length || photoCount ? (
        <Row gap={8}>
          <Icon name="mic" size={16} color={p.muted} />
          <T v="small" muted style={{ flex: 1 }}>{t('review.inputs', { voice: voice.length, photos: photoCount })}</T>
        </Row>
      ) : null}

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title={t('estimate.pickItem')} scroll={false}>
        <PriceItemPicker
          items={state.priceList.filter((item) => !asks.includes(item.id) && !(hourly && item.id === 'labor'))}
          onPick={(item) => {
            setExtraAsk((ids) => [...ids, item.id]);
            setPickOpen(false);
          }}
        />
      </Sheet>
    </EstimatePage>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function EstimateDetailsRoute() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  return <RecordGate found={() => hasJob(jobId)}><EstimateDetails /></RecordGate>;
}
