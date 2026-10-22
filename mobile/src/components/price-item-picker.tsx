import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useStore } from '@/data/store';
import type { PriceItem, Unit } from '@/data/types';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { usePalette } from '@/theme/use-palette';

import { parseDollars } from './estimate-parts';
import { Button, Chip, Field, ListRow, Notice, Row, T } from './ui';

const UNITS: Unit[] = ['flat', 'each', 'hour', 'sq_ft', 'linear_ft', 'board', 'cu_yd'];

/**
 * Goes in a Sheet with scroll={false}.
 * Pick an item from the price list (with search), or add a new item of your own.
 * New items are saved to the price list, so they're there next time.
 */
export function PriceItemPicker({ items, onPick }: { items: PriceItem[]; onPick: (item: PriceItem) => void }) {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { actions } = useStore();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Unit>('flat');
  const [price, setPrice] = useState('');

  const unitLabel = (u: Unit) => (u === 'flat' ? t('estimate.unitFlat') : t(`estimate.units.${u}`));
  const q = query.trim().toLowerCase();
  const shown = items.filter((item) => !q || item.name.toLowerCase().includes(q));
  const cents = price.trim() ? parseDollars(price) : null;
  const priceBad = price.trim().length > 0 && cents === null;

  if (creating) {
    return (
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
        <Field label={t('estimate.itemName')} value={name} onChangeText={setName} autoCapitalize="sentences" maxLength={160} autoFocus />
        <T v="label">{t('estimate.unit')}</T>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {UNITS.map((u) => <Chip key={u} label={unitLabel(u)} selected={unit === u} onPress={() => setUnit(u)} />)}
        </Row>
        <Field label={t('estimate.priceOptional')} value={price} onChangeText={setPrice} placeholder={t('estimate.pricePlaceholder')} keyboardType="decimal-pad" />
        {priceBad ? <T v="small" color={p.danger}>{t('estimate.priceBad')}</T> : null}
        <T v="small" muted>{t('estimate.newItemHelp')}</T>
        <Button
          label={t('estimate.saveAndAdd')}
          icon="plus"
          disabled={!name.trim() || priceBad}
          onPress={() => {
            const item = actions.addPriceItem(name, unit, cents);
            setCreating(false);
            setQuery('');
            setName('');
            setPrice('');
            onPick(item);
          }}
        />
        <Button label={t('common.back')} variant="outline" onPress={() => setCreating(false)} />
      </ScrollView>
    );
  }

  // search and New item stay in place; only the list scrolls
  return (
    <View style={{ flexShrink: 1, gap: 14 }}>
      <Field value={query} onChangeText={setQuery} placeholder={t('estimate.searchItems')} accessibilityLabel={t('estimate.searchItems')}
        returnKeyType="search" autoCorrect={false} />
      <Button
        label={q ? t('estimate.newItemNamed', { name: query.trim() }) : t('estimate.newItem')}
        icon="plus"
        variant="outline"
        onPress={() => {
          setName(query.trim());
          setCreating(true);
        }}
      />
      {shown.length === 0 ? <Notice text={t('estimate.noMatch')} icon="search" tone="soft" /> : null}
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {shown.map((item) => (
          <ListRow
            key={item.id}
            icon="tag"
            title={item.name}
            sub={item.unitCents === null
              ? t('settings.needsPrice')
              : item.unit === 'flat' ? f.money(item.unitCents) : `${f.money(item.unitCents)} / ${t(`estimate.units.${item.unit}`)}`}
            onPress={() => onPick(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
