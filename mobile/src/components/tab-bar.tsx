import Feather from '@expo/vector-icons/Feather';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { font, radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import type { IconName } from './ui';

/** Height of the floating bar; screens with tabs leave this much room at the bottom. */
export const TAB_BAR_HEIGHT = 64;
const PAD = 5;
/** How far above the bar page content starts fading into the background. */
const FADE = 40;
const SPRING = { damping: 20, stiffness: 220, mass: 0.8 };

/**
 * Floating menu: a white card holding the pages, with an orange slider that moves to the
 * selected one, and Capture as its own round button on the right. Holding the slider and
 * sliding a finger moves it across the pages, switching page as it passes each one.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets, icons, capture }: BottomTabBarProps & {
  /** Icon for each page by route name. Routes not listed (and Capture) stay out of the bar. */
  icons: Record<string, IconName>;
  capture: { route: string; label: string };
}) {
  const p = usePalette();
  const [width, setWidth] = useState(0);
  const focusedName = state.routes[state.index]?.name;
  const pages = state.routes.filter((r) => r.name in icons);
  const selected = pages.findIndex((r) => r.name === focusedName);
  const slot = pages.length ? (width - PAD * 2) / pages.length : 0;
  const x = useSharedValue(0);
  const shown = useSharedValue(selected >= 0 ? 1 : 0);
  // grows a little while held, like picking it up
  const held = useSharedValue(0);
  const placed = useRef(false);
  // the drag in progress: where the slider started, and the page it's over now
  const drag = useRef<{ start: number; index: number } | null>(null);

  useEffect(() => {
    // while the finger holds it, the slider follows the finger, not the page change
    if (!slot || drag.current) return;
    // on Capture (not in the bar) it slides off the right end, toward the Capture button, and
    // comes back in from there
    const to = (selected >= 0 ? selected : pages.length) * slot;
    // the first time it appears it starts in place instead of sliding in from the left
    x.set(placed.current ? withSpring(to, SPRING) : to);
    shown.set(withSpring(selected >= 0 ? 1 : 0, SPRING));
    placed.current = true;
  }, [selected, slot, pages.length, x, shown]);

  const slider = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { scale: (0.85 + 0.15 * shown.get()) * (1 + 0.06 * held.get()) }],
    opacity: shown.get(),
  }));

  const press = (key: string, focused: boolean) => {
    const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigateToTab(key);
  };

  // A sideways drag that starts on the orange slider moves it between pages. Taps still go to
  // the page buttons: the drag only starts after the finger moves a few points sideways.
  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetX: [-6, 6],
    failOffsetY: [-30, 30],
    onBegin: (e) => {
      const left = PAD + x.get();
      drag.current = selected >= 0 && slot && e.x >= left && e.x <= left + slot ? { start: x.get(), index: selected } : null;
    },
    onActivate: () => { if (drag.current) held.set(withSpring(1, SPRING)); },
    onUpdate: (e) => {
      const d = drag.current;
      if (!d) return;
      const next = Math.min(Math.max(d.start + e.translationX, 0), (pages.length - 1) * slot);
      x.set(next);
      const index = Math.round(next / slot);
      if (index !== d.index && pages[index]) {
        d.index = index;
        press(pages[index].key, false);
      }
    },
    onFinalize: () => {
      const d = drag.current;
      drag.current = null;
      held.set(withSpring(0, SPRING));
      // lets go: settles on the page it's over
      if (d) x.set(withSpring(d.index * slot, SPRING));
    },
  });

  const captureRoute = state.routes.find((r) => r.name === capture.route);
  const captureOn = focusedName === capture.route;
  const bottom = Math.max(insets.bottom, 12);
  const fadeHeight = FADE + TAB_BAR_HEIGHT + bottom;

  return (
    <View pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: bottom, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {/* cards scrolling down fade into the background before they reach the bar, and stay hidden behind it */}
      <Svg pointerEvents="none" width="100%" height={fadeHeight} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <Defs>
          <LinearGradient id="kilnTabFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={p.ground} stopOpacity={0} />
            <Stop offset={String((FADE * 0.85) / fadeHeight)} stopColor={p.ground} stopOpacity={0.92} />
            <Stop offset={String(FADE / fadeHeight)} stopColor={p.ground} stopOpacity={1} />
            <Stop offset="1" stopColor={p.ground} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#kilnTabFade)" />
      </Svg>
      <GestureDetector gesture={pan}>
      <View role="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ flex: 1, height: TAB_BAR_HEIGHT, borderRadius: radius.pill, backgroundColor: p.card, padding: PAD, flexDirection: 'row', ...lift }}>
        {/* clips the slider at the bar's rounded edge as it leaves; separate from the bar so its shadow isn't cut off */}
        {slot ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.pill, overflow: 'hidden' }}>
          <Animated.View style={[{ position: 'absolute', top: PAD, left: PAD, bottom: PAD, width: slot, borderRadius: radius.pill, backgroundColor: p.accent }, slider]} />
        </View> : null}
        {pages.map((route, i) => {
          const focused = i === selected;
          const options = descriptors[route.key]?.options;
          const label = typeof options?.title === 'string' ? options.title : route.name;
          const color = focused ? p.onAccent : p.muted;
          return (
            <Pressable key={route.key} onPress={() => press(route.key, focused)}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: focused }}
              style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: pressed && !focused ? 0.6 : 1 })}>
              <Feather name={icons[route.name]} size={22} color={color} />
              <Text numberOfLines={1} style={{ fontFamily: font.semi, fontSize: 12, color }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      </GestureDetector>
      {captureRoute ? (
        <Pressable onPress={() => press(captureRoute.key, captureOn)}
          accessibilityRole="tab" accessibilityLabel={capture.label} accessibilityState={{ selected: captureOn }}
          style={({ pressed }) => ({
            width: TAB_BAR_HEIGHT, height: TAB_BAR_HEIGHT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
            backgroundColor: captureOn ? p.accent : p.inverse, transform: [{ scale: pressed ? 0.94 : 1 }], ...lift,
          })}>
          <Feather name="plus" size={30} color={captureOn ? p.onAccent : p.onInverse} />
        </Pressable>
      ) : null}
    </View>
  );
}

// a soft shadow so the bar reads as floating over the page, like a card lifted off the ground
const lift = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 } as const;
