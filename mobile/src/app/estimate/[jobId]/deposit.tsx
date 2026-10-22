import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { EstimatePage, parsePercent, useEstimate } from '@/components/estimate-parts';
import { RecordGate } from '@/components/record-gate';
import { Button, Card, Chip, Row, SwitchRow, T } from '@/components/ui';
import { hasJob } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { font, radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/** Quick deposit choices, in basis points (3000 = 30%). */
const DEPOSIT_CHOICES = [1000, 2500, 3000, 5000];

/** Deposit the customer pays when they sign. */
function EstimateDeposit() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { actions } = useStore();
  const { job, draft, totals } = useEstimate();
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');
  const isOther = otherOpen || !DEPOSIT_CHOICES.includes(draft.depositBps);

  return (
    <EstimatePage title={t('estimate.deposit')} footer={<Button label={t('estimate.done')} big onPress={() => router.back()} />}>
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
                label={isOther ? `${t('estimate.depositOther')}: ${f.pct(draft.depositBps)}%` : t('estimate.depositOther')}
                selected={isOther}
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
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="eyebrow" muted>{t('estimate.total')}</T>
        <T v="money">{f.money(totals.total)}</T>
      </Row>
    </EstimatePage>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function EstimateDepositRoute() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  return <RecordGate found={() => hasJob(jobId)}><EstimateDeposit /></RecordGate>;
}
