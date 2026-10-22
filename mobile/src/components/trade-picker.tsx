import Feather from '@expo/vector-icons/Feather';
import { Pressable, Text, View } from 'react-native';

import { TRADES, type TradeId } from '@/data/trades';
import { useLang } from '@/i18n';
import { font, radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { Row } from './ui';

/** Big on/off tiles for each trade. Used in setup and in Settings. */
export function TradePicker({ value, onToggle }: { value: TradeId[]; onToggle: (id: TradeId) => void }) {
  const p = usePalette();
  const { t } = useLang();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {TRADES.map((trade) => {
        const on = value.includes(trade.id);
        return (
          <Pressable
            key={trade.id}
            onPress={() => onToggle(trade.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={t(`trades.${trade.id}`)}
            style={({ pressed }) => ({
              width: '48%',
              flexGrow: 1,
              minHeight: 96,
              borderRadius: radius.md,
              padding: 14,
              gap: 8,
              justifyContent: 'space-between',
              backgroundColor: on ? p.inverse : p.card,
              opacity: pressed ? 0.85 : 1,
            })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Feather name={trade.icon} size={26} color={on ? p.accent : p.ink} />
              {on ? <Feather name="check-circle" size={22} color={p.accent} /> : null}
            </Row>
            <Text style={{ fontFamily: font.bold, fontSize: 16, color: on ? p.onInverse : p.ink }}>{t(`trades.${trade.id}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
