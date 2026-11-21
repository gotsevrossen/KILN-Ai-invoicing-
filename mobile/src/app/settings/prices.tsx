import { router } from 'expo-router';
import { useState } from 'react';

import { parseDollars } from '@/components/estimate-parts';
import { PriceListEditor } from '@/components/price-list-editor';
import { Button, Card, Chip, Field, ListCard, ListRow, Notice, PageHeader, Row, Screen, T } from '@/components/ui';
import { aiReady } from '@/data/ai';
import { useStore } from '@/data/store';
import type { PriceItem, Unit } from '@/data/types';
import { useLang } from '@/i18n';
import { usePalette } from '@/theme/use-palette';

const UNITS: Unit[] = ['flat', 'each', 'hour', 'sq_ft', 'linear_ft', 'board', 'cu_yd'];
/** The hourly Labor item is the business's labor rate (lib/billing.ts laborRateCents), so it stays. */
const removable = (item: PriceItem) => !(item.id === 'labor' && item.unit === 'hour');

export default function PriceSettings() {
  const p = usePalette();
  const { t } = useLang();
  const { state, actions } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Unit>('flat');
  const [price, setPrice] = useState('');
  const cents = price.trim() ? parseDollars(price) : null;
  const priceBad = price.trim().length > 0 && cents === null;
  const unitLabel = (u: Unit) => (u === 'flat' ? t('estimate.unitFlat') : t(`estimate.units.${u}`));

  const add = () => {
    if (!name.trim() || priceBad) return;
    actions.addPriceItem(name, unit, cents);
    setName(''); setPrice(''); setUnit('flat');
  };
  // removing uses the same path as turning a trade off; estimates keep their own copy of each line
  const remove = (item: PriceItem) => actions.setTrades(state.profile.trades, [], [item.id]);

  return (
    <Screen header={<PageHeader title={t('settings.priceList')} back={() => router.back()}
      right={<Button label={editing ? t('settings.priceDone') : t('settings.priceEdit')} icon={editing ? 'check' : 'edit-3'}
        variant={editing ? 'dark' : 'outline'} onPress={() => setEditing(!editing)} />} />}>
      {aiReady(state.mode) && !editing ? (
        <ListCard>
          <ListRow icon="camera" iconTone="accent" title={t('ai.importButton')} onPress={() => router.push('/settings/import-prices')} />
        </ListCard>
      ) : null}
      {editing ? (
        <Card style={{ gap: 12 }}>
          <T v="eyebrow">{t('settings.priceNew')}</T>
          <Field label={t('estimate.itemName')} value={name} onChangeText={setName} autoCapitalize="sentences" maxLength={160} />
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {UNITS.map((u) => <Chip key={u} label={unitLabel(u)} selected={unit === u} onPress={() => setUnit(u)} />)}
          </Row>
          <Field label={t('estimate.priceOptional')} value={price} onChangeText={setPrice} placeholder={t('estimate.pricePlaceholder')} keyboardType="decimal-pad" />
          {priceBad ? <T v="small" color={p.danger}>{t('estimate.priceBad')}</T> : null}
          <Button label={t('settings.priceAdd')} icon="plus" disabled={!name.trim() || priceBad} onPress={add} />
        </Card>
      ) : null}
      <Card style={{ gap: 12 }}>
        <PriceListEditor items={state.priceList} onChange={actions.setPrice}
          onRemove={editing ? remove : undefined} canRemove={removable} />
      </Card>
      {editing && state.priceList.some((item) => !removable(item)) ? <Notice text={t('settings.priceLaborStays')} icon="info" tone="soft" /> : null}
    </Screen>
  );
}
