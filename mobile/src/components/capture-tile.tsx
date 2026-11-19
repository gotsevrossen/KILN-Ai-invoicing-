import Feather from '@expo/vector-icons/Feather';
import { Pressable, Text } from 'react-native';

import { font, radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import type { IconName } from './ui';

/** One of Capture's big square buttons (Receipt, Voice, Photo, Note). Used by owners, managers and crew. */
export function Tile({ icon, label, onPress, accent }: { icon: IconName; label: string; onPress: () => void; accent?: boolean }) {
  const p = usePalette();
  const fg = accent ? p.onAccent : p.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        height: 150,
        borderRadius: radius.md,
        padding: 18,
        justifyContent: 'space-between',
        backgroundColor: accent ? p.accent : p.card,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}>
      <Feather name={icon} size={38} color={fg} />
      <Text style={{ includeFontPadding: false, fontFamily: font.black, fontSize: 24, letterSpacing: -0.5, textTransform: 'uppercase', color: fg }}>{label}</Text>
    </Pressable>
  );
}
