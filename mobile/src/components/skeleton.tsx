import { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useMotion } from '@/theme/motion';
import { radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/**
 * Gray stand-ins in the app's card shapes while data loads, with a soft pulse so it reads as
 * "on its way", not broken. Reduce Motion: no pulse. Screen readers hear `label`.
 */
export function LoadingCards({ label, big = false, rows = 3 }: {
  label: string;
  /** Home's shape: the big total card first. */
  big?: boolean;
  rows?: number;
}) {
  const p = usePalette();
  const reduced = useMotion() === 'reduced';
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      pulse.set(1);
      return;
    }
    pulse.set(withRepeat(withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [reduced, pulse]);
  const fade = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const bar = (width: DimensionValue, height = 14) => (
    <View style={{ width, height, borderRadius: radius.pill, backgroundColor: p.placeholder }} />
  );
  return (
    <Animated.View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={[{ gap: 14 }, fade]}>
      {big ? (
        <>
          <View style={{ height: 150, borderRadius: radius.lg, backgroundColor: p.placeholder }} />
          <View style={{ marginTop: 8 }}>{bar('45%', 26)}</View>
        </>
      ) : null}
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: p.card, borderRadius: radius.md, padding: 18 }}>
          <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: p.placeholder }} />
          <View style={{ flex: 1, gap: space.sm }}>
            {bar(i % 2 ? '55%' : '70%')}
            {bar(i % 2 ? '80%' : '40%', 10)}
          </View>
        </View>
      ))}
    </Animated.View>
  );
}
