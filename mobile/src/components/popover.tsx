import Feather from '@expo/vector-icons/Feather';
import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, type HostInstance } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useLang } from '@/i18n';
import { radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { sheetShown } from './sheet-state';
import { IconButton, Row, T, type IconName } from './ui';

const EDGE = 12;
// the first part of opening is the button sliding over; the rest is it growing into the menu
const SLIDE = 0.2;

type Box = { x: number; y: number; w: number; h: number };

/**
 * A round button that turns into a menu. Opening, the button slides over to `to` (another header
 * button), then grows from there into a card that covers the header, only as tall as what's in it.
 * Closing runs the same way backwards. `onVisible` tells the page to hide the real button while
 * this stand-in is on screen, so it looks like the button itself moves.
 */
export function ButtonMenu({ open, onClose, from, to, icon, tone, title, onVisible, width = 400, children }: {
  open: boolean;
  onClose: () => void;
  /** The button that opens the menu. */
  from: RefObject<HostInstance | null>;
  /** The menu's top-right corner lands on this button's top-right corner. */
  to: RefObject<HostInstance | null>;
  icon: IconName;
  tone: 'plain' | 'dark';
  title: string;
  onVisible?: (visible: boolean) => void;
  width?: number;
  children: ReactNode;
}) {
  const p = usePalette();
  const { t } = useLang();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // stays true while it shrinks back, so it isn't cut off mid-way
  const [shown, setShown] = useState(open);
  const [boxes, setBoxes] = useState<{ from: Box; to: Box } | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  if (open && !shown) setShown(true);
  // 0 = the button in its own place, SLIDE = over `to`, 1 = the full menu
  const grow = useSharedValue(0);
  const height = useSharedValue(0);

  // the real button hides only once the stand-in is drawn over it, so neither blinks
  const standIn = shown && !!boxes;
  useEffect(() => { onVisible?.(standIn); }, [standIn, onVisible]);
  // counted like a sheet, so the page underneath stops swiping and leaves the keyboard alone
  useLayoutEffect(() => (shown ? sheetShown() : undefined), [shown]);

  // where both buttons are on screen, measured each time it opens
  useLayoutEffect(() => {
    if (!open) return;
    from.current?.measureInWindow((x, y, w, h) => {
      to.current?.measureInWindow((x2, y2, w2, h2) => setBoxes({ from: { x, y, w, h }, to: { x: x2, y: y2, w: w2, h: h2 } }));
    });
  }, [open, from, to, window.width, window.height]);

  const w = Math.min(width, window.width - EDGE * 2);
  const top = boxes ? boxes.to.y : 0;
  const right = boxes ? Math.max(EDGE, window.width - (boxes.to.x + boxes.to.w)) : EDGE;
  const maxHeight = Math.max(200, window.height - top - Math.max(insets.bottom, EDGE) - EDGE);
  const target = Math.min(contentHeight, maxHeight);
  const btnW = boxes?.from.w ?? 48;
  const btnH = boxes?.from.h ?? 48;
  // where the opening button sits, from the menu's top-right corner (it slides from there)
  const startX = boxes ? boxes.from.x + boxes.from.w - (boxes.to.x + boxes.to.w) : 0;
  const startY = boxes ? boxes.from.y - boxes.to.y : 0;
  const ready = !!boxes && target > 0;

  // the menu follows its content as it changes (a filter row appearing, KILN's search answer)
  useEffect(() => {
    if (!target) return;
    if (height.get() === 0) height.set(target);
    else height.set(withTiming(target, { duration: 200, easing: Easing.out(Easing.cubic) }));
  }, [target, height]);

  useEffect(() => {
    if (open && ready) grow.set(withTiming(1, { duration: 340, easing: Easing.linear }));
    if (!open) {
      grow.set(withTiming(0, { duration: 260, easing: Easing.linear }, (finished) => {
        // reopened before it finished closing: stay shown
        if (finished) scheduleOnRN(setShown, false);
      }));
    }
  }, [open, ready, grow]);

  const bg = tone === 'dark' ? p.inverse : p.card;
  const fg = tone === 'dark' ? p.onInverse : p.ink;

  // size, corner and position: a round button sliding over, then a card growing down and left
  const shape = useAnimatedStyle(() => {
    const g = grow.get();
    const slide = 1 - (1 - Math.min(1, g / SLIDE)) ** 3;
    const e = 1 - (1 - Math.max(0, Math.min(1, (g - SLIDE) / (1 - SLIDE)))) ** 3;
    return {
      width: btnW + (w - btnW) * e,
      height: btnH + (height.get() - btnH) * e,
      borderRadius: btnH / 2 + (radius.md - btnH / 2) * e,
      transform: [{ translateX: startX * (1 - slide) }, { translateY: startY * (1 - slide) }],
    };
  });
  const corner = useAnimatedStyle(() => {
    const e = 1 - (1 - Math.max(0, Math.min(1, (grow.get() - SLIDE) / (1 - SLIDE)))) ** 3;
    return { borderRadius: btnH / 2 + (radius.md - btnH / 2) * e };
  });
  // the button's own color fades to the menu's as it opens up
  const fill = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (grow.get() - SLIDE) / 0.25)) }));
  const buttonIcon = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, Math.min(1, (grow.get() - SLIDE) / 0.15)) }));
  const content = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (grow.get() - 0.45) / 0.45)) }));
  const shade = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, grow.get() / SLIDE - 0.5)) }));

  return (
    <Modal visible={shown} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }, shade]}>
        <Pressable accessibilityLabel={t('common.close')} onPress={onClose} style={{ flex: 1 }} />
      </Animated.View>
      {boxes ? (
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={[{
            position: 'absolute', top, right, backgroundColor: bg,
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10,
          }, shape]}>
          <Animated.View style={[{ position: 'absolute', inset: 0, overflow: 'hidden' }, corner]}>
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, backgroundColor: p.card }, fill]} />
            {/* laid out at full size from the start (that's how its height is known), revealed as the card grows */}
            <Animated.View style={[{ position: 'absolute', top: 0, right: 0, width: w }, content]}>
              <ScrollView style={{ maxHeight }} contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: 12 }} keyboardShouldPersistTaps="handled"
                onContentSizeChange={(_, h) => setContentHeight(Math.ceil(h))}>
                {/* the close button sits exactly where the other header button was */}
                <Row style={{ justifyContent: 'space-between', marginRight: -space.lg, height: btnH }}>
                  <T v="h2" accessibilityRole="header" style={{ flexShrink: 1 }}>{title}</T>
                  <IconButton icon="x" label={t('common.close')} onPress={onClose} />
                </Row>
                {children}
              </ScrollView>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, right: 0, width: btnW, height: btnH, alignItems: 'center', justifyContent: 'center' }, buttonIcon]}>
              <Feather name={icon} size={22} color={fg} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </Modal>
  );
}
