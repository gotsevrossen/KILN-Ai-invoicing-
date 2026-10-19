import { useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { T } from './ui';

type Point = { x: number; y: number };

const HEIGHT = 150;

function toPath(points: Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M${first.x.toFixed(1)} ${first.y.toFixed(1)}` + rest.map((pt) => ` L${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join('');
}

/**
 * Finger signature. Calls onInk() when the signer starts drawing.
 * To clear it, the parent changes its `key` so a fresh pad mounts.
 */
export function SignaturePad({ placeholder, label, onInk }: { placeholder: string; label: string; onInk: () => void }) {
  const p = usePalette();
  const [width, setWidth] = useState(0);
  const [strokes, setStrokes] = useState<Point[][]>([]);

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        setStrokes((all) => [...all, [{ x, y }]]);
        onInk();
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        setStrokes((all) => (all.length === 0 ? all : [...all.slice(0, -1), [...all[all.length - 1], { x, y }]]));
      },
    }),
  );

  return (
    <View
      accessible
      accessibilityLabel={label}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: HEIGHT, borderRadius: radius.sm, backgroundColor: p.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.ink, overflow: 'hidden' }}
      {...responder.panHandlers}>
      {strokes.length === 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <T v="body" muted>{placeholder}</T>
        </View>
      ) : null}
      <Svg width={width} height={HEIGHT} pointerEvents="none">
        <Line x1={16} y1={HEIGHT - 32} x2={Math.max(16, width - 16)} y2={HEIGHT - 32} stroke={p.muted} strokeWidth={1} />
        {strokes.map((s, i) => (
          <Path key={i} d={toPath(s)} stroke={p.ink} strokeWidth={2.75} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
    </View>
  );
}
