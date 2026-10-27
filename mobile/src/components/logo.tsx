import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

// The receipt from KILN's logo, in the logo's own coordinates (assets/images/icon.png).
const PAPER = 'M0 0H436V638L382 693L327 638L273 693L218 638L164 693L109 638L55 693L0 638Z';
const BARS: [number, number][] = [[82, 21], [123, 14], [157, 34], [211, 14], [245, 34], [293, 14], [327, 27]];
const LOGO_ORANGE = '#F0844C'; // kiln orange, same as the app's accent
const LOGO_INK = '#1F1C19';

/** KILN's logo: the white receipt on an orange rounded square. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: LOGO_ORANGE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size * 0.426} height={size * 0.677} viewBox="0 0 436 693">
        <Path d={PAPER} fill="#FFFFFF" />
        <Rect x={82} y={95} width={272} height={41} rx={20.5} fill={LOGO_INK} />
        <Rect x={82} y={177} width={177} height={41} rx={20.5} fill={LOGO_INK} />
        {BARS.map(([x, w]) => <Rect key={x} x={x} y={326} width={w} height={232} fill={LOGO_INK} />)}
      </Svg>
    </View>
  );
}
