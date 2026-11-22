import { router, type Href } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useSubscription } from '@/data/subscription';
import { useLang } from '@/i18n';
import { blocked } from '@/lib/subscription';
import { assistantCopy } from '@/i18n/assistant';
import { font, radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { FlameIcon } from './flame-icon';
import { setTabSwipe } from './tab-swipe';
import type { IconName } from './ui';

/** Height of the floating bar; screens with tabs leave this much room at the bottom. */
export const TAB_BAR_HEIGHT = 64;
const PAD = 5;
/** How far above the bar page content starts fading into the background. */
const FADE = 40;
const SPRING = { damping: 20, stiffness: 220, mass: 0.8 };

/** Capture: its tab route and its page address (opened from the + menu). */
type Capture = { route: string; label: string; path: '/capture' | '/crew/capture' };
/** The KILN chat, opened from the top of the + menu. Left out, the menu has no chat. */
type Assistant = { label: string; href: '/assistant' | '/crew/assistant' };

function pressTab({ emitter, navigateToTab }: Pick<BottomTabBarProps, 'emitter' | 'navigateToTab'>, key: string, focused: boolean) {
  const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
  if (!focused && !event.defaultPrevented) {
    void Haptics.selectionAsync().catch(() => {});
    navigateToTab(key);
  }
}

/** Crew have one jobs screen and the same floating + menu. */
export function FloatingCaptureBar({ state, insets, capture, assistant }: BottomTabBarProps & { capture: Capture; assistant?: Assistant }) {
  const route = state.routes.find((r) => r.name === capture.route);
  if (!route) return null;
  const active = state.routes[state.index]?.key === route.key;
  return (
    <FloatingBar bottomInset={insets.bottom}>
      <CaptureMenu capture={capture} assistant={assistant} active={active} bottomInset={insets.bottom} />
    </FloatingBar>
  );
}

/**
 * Floating menu: a white card holding the pages, with an orange slider that moves to the
 * selected one, and the round + on the right, which offers Talk to KILN or Capture. Holding the slider and sliding a finger moves it across the pages,
 * switching page as it passes each one.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets, icons, capture, assistant }: BottomTabBarProps & {
  /** The KILN chat at the top of the + menu; left out, the menu has no chat. */
  assistant?: Assistant;
  /** Icon for each page by route name. Routes not listed (and Capture) stay out of the bar. */
  icons: Record<string, IconName>;
  capture: Capture;
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

  const press = (key: string, focused: boolean) => pressTab({ emitter, navigateToTab }, key, focused);

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

  // Swiping a page sideways moves along the same order as the bar: its pages left to right, then
  // Capture (the button on the right). Re-registered each render so it always sees the current page.
  useEffect(() => setTabSwipe((step) => {
    const order = captureRoute ? [...pages, captureRoute] : pages;
    const next = order[order.findIndex((r) => r.name === focusedName) + step];
    if (next) press(next.key, false);
  }));
  return (
    <FloatingBar bottomInset={insets.bottom}>
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
              <Text numberOfLines={1} style={{ includeFontPadding: false, fontFamily: font.semi, fontSize: 12, color }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      </GestureDetector>
      {captureRoute ? <CaptureMenu capture={capture} assistant={assistant} active={captureOn} bottomInset={insets.bottom} /> : null}
    </FloatingBar>
  );
}

function FloatingBar({ children, bottomInset }: { children: ReactNode; bottomInset: number }) {
  const p = usePalette();
  const bottom = Math.max(bottomInset, 12);
  const fadeHeight = FADE + TAB_BAR_HEIGHT + bottom;
  return (
    <View pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: bottom, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
      {/* Cards scrolling down fade into the background before they reach the controls. */}
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
      {children}
    </View>
  );
}

const MENU_IN = { duration: 240, easing: Easing.out(Easing.cubic) };
const MENU_OUT = { duration: 180, easing: Easing.in(Easing.cubic) };

/**
 * The round + button and the two choices it opens: Talk to KILN (the chat) and Capture (the
 * Capture page). Opening, the + turns a quarter-and-a-half turn into an X in the same spot while
 * the page dims and the choices rise in; closing turns it back.
 */
function CaptureMenu({ capture, assistant, active, bottomInset }: { capture: Capture; assistant?: Assistant; active: boolean; bottomInset: number }) {
  const p = usePalette();
  const { lang } = useLang();
  const c = assistantCopy[lang];
  const [open, setOpen] = useState(false);
  const subscription = useSubscription();
  const bottom = Math.max(bottomInset, 12);
  // 0 closed, 1 open: drives the turn, the dimming and the choices together
  const progress = useSharedValue(0);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (closing.current) clearTimeout(closing.current); }, []);

  const show = () => {
    if (closing.current) clearTimeout(closing.current);
    setOpen(true);
    progress.set(withTiming(1, MENU_IN));
  };
  /** Turns back into a + first, then takes the menu away. */
  const hide = () => {
    progress.set(withTiming(0, MENU_OUT));
    if (closing.current) clearTimeout(closing.current);
    closing.current = setTimeout(() => setOpen(false), MENU_OUT.duration);
  };
  const toggle = () => {
    void Haptics.selectionAsync().catch(() => {});
    if (open) hide(); else show();
  };
  const go = (href: Href) => {
    void Haptics.selectionAsync().catch(() => {});
    progress.set(0);
    setOpen(false);
    // no subscription (or beyond the plan's team size): the subscribe screen explains instead
    router.navigate(blocked(subscription.sub) ? '/subscribe' as Href : href);
  };
  const from = active ? p.accent : p.inverse;
  const turn = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.get() * 135}deg` }],
  }));
  const button = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.get(), [0, 1], [from, p.inverse]) }));
  const fromIcon = useAnimatedStyle(() => ({ opacity: 1 - progress.get() }));
  const dim = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const rise = useAnimatedStyle(() => ({ opacity: progress.get(), transform: [{ translateY: (1 - progress.get()) * 16 }] }));
  const items: { key: string; label: string; icon: ReactNode; chat?: boolean; onPress: () => void }[] = [
    ...(assistant ? [{ key: 'chat', label: c.talk, chat: true, icon: <FlameIcon size={20} color={p.accent} />, onPress: () => go(assistant.href as Href) }] : []),
    { key: 'capture', label: capture.label, icon: <Feather name="camera" size={19} color={p.ink} />, onPress: () => go(capture.path as Href) },
  ];

  return (
    <>
      <PlusButton label={assistant ? c.addMenu : capture.label} active={active} onPress={toggle} />
      {/* no built-in fade: the menu draws its own, so the button can turn in place over the one below */}
      <Modal visible={open} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={hide}>
        <Animated.View style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.42)' }, dim]}>
          <Pressable accessibilityLabel={c.closeMenu} onPress={hide} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', right: 16, bottom: bottom + TAB_BAR_HEIGHT + 14, alignItems: 'flex-end', gap: 10 }, rise]}>
          {items.map((item) => (
            <Pressable key={item.key} onPress={item.onPress} accessibilityRole="button" accessibilityLabel={item.label}
              style={({ pressed }) => ({
                minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 6, paddingRight: 20, borderRadius: radius.pill,
                backgroundColor: p.card, transform: [{ scale: pressed ? 0.96 : 1 }], ...lift,
              })}>
              <View style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: item.chat ? p.inverse : p.ground }}>
                {item.icon}
              </View>
              <Text style={{ includeFontPadding: false, fontFamily: font.bold, fontSize: 17, color: p.ink }}>{item.label}</Text>
            </Pressable>
          ))}
        </Animated.View>
        {/* sits exactly on the + below and turns into an X (a + turned 135° is an X) */}
        <Pressable onPress={hide} accessibilityRole="button" accessibilityLabel={c.closeMenu} accessibilityState={{ expanded: true }}
          style={({ pressed }) => ({ position: 'absolute', right: 16, bottom, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
          <Animated.View style={[{ width: TAB_BAR_HEIGHT, height: TAB_BAR_HEIGHT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', ...lift }, button]}>
            <Animated.View style={turn}>
              {/* on the Capture page the + starts black on orange: its color fades to the X's as it turns */}
              <Feather name="plus" size={30} color={p.onInverse} />
              {active ? <Animated.View style={[{ position: 'absolute' }, fromIcon]}><Feather name="plus" size={30} color={p.onAccent} /></Animated.View> : null}
            </Animated.View>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

function PlusButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, expanded: false }}
      style={({ pressed }) => ({
        width: TAB_BAR_HEIGHT, height: TAB_BAR_HEIGHT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? p.accent : p.inverse, transform: [{ scale: pressed ? 0.94 : 1 }], ...lift,
      })}>
      <Feather name="plus" size={30} color={active ? p.onAccent : p.onInverse} />
    </Pressable>
  );
}

// a soft shadow so the bar reads as floating over the page, like a card lifted off the ground
const lift = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 } as const;
