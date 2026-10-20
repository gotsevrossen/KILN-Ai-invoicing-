import { useState } from 'react';
import { TextInput, View } from 'react-native';

import type { PriceItem } from '@/data/types';
import { useLang } from '@/i18n';
import { font, radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { Pill, Row, T } from './ui';

/** "45" or "$45.50" -> cents. Empty -> null (no price yet). Anything else -> undefined (invalid). */
function parsePrice(text: string): number | null | undefined {
  const s = text.replace(/[$,\s]/g, '');
  if (s === '') return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return undefined;
  return Math.round(Number(s) * 100);
}

function PriceRow({ item, onChange, first }: { item: PriceItem; onChange: (cents: number | null) => void; first: boolean }) {
  const p = usePalette();
  const { t } = useLang();
  const [text, setText] = useState(item.unitCents === null ? '' : (item.unitCents / 100).toFixed(2));
  const parsed = parsePrice(text);
  const unit = item.unit === 'flat' ? '' : t(`estimate.units.${item.unit}`);

  return (
    <View style={{ gap: 4, borderTopWidth: first ? 0 : 1, borderTopColor: p.line, paddingTop: first ? 0 : 10 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }} gap={10}>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="label" style={{ fontSize: 16 }}>{item.name}</T>
          {item.unitCents === null ? <Pill label={t('settings.needsPrice')} tone="flag" /> : null}
        </View>
        <Row gap={4}>
          <T v="h3">$</T>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              const cents = parsePrice(v);
              if (cents !== undefined) onChange(cents);
            }}
            keyboardType="decimal-pad"
            accessibilityLabel={`${item.name} ${unit}`}
            placeholder="0.00"
            placeholderTextColor={p.muted}
            selectTextOnFocus
            style={{ width: 92, minHeight: tap.min, borderRadius: radius.xs, backgroundColor: p.ground, textAlign: 'right', paddingHorizontal: 12, fontFamily: font.bold, fontSize: 17, color: p.ink }}
          />
          <T v="small" muted style={{ width: 52 }}>{unit ? `/ ${unit}` : ''}</T>
        </Row>
      </Row>
      {parsed === undefined ? <T v="small" color={p.danger}>{t('estimate.priceBad')}</T> : null}
    </View>
  );
}

/** Edit prices in place. Blank = no price yet; KILN flags it instead of guessing. */
export function PriceListEditor({ items, onChange }: { items: PriceItem[]; onChange: (itemId: string, cents: number | null) => void }) {
  return (
    <View style={{ gap: 10 }}>
      {items.map((item, i) => (
        <PriceRow key={item.id} item={item} first={i === 0} onChange={(cents) => onChange(item.id, cents)} />
      ))}
    </View>
  );
}
