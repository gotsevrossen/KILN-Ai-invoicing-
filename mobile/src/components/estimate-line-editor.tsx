import { useState } from 'react';
import { View } from 'react-native';

import { useStore } from '@/data/store';
import type { EstimateLine } from '@/data/types';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { lineTotal } from '@/lib/money';
import { usePalette } from '@/theme/use-palette';

import { Button, ButtonRow, Chip, Field, Notice, Row, T } from './ui';

export function EstimateLineEditor({ jobId, line }: { jobId: string; line: EstimateLine }) {
  const { t } = useLang();
  const f = useFormat();
  const p = usePalette();
  const { actions } = useStore();
  const [qty, setQty] = useState(String(line.qtyHundredths / 100));
  const [price, setPrice] = useState(line.unitCents === null ? '' : (line.unitCents / 100).toFixed(2));
  const q = /^\d{1,6}([.,]\d{1,2})?$/.test(qty) ? Math.round(Number(qty.replace(',', '.')) * 100) : 0;
  const cents = /^\d{1,6}([.,]\d{1,2})?$/.test(price) ? Math.round(Number(price.replace(',', '.')) * 100) : null;
  return <>
    <Field label={t('estimate.description')} value={line.description} maxLength={300}
      onChangeText={(description) => actions.updateLine(jobId, line.id, { description })} />
    {line.excluded ? <>
      <Notice text={t('review.excluded')} tone="soft" />
      <Button label={t('review.restore')} variant="outline" onPress={() => actions.updateLine(jobId, line.id, { excluded: false })} />
    </> : <>
      <Row style={{ alignItems: 'flex-start' }} gap={12}>
        <View style={{ flex: 1 }}><Field label={line.kind === 'fee' ? t('review.feeQty') : `${t('estimate.qty')} ${t(`estimate.units.${line.unit}`)}`.trim()}
          value={qty} keyboardType="decimal-pad" style={{ flex: 1 }} onChangeText={(text) => {
            setQty(text);
            const parsed = /^\d{1,6}([.,]\d{1,2})?$/.test(text) ? Math.round(Number(text.replace(',', '.')) * 100) : 0;
            actions.updateLine(jobId, line.id, { qtyHundredths: parsed });
          }} /></View>
        <View style={{ flex: 1 }}><Field label={t('estimate.price')} value={price} keyboardType="decimal-pad" style={{ flex: 1 }} onChangeText={(text) => {
          setPrice(text);
          const parsed = /^\d{1,6}([.,]\d{1,2})?$/.test(text) ? Math.round(Number(text.replace(',', '.')) * 100) : null;
          actions.updateLine(jobId, line.id, { unitCents: parsed });
        }} /></View>
      </Row>
      {q <= 0 ? <T v="small" color={p.danger}>{t('review.qtyBad')}</T> : null}
      {cents === null ? <Notice text={t('estimate.noPriceGeneric')} tone="soft" /> : null}
      <T v="small" muted>{t('review.kind')}</T>
      <Row style={{ flexWrap: 'wrap' }}>
        {(['labor', 'material', 'fee'] as const).map((kind) => <Chip key={kind} label={t(`review.${kind}`)}
          selected={(line.kind ?? 'labor') === kind} onPress={() => actions.updateLine(jobId, line.id, { kind })} />)}
      </Row>
      {cents !== null && q > 0 ? <T v="money">{f.money(lineTotal(q, cents))}</T> : null}
      <ButtonRow>
        <Button label={t('review.exclude')} variant="outline" onPress={() => actions.updateLine(jobId, line.id, { excluded: true })} />
        {line.priceItemId ? <Button label={t('estimate.saveToList')} variant="soft" disabled={cents === null}
          onPress={() => actions.setPrice(line.priceItemId!, cents)} /> : null}
      </ButtonRow>
    </>}
  </>;
}
