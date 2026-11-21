import { useId, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/** How far above the buttons the page starts fading out, like the tab bar. */
const FADE = 28;

/**
 * A page's main buttons (Job done, View invoice, Sign in…) floating over the content, which
 * scrolls underneath, the same way the tab bar floats. It sits above the phone's home area and
 * reports its height so the page can add that much room below its last item (Screen does this).
 *
 * Sizes are measured, never percentages: percentage-sized drawings were cut short on some phones
 * and on the web, letting text show through under the buttons and clipping the fade on the right.
 */
export function FloatingFooter({ children, onHeight }: { children: ReactNode; onHeight: (height: number) => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const id = `kilnFooterFade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [width, setWidth] = useState(0);
  return (
    <View pointerEvents="box-none"
      onLayout={(e) => { onHeight(e.nativeEvent.layout.height); setWidth(e.nativeEvent.layout.width); }}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      {/* the page fades into the background just above the buttons */}
      <View pointerEvents="none" style={{ height: FADE }}>
        {width > 0 ? (
          <Svg width={width} height={FADE}>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={p.ground} stopOpacity={0} />
                <Stop offset="0.7" stopColor={p.ground} stopOpacity={0.9} />
                <Stop offset="1" stopColor={p.ground} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height={FADE} fill={`url(#${id})`} />
          </Svg>
        ) : null}
      </View>
      {/* solid behind the buttons and down to the screen's edge, so nothing reads through */}
      <View style={{ backgroundColor: p.ground, paddingHorizontal: space.lg, paddingTop: 4, paddingBottom: Math.max(insets.bottom, space.md), gap: 10 }}>
        {children}
      </View>
    </View>
  );
}
