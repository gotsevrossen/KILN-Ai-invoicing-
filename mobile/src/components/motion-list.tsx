import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';

import { useListMotion } from '@/theme/motion';

/**
 * Wrap a list in this: items already there when the page opens just show (no staggered
 * entrance); items added later fade in, and removed ones fade out.
 */
export function ListGroup({ children }: { children: ReactNode }) {
  return <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>;
}

/** One item in a list: fades and rises a little in when added, fades out when removed, and slides when its neighbors change. */
export function ListItem({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { entering, exiting, layout } = useListMotion();
  return <Animated.View entering={entering} exiting={exiting} layout={layout} style={style}>{children}</Animated.View>;
}
