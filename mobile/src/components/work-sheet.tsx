import { useState } from 'react';
import { View } from 'react-native';

import { useStore } from '@/data/store';
import type { PriceItem, Unit } from '@/data/types';
import { useLang } from '@/i18n';
import { priceLooksOff, usualPrice, workItemValid } from '@/lib/billing';
import { useFormat } from '@/lib/format';
import { lineTotal, type LineKind } from '@/lib/money';
import { usePalette } from '@/theme/use-palette';

import { parseDollars } from './estimate-parts';
import { PriceItemPicker } from './price-item-picker';
import { Sheet } from './sheet';
import { Button, Chip, Field, Notice, Row, T } from './ui';

interface Draft { priceItemId?: string; description: string; unit: Unit; qty: string; price: string; kind: LineKind }

const blank = (): Draft => ({ description: '', unit: 'flat', qty: '1', price: '', kind: 'labor' });
const parseQty = (text: string) => (/^\d{1,6}([.,]\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text.trim().replace(',', '.')) * 100) : 0);

/**
 * Work done on a job: pick it from the price list (price filled in) or type it in.
 * The owner always sees and can change the price before it's added. Each item is its own invoice line.
 */
export function WorkSheet({ jobId, open, onClose, onEstimate }: {
  jobId: string; open: boolean; onClose: () => void;
  /** The job has a signed estimate: work added here is billed on top of it. */
  onEstimate: boolean;
}) {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  // null = choosing: the price list, or "Type it in"
  const [draft, setDraft] = useState<Draft | null>(null);

  const close = () => {
    onClose();
    // after the sheet slides away, so it doesn't jump back to the list while closing
    setTimeout(() => setDraft(null), 300);
  };
  const fromItem = (item: PriceItem) => setDraft({
    priceItemId: item.id, description: item.name, unit: item.unit,
    qty: '1', price: item.unitCents === null ? '' : (item.unitCents / 100).toFixed(2), kind: 'labor',
  });

  const qty = draft ? parseQty(draft.qty) : 0;
  const cents = draft ? parseDollars(draft.price) : null;
  const usual = draft ? usualPrice(draft, state.priceList) : null;
  const valid = !!draft && cents !== null && workItemValid({ description: draft.description, qtyHundredths: qty, unitCents: cents });
  const unitLabel = draft && draft.unit !== 'flat' ? t(`estimate.units.${draft.unit}`) : '';
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <Sheet open={open} onClose={close} title={t('work.title')} scroll={draft !== null}>
      {draft === null ? (
        <>
          <Button label={t('work.typeIt')} icon="edit-3" onPress={() => setDraft(blank())} />
          <T v="label">{t('work.fromList')}</T>
          <PriceItemPicker items={state.priceList} onPick={fromItem} />
        </>
      ) : (
        <>
          <Field label={t('work.description')} value={draft.description} onChangeText={(description) => set({ description })}
            placeholder={t('work.descriptionPlaceholder')} autoCapitalize="sentences" maxLength={300} autoFocus={!draft.priceItemId} />
          <Row gap={12} style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label={`${t('work.qty')} ${unitLabel}`.trim()} value={draft.qty} onChangeText={(text) => set({ qty: text })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('work.price')} value={draft.price} onChangeText={(price) => set({ price })} placeholder={t('estimate.pricePlaceholder')}
                keyboardType="decimal-pad" autoFocus={!!draft.priceItemId && !draft.price} />
            </View>
          </Row>
          <T v="small" muted>{t('review.kind')}</T>
          <Row style={{ flexWrap: 'wrap' }}>
            {(['labor', 'material', 'fee'] as const).map((kind) => (
              <Chip key={kind} label={t(`review.${kind}`)} selected={draft.kind === kind} onPress={() => set({ kind })} />
            ))}
          </Row>
          {valid && cents !== null ? <T v="money" style={{ fontSize: 19 }}>{f.money(lineTotal(qty, cents))}</T> : null}
          {usual !== null && priceLooksOff(cents, usual) ? <Notice text={t('estimate.priceOff', { usual: f.money(usual) })} tone="flag" icon="alert-triangle" /> : null}
          {!valid && (draft.description.trim() || draft.price.trim()) ? <T v="small" color={p.danger}>{t('work.bad')}</T> : null}
          <Notice text={onEstimate ? t('work.onEstimate') : t('work.flatHourly')} icon="info" tone="soft" />
          <Button label={t('work.add')} icon="plus" big disabled={!valid} onPress={() => {
            if (!draft || cents === null) return;
            const added = actions.addWorkItem(jobId, {
              priceItemId: draft.priceItemId, description: draft.description, unit: draft.unit, qtyHundredths: qty, unitCents: cents, kind: draft.kind,
            });
            if (added) close();
          }} />
          <Button label={t('common.back')} variant="outline" onPress={() => setDraft(null)} />
        </>
      )}
    </Sheet>
  );
}
