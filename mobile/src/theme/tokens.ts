// KILN design tokens. Same family as LightHouse and Bloom (gray ground, white
// rounded cards, black ink, one strong color card, heavy uppercase titles),
// tuned for trades: bigger tap targets and higher contrast for sunlight.

export type Palette = {
  ground: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  inverse: string;
  onInverse: string;
  onInverseMuted: string;
  flag: string;
  onFlag: string;
  danger: string;
  onDanger: string;
  placeholder: string;
  tabBar: string;
};

export const light: Palette = {
  ground: '#E9E9E9',
  card: '#FFFFFF',
  ink: '#000000',
  muted: '#4B524F',
  line: 'rgba(0,0,0,0.18)',
  accent: '#F0844C',
  onAccent: '#000000',
  accentSoft: 'rgba(240,132,76,0.18)',
  inverse: '#000000',
  onInverse: '#FFFFFF',
  onInverseMuted: '#C9C9C2',
  flag: '#F2C14E',
  onFlag: '#000000',
  danger: '#BF4536',
  onDanger: '#FFFFFF',
  placeholder: '#CFCFCB',
  tabBar: 'rgba(255,255,255,0.96)',
};

export const dark: Palette = {
  ground: '#0E0E0F',
  card: '#1C1C1E',
  ink: '#F5F5F3',
  muted: '#A9ADAB',
  line: 'rgba(255,255,255,0.16)',
  accent: '#F0844C',
  onAccent: '#000000',
  accentSoft: 'rgba(240,132,76,0.22)',
  inverse: '#F5F5F3',
  onInverse: '#000000',
  onInverseMuted: '#4B524F',
  flag: '#F2C14E',
  onFlag: '#000000',
  danger: '#E0604F',
  onDanger: '#000000',
  placeholder: '#3A3A3D',
  tabBar: 'rgba(28,28,30,0.96)',
};

export const radius = { lg: 32, md: 24, sm: 18, xs: 12, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Minimum tap heights. Owners use the app with gloves and dirty hands. */
export const tap = { min: 48, main: 56, big: 64 } as const;

export const font = {
  black: 'Archivo_800ExtraBold',
  bold: 'Archivo_700Bold',
  semi: 'Archivo_600SemiBold',
  medium: 'Archivo_500Medium',
} as const;
