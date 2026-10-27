import { router } from 'expo-router';
import { useState } from 'react';

import { Sheet } from '@/components/sheet';
import { TradePicker } from '@/components/trade-picker';
import { Button, Notice, PageHeader, Screen, T } from '@/components/ui';
import { useStore } from '@/data/store';
import { ITEM_UNITS, itemsOnlyIn, starterCents, starterItemIds, type TradeId } from '@/data/trades';
import type { PriceItem } from '@/data/types';
import { useLang } from '@/i18n';
import { usePalette } from '@/theme/use-palette';

/**
 * Change the work you do, e.g. a handyman who switches to carpentry. Saves on each tap.
 * Turning a trade off removes the price list items only it used; it asks first if any have prices.
 */
export default function TradeSettings() {
  const p = usePalette();
  const { t } = useLang();
  const { state, actions } = useStore();
  const trades = state.profile.trades;
  // what the last tap did, shown under the tiles
  const [result, setResult] = useState<{ added: number } | { removed: number } | null>(null);
  const [keepOne, setKeepOne] = useState(false);
  // a trade waiting for "yes, remove my prices"
  const [confirm, setConfirm] = useState<{ id: TradeId; items: PriceItem[] } | null>(null);

  const turnOn = (id: TradeId) => {
    const have = new Set(state.priceList.map((i) => i.id));
    const newItems: PriceItem[] = starterItemIds([id])
      .filter((itemId) => !have.has(itemId))
      .map((itemId) => ({
        id: itemId,
        name: t(`items.${itemId}` as `items.trip`),
        unit: ITEM_UNITS[itemId],
        // same rule as setup: hourly owners start with their rate as the labor price
        unitCents: starterCents(itemId, state.profile.pricing, state.profile.rateCents),
      }));
    actions.setTrades([...trades, id], newItems);
    setResult({ added: newItems.length });
  };

  const turnOff = (id: TradeId, items: PriceItem[]) => {
    actions.setTrades(trades.filter((x) => x !== id), [], items.map((i) => i.id));
    setResult({ removed: items.length });
    setConfirm(null);
  };

  const toggle = (id: TradeId) => {
    setKeepOne(false);
    if (!trades.includes(id)) return turnOn(id);
    if (trades.length === 1) return setKeepOne(true);
    const onlyIds = itemsOnlyIn(id, trades.filter((x) => x !== id));
    const items = state.priceList.filter((i) => onlyIds.includes(i.id));
    // only stop to ask when prices the owner typed would be lost
    if (items.some((i) => i.unitCents !== null)) setConfirm({ id, items });
    else turnOff(id, items);
  };

  const priced = confirm ? confirm.items.filter((i) => i.unitCents !== null) : [];

  return (
    <Screen header={<PageHeader title={t('settings.trades')} sub={t('settings.tradesHelp')} back={() => router.back()} />}>
      <TradePicker value={trades} onToggle={toggle} />
      {keepOne ? <T v="small" color={p.danger}>{t('settings.tradesKeepOne')}</T> : null}
      {result && 'added' in result && result.added > 0 ? (
        <>
          <Notice text={t('settings.tradesAdded', { count: result.added })} icon="tag" tone="flag" />
          <Button label={t('settings.addPrices')} icon="arrow-right" onPress={() => router.push('/settings/prices')} />
        </>
      ) : null}
      {result && 'removed' in result && result.removed > 0 ? (
        <Notice text={t('settings.tradesRemoved', { count: result.removed })} icon="check" tone="soft" />
      ) : null}

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? t('settings.tradeOffTitle', { trade: t(`trades.${confirm.id}`) }) : ''}>
        <T v="body">{t('settings.tradeOffBody', { count: confirm?.items.length ?? 0 })}</T>
        <T v="small" muted>{priced.map((i) => i.name).join(', ')}</T>
        <Button label={t('settings.tradeOffYes')} icon="trash-2" variant="dark" onPress={() => confirm && turnOff(confirm.id, confirm.items)} />
        <Button label={t('common.cancel')} variant="outline" onPress={() => setConfirm(null)} />
      </Sheet>
    </Screen>
  );
}
