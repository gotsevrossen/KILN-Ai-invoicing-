import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button, Card, Field, Hair, Icon, LineRow, Notice, PageHeader, Row, Screen, SwitchRow, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { customerOf, estimateLines, estimateTotals, jobById } from '@/data/selectors';
import { useStore, type EstimateDraft } from '@/data/store';
import type { Unit } from '@/data/types';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { lineTotal } from '@/lib/money';
import { font, radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

type NumKey = 'deckSqFt' | 'boards' | 'railingFt';

export default function EstimateBuilder() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const job = jobById(jobId);
  const customer = customerOf(job);
  const e = state.estimate;
  const [type, setType] = useState<'deck' | 'fence' | 'painting' | 'other'>('deck');
  const [haulText, setHaulText] = useState('');

  const names = {
    boards: sample.priceList.find((x) => x.id === 'deck-board')!.name,
    railing: sample.priceList.find((x) => x.id === 'railing')!.name,
    wash: sample.priceList.find((x) => x.id === 'wash-seal')!.name,
    haul: t('estimate.noPriceTitle'),
  };
  const lines = estimateLines(state, names);
  const totals = estimateTotals(state);
  const unitLabel = (u?: Unit) => (u ? t(`estimate.units.${u}`) : '');

  const inputs: { key: NumKey; label: string; unit: Unit }[] = [
    { key: 'deckSqFt', label: t('estimate.deckArea'), unit: 'sq_ft' },
    { key: 'boards', label: t('estimate.boards'), unit: 'board' },
    { key: 'railingFt', label: t('estimate.railing'), unit: 'linear_ft' },
  ];
  const setNum = (key: NumKey, text: string) => {
    const n = parseInt(text.replace(/\D/g, ''), 10);
    actions.updateEstimate({ [key]: Number.isFinite(n) ? Math.min(n, 99999) : 0 } as Partial<EstimateDraft>);
  };
  const haulCents = (() => {
    const n = Number(haulText.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  })();

  return (
    <Screen
      footer={
        e.sent ? (
          <Notice text={t('estimate.sent', { name: customer.firstName })} icon="send" />
        ) : (
          <Row gap={10}>
            <Button label={t('estimate.preview')} variant="outline" onPress={() => router.push(`/customer/estimate/${job.id}`)} />
            <Button label={t('estimate.send')} icon="send" flex big onPress={() => actions.updateEstimate({ sent: true })} />
          </Row>
        )
      }>
      <PageHeader title={t('estimate.title')} sub={`${job.title} · ${customer.name}`} back={() => router.back()} />

      <T v="eyebrow">{t('estimate.details')}</T>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {(['deck', 'fence', 'painting', 'other'] as const).map((k) => {
          const on = k === type;
          return (
            <Pressable
              key={k}
              onPress={() => setType(k)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{ minHeight: tap.min, paddingHorizontal: 18, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? p.inverse : p.card }}>
              <Text style={{ fontFamily: font.semi, fontSize: 15, color: on ? p.onInverse : p.ink }}>{t(`estimate.types.${k}`)}</Text>
            </Pressable>
          );
        })}
      </Row>

      <Card style={{ gap: 0, paddingVertical: 6 }}>
        {inputs.map((input, i) => (
          <Row key={input.key} style={{ minHeight: 64, borderTopWidth: i ? 1 : 0, borderTopColor: p.line, justifyContent: 'space-between' }} gap={10}>
            <T v="body" style={{ flex: 1 }}>{input.label}</T>
            <TextInput
              value={String(e[input.key])}
              onChangeText={(text) => setNum(input.key, text)}
              keyboardType="number-pad"
              accessibilityLabel={input.label}
              selectTextOnFocus
              style={{ width: 86, minHeight: tap.min, borderRadius: radius.xs, backgroundColor: p.ground, textAlign: 'right', paddingHorizontal: 12, fontFamily: font.bold, fontSize: 18, color: p.ink }}
            />
            <T v="small" muted style={{ width: 72 }}>{unitLabel(input.unit)}</T>
          </Row>
        ))}
      </Card>
      <Row gap={8}>
        <Icon name="mic" size={16} color={p.muted} />
        <T v="small" muted>{t('estimate.alsoUsing', { voice: 1, photos: 4 })}</T>
      </Row>

      <T v="eyebrow" style={{ marginTop: 8 }}>{t('estimate.fromList')}</T>
      <Card style={{ gap: 6 }}>
        {lines.map((line, i) => (
          <View key={line.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: p.line, paddingTop: i ? 8 : 0 }}>
            <LineRow
              label={line.description}
              sub={line.unit === 'flat' ? undefined : `${f.qty(line.qtyHundredths)} ${unitLabel(line.unit)} × ${f.money(line.unitCents)}`}
              value={f.money(lineTotal(line.qtyHundredths, line.unitCents))}
            />
          </View>
        ))}
      </Card>

      {e.haulCents === null ? (
        <Card tone="flag" style={{ gap: 10 }}>
          <Row gap={8}>
            <Icon name="alert-triangle" color={p.onFlag} />
            <T v="label" color={p.onFlag}>{t('estimate.noPriceTitle')}</T>
          </Row>
          <T v="body" color={p.onFlag}>{t('estimate.noPrice')}</T>
          <Row gap={8}>
            <View style={{ flex: 1 }}>
              <Field value={haulText} onChangeText={setHaulText} placeholder={t('estimate.pricePlaceholder')} keyboardType="decimal-pad" style={{ borderColor: p.ink }} />
            </View>
            <Button label={t('estimate.saveToList')} variant="dark" disabled={haulCents === null} onPress={() => actions.updateEstimate({ haulCents })} />
          </Row>
        </Card>
      ) : null}

      <Card tone="inverse" style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="eyebrow" color={p.onInverseMuted}>{t('estimate.total')}</T>
          <T v="money" color={p.onInverse} style={{ fontSize: 30, fontFamily: font.black }}>{f.money(totals.total)}</T>
        </Row>
        <Hair style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
        <View style={{ backgroundColor: p.card, borderRadius: radius.sm, paddingHorizontal: 14 }}>
          <SwitchRow
            label={t('estimate.deposit', { pct: f.pct(sample.business.depositBps) })}
            help={e.depositOn ? f.money(totals.deposit) : undefined}
            value={e.depositOn}
            onChange={(v) => actions.updateEstimate({ depositOn: v })}
          />
        </View>
      </Card>
    </Screen>
  );
}
