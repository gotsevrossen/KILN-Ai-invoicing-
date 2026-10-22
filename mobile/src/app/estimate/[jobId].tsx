import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Button, ButtonRow, Card, Chip, Field, Icon, IconButton, ListRow, Notice, PageHeader, Row, Screen, SwitchRow, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { customerOf, estimateDraft, estimateTotals, jobById } from '@/data/selectors';
import { useStore, type EstimateLine } from '@/data/store';
import { ITEM_UNITS, tradeById, type TradeId } from '@/data/trades';
import type { PriceItem, Unit } from '@/data/types';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { lineTotal } from '@/lib/money';
import { font, radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/** Job type id for "Custom": a job none of the trade's job types fit. */
const CUSTOM = 'custom';

/** Hourly jobs: trips the estimate counts. Fixed at 1 for now. */
const ESTIMATED_TRIPS = 1;

/** Quick deposit choices, in basis points (3000 = 30%). */
const DEPOSIT_CHOICES = [1000, 2500, 3000, 5000];

/** "35" -> 3500 bps. Whole percents from 1 to 100, else null. */
function parsePercent(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= 1 && n <= 100 ? n * 100 : null;
}

/** "2.5" -> 250 hundredths. Above 0, up to two decimals. */
function parseQty(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return n > 0 ? n : null;
}

/** "$45" or "45.50" -> cents, or null. */
function parseDollars(text: string): number | null {
  const s = text.replace(/[$,\s]/g, '');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return n > 0 ? n : null;
}

/** One line on the estimate: quantity box, price, total, remove. Unpriced lines ask for a price. */
function LineEditor({ jobId, line, first }: { jobId: string; line: EstimateLine; first: boolean }) {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { actions } = useStore();
  const [qtyText, setQtyText] = useState(f.qty(line.qtyHundredths).replace(/,/g, ''));
  const [priceText, setPriceText] = useState('');
  const unitLabel = line.unit === 'flat' ? '' : t(`estimate.units.${line.unit}`);
  const priceCents = parseDollars(priceText);

  return (
    <View style={{ gap: 10, borderTopWidth: first ? 0 : 1, borderTopColor: p.line, paddingTop: first ? 0 : 12 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={8}>
        <T v="label" style={{ flex: 1, fontSize: 16, marginTop: 12 }}>{line.description}</T>
        <IconButton icon="x" label={t('estimate.remove', { item: line.description })} onPress={() => actions.removeLine(jobId, line.id)} />
      </Row>

      {line.unitCents === null ? (
        <View style={{ gap: 10, backgroundColor: p.flag, borderRadius: radius.sm, padding: 12 }}>
          <Row gap={8} style={{ alignItems: 'flex-start' }}>
            <Icon name="alert-triangle" size={20} color={p.onFlag} />
            <T v="body" color={p.onFlag} style={{ flex: 1 }}>{line.fromVoice ? t('estimate.noPrice') : t('estimate.noPriceGeneric')}</T>
          </Row>
          <Row gap={8}>
            <View style={{ flex: 1 }}>
              <Field value={priceText} onChangeText={setPriceText} placeholder={t('estimate.pricePlaceholder')} keyboardType="decimal-pad" accessibilityLabel={t('estimate.price')} style={{ borderColor: p.ink }} />
            </View>
            <Button label={t('estimate.saveToList')} variant="dark" disabled={priceCents === null} onPress={() => {
              actions.updateLine(jobId, line.id, { unitCents: priceCents });
              if (line.priceItemId) actions.setPrice(line.priceItemId, priceCents);
            }} />
          </Row>
        </View>
      ) : (
        <Row gap={8} style={{ justifyContent: 'space-between' }}>
          <Row gap={8} style={{ flexShrink: 1 }}>
            {line.unit === 'flat' ? null : (
              <TextInput
                value={qtyText}
                onChangeText={(text) => {
                  setQtyText(text);
                  const q = parseQty(text);
                  if (q !== null) actions.updateLine(jobId, line.id, { qtyHundredths: q });
                }}
                keyboardType="decimal-pad"
                accessibilityLabel={`${t('estimate.qty')}: ${line.description}`}
                selectTextOnFocus
                style={{ width: 84, minHeight: tap.min, borderRadius: radius.xs, backgroundColor: p.ground, textAlign: 'right', paddingHorizontal: 12, fontFamily: font.bold, fontSize: 18, color: p.ink }}
              />
            )}
            <T v="small" muted style={{ flexShrink: 1 }}>
              {line.unit === 'flat' ? f.money(line.unitCents) : `${unitLabel} × ${f.money(line.unitCents)}`}
            </T>
          </Row>
          <T v="money" style={{ fontSize: 18 }}>{f.money(lineTotal(line.qtyHundredths, line.unitCents))}</T>
        </Row>
      )}
      {line.unit !== 'flat' && line.unitCents !== null && parseQty(qtyText) === null ? (
        <T v="small" color={p.danger}>{t('logHours.bad')}</T>
      ) : null}
    </View>
  );
}

export default function EstimateBuilder() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const job = jobById(jobId);
  const customer = customerOf(job);
  const draft = estimateDraft(state, job.id);
  const totals = estimateTotals(state, job.id);

  const voice = sample.timeline.filter((x) => x.jobId === job.id && x.kind === 'voice');
  const photoCount = sample.timeline.reduce((a, x) => (x.jobId === job.id && x.kind === 'photos' ? a + x.tags.length : a), 0);
  const firstVoice = voice[0];

  const trades = state.profile.trades;
  const [tradeId, setTradeId] = useState<TradeId>(trades.includes('carpentry') && job.id === 'walsh' ? 'carpentry' : trades[0]);
  const trade = tradeById(trades.includes(tradeId) ? tradeId : trades[0]);
  const [jobTypeId, setJobTypeId] = useState<string>(trade.jobTypes[0].id);
  const isCustom = jobTypeId === CUSTOM;
  const jobType = trade.jobTypes.find((jt) => jt.id === jobTypeId) ?? trade.jobTypes[0];
  // Custom job: the owner picks which price list items to give quantities for
  const [customAsk, setCustomAsk] = useState<string[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  // hourly jobs: hours go in the hours box at the top, so labor isn't asked twice
  const hourly = job.pricing === 'hourly';
  const [hoursText, setHoursText] = useState('');
  const asks = (isCustom ? customAsk : jobType.ask).filter((id) => !(hourly && id === 'labor'));
  const extrasFor = isCustom ? [] : (jobType.extras ?? []);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState(firstVoice && firstVoice.kind === 'voice' ? firstVoice.transcript : '');
  const [built, setBuilt] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDesc, setCustomDesc] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');

  const unitLabel = (u: Unit) => (u === 'flat' ? '' : t(`estimate.units.${u}`));
  const fromItem = (item: PriceItem, qtyHundredths = 100): Omit<EstimateLine, 'id'> => ({
    priceItemId: item.id,
    description: item.name,
    unit: item.unit,
    qtyHundredths,
    unitCents: item.unitCents,
  });
  /** The owner's price list item, or the starter item (no price yet) if they removed it. */
  const priceItem = (id: string): PriceItem =>
    state.priceList.find((x) => x.id === id) ?? { id, name: t(`items.${id}` as 'items.trip'), unit: ITEM_UNITS[id] ?? 'flat', unitCents: null };
  const laborItem = priceItem('labor');
  const tripItem = priceItem('trip');
  // the job's own rate first, then the labor price on the price list
  const hourlyRate = job.rateCents ?? laborItem.unitCents;

  // Example stand-in for the AI: quantities the owner typed become lines from their price list.
  // The real app also reads the description, voice notes, and photos.
  const build = () => {
    // items this build already handled, so an extra (like the trip fee) isn't added twice
    const handled = new Set<string>();
    if (hourly) {
      const hours = parseQty(hoursText);
      if (hours !== null) {
        const existing = draft.lines.find((l) => l.priceItemId === 'labor');
        if (existing) actions.updateLine(job.id, existing.id, { qtyHundredths: hours, unitCents: hourlyRate });
        else actions.addLines(job.id, [{ ...fromItem(laborItem, hours), unitCents: hourlyRate }]);
        handled.add('labor');
      }
      if (!draft.lines.some((l) => l.priceItemId === 'trip')) actions.addLines(job.id, [fromItem(tripItem, ESTIMATED_TRIPS * 100)]);
      handled.add('trip');
    }
    for (const id of asks) {
      const qty = parseQty(answers[id] ?? '');
      if (qty === null) continue;
      const existing = draft.lines.find((l) => l.priceItemId === id);
      if (existing) actions.updateLine(job.id, existing.id, { qtyHundredths: qty });
      else actions.addLines(job.id, [fromItem(priceItem(id), qty)]);
      handled.add(id);
    }
    const extras = extrasFor.filter((id) => !handled.has(id) && !draft.lines.some((l) => l.priceItemId === id));
    actions.addLines(job.id, extras.map((id) => fromItem(priceItem(id))));
    setBuilt(true);
  };

  const customCents = customPrice.trim() ? parseDollars(customPrice) : null;
  const customBad = customPrice.trim().length > 0 && customCents === null;
  const hasPriced = draft.lines.some((l) => l.unitCents !== null);

  return (
    <Screen
      header={
        <PageHeader title={t('estimate.title')} sub={`${job.title} · ${customer.name}`} back={() => router.back()} />
      }
      footer={
        draft.sent ? (
          <>
            <Notice
              text={draft.signed ? t('estimate.signedNotice', { name: customer.name }) : t('estimate.sent', { name: customer.firstName })}
              icon={draft.signed ? 'check-circle' : 'send'}
              tone={draft.signed ? 'accent' : 'inverse'}
            />
            <Button label={t('estimate.preview')} variant="outline" icon="eye" onPress={() => router.push(`/customer/estimate/${job.id}`)} />
          </>
        ) : (
          <ButtonRow gap={10}>
            <Button label={t('estimate.preview')} variant="outline" onPress={() => router.push(`/customer/estimate/${job.id}`)} />
            <Button label={t('estimate.send')} icon="send" flex big disabled={!hasPriced} onPress={() => actions.updateEstimate(job.id, { sent: true })} />
          </ButtonRow>
        )
      }>

      <T v="eyebrow">{t('estimate.details')}</T>
      {hourly ? (
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          <Row style={{ minHeight: 64, justifyContent: 'space-between' }} gap={10}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="body">{t('estimate.hoursLabel')}</T>
              <T v="small" muted>{hourlyRate !== null ? t('estimate.hoursAt', { rate: f.money(hourlyRate) }) : t('settings.needsPrice')}</T>
            </View>
            <TextInput
              value={hoursText}
              onChangeText={setHoursText}
              keyboardType="decimal-pad"
              accessibilityLabel={t('estimate.hoursLabel')}
              placeholder="0"
              placeholderTextColor={p.muted}
              selectTextOnFocus
              style={{ width: 86, minHeight: tap.min, borderRadius: radius.xs, backgroundColor: p.ground, textAlign: 'right', paddingHorizontal: 12, fontFamily: font.bold, fontSize: 18, color: p.ink }}
            />
            <T v="small" muted style={{ width: 64 }}>{unitLabel('hour')}</T>
          </Row>
          {/* trips are fixed for now; the estimate always counts this many */}
          <Row style={{ minHeight: 64, borderTopWidth: 1, borderTopColor: p.line, justifyContent: 'space-between' }} gap={10}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="body">{t('estimate.trips')}</T>
              <T v="small" muted>{tripItem.unitCents !== null ? t('estimate.tripsAt', { price: f.money(tripItem.unitCents) }) : t('settings.needsPrice')}</T>
            </View>
            <T v="money" style={{ width: 86, textAlign: 'right', paddingHorizontal: 12, fontSize: 18 }}>{ESTIMATED_TRIPS}</T>
            <View style={{ width: 64 }} />
          </Row>
        </Card>
      ) : null}
      {trades.length > 1 ? (
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {trades.map((id) => (
            <Chip
              key={id}
              label={t(`trades.${id}`)}
              selected={id === trade.id}
              onPress={() => {
                setTradeId(id);
                setJobTypeId(tradeById(id).jobTypes[0].id);
              }}
              onPage
            />
          ))}
        </Row>
      ) : null}
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {trade.jobTypes.map((jt) => (
          <Chip key={jt.id} label={t(`jobTypes.${jt.id}` as 'jobTypes.leak')} selected={!isCustom && jt.id === jobType.id} onPress={() => setJobTypeId(jt.id)} onPage />
        ))}
        <Chip label={t('estimate.customType')} selected={isCustom} onPress={() => setJobTypeId(CUSTOM)} onPage />
      </Row>
      {isCustom ? <T v="small" muted>{t('estimate.customTypeHelp')}</T> : null}
      {asks.length ? (
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {asks.map((id, i) => {
            const item = priceItem(id);
            return (
              <Row key={id} style={{ minHeight: 64, borderTopWidth: i ? 1 : 0, borderTopColor: p.line, justifyContent: 'space-between' }} gap={10}>
                {isCustom ? (
                  <IconButton icon="x" label={t('estimate.remove', { item: item.name })} onPress={() => setCustomAsk((ids) => ids.filter((x) => x !== id))} />
                ) : null}
                <T v="body" style={{ flex: 1 }}>{item.name}</T>
                <TextInput
                  value={answers[id] ?? ''}
                  onChangeText={(text) => setAnswers((a) => ({ ...a, [id]: text }))}
                  keyboardType="decimal-pad"
                  accessibilityLabel={item.name}
                  placeholder="0"
                  placeholderTextColor={p.muted}
                  selectTextOnFocus
                  style={{ width: 86, minHeight: tap.min, borderRadius: radius.xs, backgroundColor: p.ground, textAlign: 'right', paddingHorizontal: 12, fontFamily: font.bold, fontSize: 18, color: p.ink }}
                />
                <T v="small" muted style={{ width: 64 }}>{unitLabel(item.unit)}</T>
              </Row>
            );
          })}
        </Card>
      ) : null}
      {isCustom ? (
        <Button label={t('estimate.pickItem')} icon="plus" variant="soft" style={{ backgroundColor: p.card }} onPress={() => setPickOpen(true)} />
      ) : null}
      <Field label={t('estimate.notesLabel')} value={notes} onChangeText={setNotes} placeholder={t('estimate.notesPlaceholder')} multiline style={{ minHeight: 96, paddingTop: 14, textAlignVertical: 'top', fontSize: 16 }} />
      {voice.length || photoCount ? (
        <Row gap={8}>
          <Icon name="mic" size={16} color={p.muted} />
          <T v="small" muted>{t('estimate.alsoUsing', { voice: voice.length, photos: photoCount })}</T>
        </Row>
      ) : null}
      <Button label={t('estimate.build')} icon="zap" variant="dark" onPress={build} />
      {built ? <Notice text={t('estimate.built')} icon="check" tone="soft" /> : null}

      <T v="eyebrow" style={{ marginTop: 8 }}>{t('estimate.fromList')}</T>
      <Card style={{ gap: 12 }}>
        {draft.lines.length === 0 ? <T v="body" muted>{t('estimate.empty')}</T> : null}
        {draft.lines.map((line, i) => (
          <LineEditor key={line.id} jobId={job.id} line={line} first={i === 0} />
        ))}
      </Card>
      <ButtonRow>
        <Button label={t('estimate.addFromList')} icon="list" variant="soft" flex style={{ backgroundColor: p.card }} onPress={() => setListOpen(true)} />
        <Button label={t('estimate.addCustom')} icon="plus" variant="soft" flex style={{ backgroundColor: p.card }} onPress={() => setCustomOpen(true)} />
      </ButtonRow>

      <Card tone="inverse" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="eyebrow" color={p.onInverseMuted}>{t('estimate.total')}</T>
        <T v="money" color={p.onInverse} style={{ fontSize: 30, fontFamily: font.black }}>{f.money(totals.total)}</T>
      </Card>

      <Card style={{ gap: 12 }}>
        <SwitchRow label={t('estimate.deposit')} value={draft.depositOn} onChange={(v) => actions.updateEstimate(job.id, { depositOn: v })} />
        {draft.depositOn ? (
          <>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {DEPOSIT_CHOICES.map((bps) => (
                <Chip
                  key={bps}
                  label={`${f.pct(bps)}%`}
                  selected={!otherOpen && draft.depositBps === bps}
                  onPress={() => {
                    setOtherOpen(false);
                    actions.updateEstimate(job.id, { depositBps: bps });
                  }}
                />
              ))}
              <Chip
                label={otherOpen || !DEPOSIT_CHOICES.includes(draft.depositBps) ? `${t('estimate.depositOther')}: ${f.pct(draft.depositBps)}%` : t('estimate.depositOther')}
                selected={otherOpen || !DEPOSIT_CHOICES.includes(draft.depositBps)}
                onPress={() => {
                  setOtherText(String(draft.depositBps / 100));
                  setOtherOpen(true);
                }}
              />
            </Row>
            {otherOpen ? (
              <View style={{ gap: 6 }}>
                <Row gap={10}>
                  <TextInput
                    value={otherText}
                    onChangeText={(text) => {
                      setOtherText(text);
                      const bps = parsePercent(text);
                      if (bps !== null) actions.updateEstimate(job.id, { depositBps: bps });
                    }}
                    keyboardType="number-pad"
                    accessibilityLabel={t('estimate.depositCustom')}
                    autoFocus
                    selectTextOnFocus
                    style={{ width: 96, minHeight: tap.main, borderRadius: radius.xs, backgroundColor: p.ground, textAlign: 'right', paddingHorizontal: 14, fontFamily: font.bold, fontSize: 20, color: p.ink }}
                  />
                  <T v="h2">%</T>
                </Row>
                {otherText && parsePercent(otherText) === null ? <T v="small" color={p.danger}>{t('estimate.depositBad')}</T> : null}
              </View>
            ) : null}
            <Row style={{ justifyContent: 'space-between', backgroundColor: p.ground, borderRadius: radius.sm, padding: 14 }} gap={12}>
              <T v="body" style={{ flex: 1 }}>{t('estimate.depositPays')}</T>
              <T v="money" style={{ fontSize: 21, fontFamily: font.black }}>{f.money(totals.deposit)}</T>
            </Row>
          </>
        ) : null}
      </Card>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title={t('estimate.addFromList')}>
        {state.priceList.map((item) => (
          <ListRow
            key={item.id}
            icon="tag"
            title={item.name}
            sub={item.unitCents === null ? t('settings.needsPrice') : item.unit === 'flat' ? f.money(item.unitCents) : `${f.money(item.unitCents)} / ${unitLabel(item.unit)}`}
            onPress={() => {
              actions.addLines(job.id, [fromItem(item)]);
              setListOpen(false);
            }}
          />
        ))}
      </Sheet>

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title={t('estimate.pickItem')}>
        {state.priceList
          .filter((item) => !customAsk.includes(item.id) && !(hourly && item.id === 'labor'))
          .map((item) => (
            <ListRow
              key={item.id}
              icon="tag"
              title={item.name}
              sub={unitLabel(item.unit) || undefined}
              onPress={() => {
                setCustomAsk((ids) => [...ids, item.id]);
                setPickOpen(false);
              }}
            />
          ))}
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
