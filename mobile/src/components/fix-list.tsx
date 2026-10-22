import Feather from '@expo/vector-icons/Feather';
import { Pressable, View } from 'react-native';

import { useLang } from '@/i18n';
import { usePalette } from '@/theme/use-palette';

import { Card, Icon, Row, T } from './ui';

export interface Fix {
  key: string;
  text: string;
  /** Where the owner fixes it, when that's on another page. */
  onPress?: () => void;
}

/** Everything blocking Send, in one card instead of warnings spread down the page. */
export function FixList({ items }: { items: Fix[] }) {
  const p = usePalette();
  const { t } = useLang();
  if (items.length === 0) return null;
  return (
    <Card tone="flag" style={{ gap: 4 }}>
      <Row gap={8}>
        <Icon name="alert-triangle" size={18} color={p.onFlag} />
        <T v="eyebrow" color={p.onFlag}>{t('review.fixTitle', { count: items.length })}</T>
      </Row>
      {items.map((item) => {
        const body = (
          <>
            <T v="body" color={p.onFlag} style={{ flex: 1 }}>{item.text}</T>
            {item.onPress ? <Feather name="chevron-right" size={22} color={p.onFlag} /> : null}
          </>
        );
        const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 48, paddingVertical: 6 };
        return item.onPress ? (
          <Pressable key={item.key} onPress={item.onPress} accessibilityRole="button" accessibilityLabel={item.text}
            style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}>
            {body}
          </Pressable>
        ) : (
          <View key={item.key} style={style}>{body}</View>
        );
      })}
    </Card>
  );
}
