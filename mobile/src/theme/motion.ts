import { useEffect, useRef, useState } from 'react';
import { Easing, FadeIn, FadeInDown, FadeOut, LinearTransition, ReduceMotion, useReducedMotion, type WithSpringConfig } from 'react-native-reanimated';

// Shared motion: short, quiet, and the same everywhere. With the phone's Reduce Motion on,
// nothing moves or grows; only quick fades remain.

export const duration = { fast: 120, base: 200, slow: 320 } as const;

/** Starts quick and settles gently: for things that move or change color. */
export const standardEasing = Easing.bezier(0.2, 0, 0, 1);

/** A press: a firm, quick spring with no wobble. */
export const pressSpring: WithSpringConfig = { damping: 22, stiffness: 420, mass: 0.6 };

/** A check mark popping in. A little bounce, settled in about a quarter second. */
export const popSpring: WithSpringConfig = { damping: 13, stiffness: 320, mass: 0.6 };

export type Motion = 'full' | 'reduced';

/** "reduced" when the phone's Reduce Motion setting is on. */
export function useMotion(): Motion {
  return useReducedMotion() ? 'reduced' : 'full';
}

/**
 * Items in a list fade (and rise a little) in when added, fade out when removed, and their
 * neighbors slide into place. Reduce Motion: fades only, no sliding.
 */
export function useListMotion() {
  const reduced = useMotion() === 'reduced';
  // fades run even with Reduce Motion (Reanimated would otherwise skip them too)
  const entering = reduced
    ? FadeIn.duration(duration.fast).reduceMotion(ReduceMotion.Never)
    : FadeInDown.duration(duration.base).withInitialValues({ transform: [{ translateY: 8 }] }).easing(standardEasing);
  const exiting = FadeOut.duration(reduced ? duration.fast : 180).reduceMotion(ReduceMotion.Never);
  const layout = reduced ? undefined : LinearTransition.duration(220).easing(standardEasing);
  return { entering, exiting, layout };
}

/**
 * A number that counts from its old value to a new one (about 400 ms) when it changes while
 * on screen. First show, and Reduce Motion: the number as it is. For display only: the value
 * shown at the end is exactly `value`.
 */
export function useCountUp(value: number, ms = 400): number {
  const reduced = useMotion() === 'reduced';
  const [shown, setShown] = useState(value);
  // what's on screen now, so a change mid-count carries on from there
  const now = useRef(value);
  useEffect(() => {
    const start = now.current;
    if (reduced || start === value || typeof requestAnimationFrame !== 'function') {
      now.current = value;
      setShown(value);
      return;
    }
    const began = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - began) / ms);
      // ease out: quick at first, settling on the new number
      const eased = 1 - (1 - t) ** 3;
      now.current = t >= 1 ? value : Math.round(start + (value - start) * eased);
      setShown(now.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, ms]);
  return shown;
}
