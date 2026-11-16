import Feather from '@expo/vector-icons/Feather';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { duration, standardEasing, useMotion } from '@/theme/motion';
import { font, radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import type { IconName } from './ui';

/** How long a toast stays. Long enough to read a short line, short enough not to be in the way. */
const SHOW_MS = 2500;
/** Above the tab bar or a page's footer button. */
const LIFT = 104;

type Toast = { id: number; text: string; icon: IconName };
type ToastApi = { show: (text: string, icon?: IconName) => void };

const Ctx = createContext<ToastApi | null>(null);

/**
 * Small pill (black; white in dark mode) near the bottom saying something just happened ("Saved to Park bathroom").
 * It goes away by itself, and screen readers read it out.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const next = useRef(1);
  const show = useCallback((text: string, icon: IconName = 'check') => {
    setToast({ id: next.current++, text, icon });
    AccessibilityInfo.announceForAccessibility(text);
  }, []);
  // a newer toast replaces the one showing and starts its own wait
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((now) => (now?.id === toast.id ? null : now)), SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {toast ? <ToastPill key={toast.id} text={toast.text} icon={toast.icon} /> : null}
    </Ctx.Provider>
  );
}

function ToastPill({ text, icon }: { text: string; icon: IconName }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const reduced = useMotion() === 'reduced';
  const entering = reduced
    ? FadeIn.duration(duration.fast).reduceMotion(ReduceMotion.Never)
    : FadeInDown.duration(duration.slow).withInitialValues({ transform: [{ translateY: 24 }] }).easing(standardEasing);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + LIFT, alignItems: 'center' }}>
      <Animated.View
        entering={entering}
        exiting={FadeOut.duration(duration.base).reduceMotion(ReduceMotion.Never)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 420, backgroundColor: p.inverse, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 18 }}>
        <Feather name={icon} size={18} color={p.accent} />
        <Text numberOfLines={2} style={{ flexShrink: 1, fontFamily: font.semi, fontSize: 15, color: p.onInverse }}>{text}</Text>
      </Animated.View>
    </View>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
