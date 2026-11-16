import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import type { Stage } from '@/data/selectors';
import { useLang } from '@/i18n';
import { duration, standardEasing, useMotion } from '@/theme/motion';
import { font } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { Pop } from './ui';

const STEPS: Stage[] = ['estimate', 'work', 'invoice', 'paid'];
/** About how long a stage change takes to draw: the line fills, then the circle changes. */
const CHANGE_MS = 300;

/**
 * One half of the line between two circles. `connector` n joins circle n-1 to circle n;
 * it's filled once `done` (how many steps are done) reaches n, and fills smoothly on the way.
 */
function Half({ done, connector, side, hidden }: { done: SharedValue<number>; connector: number; side: 'left' | 'right'; hidden: boolean }) {
  const p = usePalette();
  const fill = useAnimatedStyle(() => {
    // the connector's own progress, 0 to 1; the right half of a circle fills first, then the left
    const f = Math.min(1, Math.max(0, done.get() - (connector - 1)));
    const part = side === 'right' ? Math.min(1, f * 2) : Math.max(0, f * 2 - 1);
    return { width: `${part * 100}%` };
  });
  return (
    <View style={{ flex: 1, height: 2, backgroundColor: hidden ? 'transparent' : p.line }}>
      {hidden ? null : <Animated.View style={[{ height: 2, backgroundColor: p.inverse }, fill]} />}
    </View>
  );
}

/** A step's circle. Its color moves from empty to orange (now) to black (done). */
function Dot({ look, n }: { look: 0 | 1 | 2; n: number }) {
  const p = usePalette();
  const reduced = useMotion() === 'reduced';
  const v = useSharedValue<number>(look);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // after the line has mostly filled in
    v.set(withTiming(look, { duration: reduced ? duration.fast : CHANGE_MS, easing: standardEasing }));
  }, [look, reduced, v]);
  const ground = p.ground;
  const colors = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(v.get(), [0, 1, 2], [ground, p.accent, p.inverse]),
    borderColor: interpolateColor(v.get(), [0, 1, 2], [p.line, p.accent, p.inverse]),
  }));
  const fg = look === 2 ? p.onInverse : look === 1 ? p.onAccent : p.muted;
  return (
    <Animated.View style={[{ width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, colors]}>
      {look === 2 ? null : <Text style={{ fontFamily: font.bold, fontSize: 14, color: fg }}>{n}</Text>}
      {/* always there, so a step that gets done while the page is open pops its check in */}
      <View style={{ position: 'absolute' }}>
        <Pop on={look === 2}><Feather name="check" size={17} color={p.onInverse} /></Pop>
      </View>
    </Animated.View>
  );
}

/**
 * Estimate · Work · Invoice · Paid, with done steps checked and the current step in orange.
 * A step with an action in `onStep` can be tapped (open that step's page, or go back to it).
 * When the stage changes while the page is open, the line fills and the next circle changes
 * color; on first show it's drawn as it is.
 */
export function Stepper({ stage, onStep = {} }: { stage: Stage; onStep?: Partial<Record<Stage, () => void>> }) {
  const p = usePalette();
  const { t } = useLang();
  const reduced = useMotion() === 'reduced';
  const current = STEPS.indexOf(stage);
  // a paid job has every step done
  const doneUpTo = stage === 'paid' ? STEPS.length : current;

  const done = useSharedValue(doneUpTo);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    done.set(reduced ? doneUpTo : withTiming(doneUpTo, { duration: CHANGE_MS, easing: standardEasing }));
  }, [doneUpTo, reduced, done]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {STEPS.map((step, i) => {
        const isDone = i < doneUpTo;
        const now = i === current && stage !== 'paid';
        const action = onStep[step];
        return (
          <Pressable
            key={step}
            onPress={action}
            disabled={!action}
            accessibilityRole={action ? 'button' : 'text'}
            accessibilityState={{ selected: now, disabled: !action }}
            accessibilityLabel={t('flow.stepOf', { n: i + 1, name: t(`flow.${step}`) })}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 4, minHeight: 52, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <Half done={done} connector={i} side="left" hidden={i === 0} />
              <Dot look={isDone ? 2 : now ? 1 : 0} n={i + 1} />
              <Half done={done} connector={i + 1} side="right" hidden={i === STEPS.length - 1} />
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ fontFamily: now ? font.bold : font.medium, fontSize: 13, color: isDone || now ? p.ink : p.muted }}>
              {t(`flow.${step}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
