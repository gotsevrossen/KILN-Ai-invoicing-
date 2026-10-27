import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLang } from '@/i18n';
import { font, radius, space, tap, type Palette } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { useSheetOpen } from './sheet-state';

export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const p = usePalette();
  return <Feather name={name} size={size} color={color ?? p.ink} />;
}

// ---------- Text ----------

type Variant = 'title' | 'h2' | 'h3' | 'eyebrow' | 'body' | 'small' | 'money' | 'moneyBig' | 'label';

const variants: Record<Variant, TextStyle> = {
  title: { fontFamily: font.black, fontSize: 36, lineHeight: 38, letterSpacing: -1, textTransform: 'uppercase' },
  h2: { fontFamily: font.bold, fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontFamily: font.semi, fontSize: 17, lineHeight: 22 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.6, textTransform: 'uppercase' },
  body: { fontSize: 16, lineHeight: 23 },
  small: { fontSize: 14, lineHeight: 19 },
  money: { fontFamily: font.bold, fontSize: 17, fontVariant: ['tabular-nums'] },
  moneyBig: { fontFamily: font.black, fontSize: 46, lineHeight: 50, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  label: { fontSize: 15, fontWeight: '600' },
};

export function T({
  v = 'body',
  muted,
  color,
  style,
  children,
  ...rest
}: {
  v?: Variant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  accessibilityRole?: 'header';
}) {
  const p = usePalette();
  return (
    <Text style={[variants[v], { color: color ?? (muted ? p.muted : p.ink) }, style]} {...rest}>
      {children}
    </Text>
  );
}

// ---------- Layout ----------

export function Screen({
  children,
  footer,
  tabs,
  scroll = true,
  scrollEnabled = true,
  noTopInset,
  header,
}: {
  children: ReactNode;
  /** Pinned above the scrolling content (title, back button, progress). Stays put while scrolling. */
  header?: ReactNode;
  footer?: ReactNode;
  tabs?: boolean;
  scroll?: boolean;
  /** Turn off while the user draws (signature pad) so the page doesn't move under the finger. */
  scrollEnabled?: boolean;
  /** Set when something above the screen (like a banner) already covers the status bar. */
  noTopInset?: boolean;
}) {
  const p = usePalette();
  const content = { padding: space.lg, gap: 14, paddingBottom: tabs ? 120 : space.xxl };
  const sheetOpen = useSheetOpen();
  const top: ('top' | 'bottom')[] = noTopInset ? [] : ['top'];
  return (
    <SafeAreaView edges={footer || tabs ? top : [...top, 'bottom']} style={{ flex: 1, backgroundColor: p.ground }}>
      {header ? <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 4, gap: 12, backgroundColor: p.ground }}>{header}</View> : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={content}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
          // iOS: scrolls the focused text box above the keyboard. Not while a sheet is open: its
          // keyboard isn't this page's, and moving for it could leave the page scrolled past its end.
          automaticallyAdjustKeyboardInsets={!sheetOpen}
          // dropping the keyboard as the drag starts (not following the finger) keeps the page
          // from ending up scrolled into blank space on iPhone
          keyboardDismissMode="on-drag">

          {children}
        </ScrollView>
      ) : (
        <View style={[content, { flex: 1 }]}>{children}</View>
      )}
      {footer ? (
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: p.card, borderTopWidth: 1, borderTopColor: p.line }}>
          <View style={{ padding: space.lg, gap: 10 }}>{footer}</View>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}

export function Hair({ style }: { style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return <View style={[{ height: 1, backgroundColor: p.line }, style]} />;
}

export function Row({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/** A row of buttons that wraps: if the labels don't fit (often in Spanish), the last button moves to its own line. */
export function ButtonRow({ children, gap = space.sm }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap }}>{children}</View>;
}

/** Bloom/LightHouse page head: back + actions, big uppercase title, hairline, small line under. */
export function PageHeader({
  title,
  sub,
  back,
  right,
}: {
  title: string;
  sub?: string;
  back?: () => void;
  right?: ReactNode;
}) {
  const { t } = useLang();
  const heading = (
    <T v="title" accessibilityRole="header" style={{ flexShrink: 1 }}>
      {title}
    </T>
  );
  return (
    <View style={{ gap: 12, marginBottom: 4 }}>
      {back ? (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <IconButton icon="chevron-left" label={t('common.back')} onPress={back} />
            <Row>{right}</Row>
          </Row>
          {heading}
        </>
      ) : (
        // no back button: actions sit on the title's line
        <Row style={{ justifyContent: 'space-between' }} gap={12}>
          {heading}
          {right ? <Row>{right}</Row> : null}
        </Row>
      )}
      <Hair />
      {sub ? <T v="small" muted>{sub}</T> : null}
    </View>
  );
}

// ---------- Cards ----------

export type Tone = 'plain' | 'accent' | 'inverse' | 'flag' | 'danger' | 'soft';

export function toneColors(p: Palette, tone: Tone): { bg: string; fg: string; sub: string } {
  switch (tone) {
    case 'accent':
      return { bg: p.accent, fg: p.onAccent, sub: p.onAccent };
    case 'inverse':
      return { bg: p.inverse, fg: p.onInverse, sub: p.onInverseMuted };
    case 'flag':
      return { bg: p.flag, fg: p.onFlag, sub: p.onFlag };
    case 'danger':
      return { bg: p.danger, fg: p.onDanger, sub: p.onDanger };
    case 'soft':
      return { bg: p.ground, fg: p.ink, sub: p.muted };
    default:
      return { bg: p.card, fg: p.ink, sub: p.muted };
  }
}

export function Card({
  tone = 'plain',
  children,
  style,
  onPress,
  label,
}: {
  tone?: Tone;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  label?: string;
}) {
  const p = usePalette();
  const c = toneColors(p, tone);
  const base: ViewStyle = { backgroundColor: c.bg, borderRadius: radius.md, padding: 18, gap: 10 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [base, style, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

// ---------- Buttons ----------

type ButtonVariant = 'primary' | 'dark' | 'outline' | 'outlineInverse' | 'soft' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  big,
  disabled,
  style,
  flex,
  stacked,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  big?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Grow to fill the row. Put these in a wrapping Row (ButtonRow) so long labels move to a new line. */
  flex?: boolean;
  /** Icon above a small label, for a row of equal tiles (e.g. job actions). */
  stacked?: boolean;
}) {
  const p = usePalette();
  const colors: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: p.accent, fg: p.onAccent },
    dark: { bg: p.inverse, fg: p.onInverse },
    outline: { bg: 'transparent', fg: p.ink, border: p.ink },
    // outline on an inverse card
    outlineInverse: { bg: 'transparent', fg: p.onInverse, border: p.onInverse },
    soft: { bg: p.ground, fg: p.ink },
    ghost: { bg: 'transparent', fg: p.ink },
    // for actions that can't be undone, like deleting
    danger: { bg: p.danger, fg: p.onDanger },
  };
  const c = colors[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        {
          minHeight: stacked ? tap.big + 8 : big ? tap.big : tap.main,
          paddingHorizontal: stacked ? 6 : 16,
          paddingVertical: stacked ? 8 : 0,
          borderRadius: radius.sm,
          backgroundColor: c.bg,
          borderWidth: c.border ? 1.5 : 0,
          borderColor: c.border,
          flexDirection: stacked ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: stacked ? 4 : 8,
          opacity: disabled ? 0.4 : 1,
        },
        // stacked tiles share the row equally; others grow from their own width and wrap when full
        stacked ? { flex: 1 } : flex && { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
        style,
        pressed && styles.pressed,
      ]}>
      {icon ? <Feather name={icon} size={big || stacked ? 22 : 19} color={c.fg} /> : null}
      {stacked ? (
        // whole words wrap to a second line; never a single letter
        <Text numberOfLines={2} style={{ fontFamily: font.semi, fontSize: 14, lineHeight: 17, textAlign: 'center', color: c.fg }}>
          {label}
        </Text>
      ) : (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={{ fontFamily: font.bold, fontSize: big ? 19 : 17, color: c.fg, flexShrink: 1 }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'plain',
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  tone?: 'plain' | 'dark';
}) {
  const p = usePalette();
  const bg = tone === 'dark' ? p.inverse : p.card;
  const fg = tone === 'dark' ? p.onInverse : p.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        { width: tap.min, height: tap.min, borderRadius: radius.pill, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        pressed && styles.pressed,
      ]}>
      <Feather name={icon} size={22} color={fg} />
    </Pressable>
  );
}

export function Pill({ label, tone = 'soft' }: { label: string; tone?: Tone | 'outline' }) {
  const p = usePalette();
  const c = tone === 'outline' ? { bg: 'transparent', fg: p.ink } : toneColors(p, tone);
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: c.bg,
        borderWidth: tone === 'outline' ? 1.5 : 0,
        borderColor: p.ink,
        alignSelf: 'flex-start',
      }}>
      <Text style={{ fontFamily: font.semi, fontSize: 12, color: c.fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A round choice button; black when selected. Use in a wrapping Row for pick-one options. */
export function Chip({
  label,
  selected,
  onPress,
  onPage,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Set when the chip sits on the gray page instead of inside a white card. */
  onPage?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          minHeight: tap.min,
          minWidth: 64,
          paddingHorizontal: 18,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? p.inverse : onPage ? p.card : p.ground,
        },
        pressed && styles.pressed,
      ]}>
      <Text style={{ fontFamily: font.semi, fontSize: 16, color: selected ? p.onInverse : p.ink }}>{label}</Text>
    </Pressable>
  );
}

/** A tappable list row: icon tile, title, subtitle, and an amount or chevron on the right. */
export function ListRow({
  icon,
  iconTone = 'soft',
  title,
  sub,
  right,
  onPress,
  chevron = !!onPress,
}: {
  icon?: IconName;
  iconTone?: Tone;
  title: string;
  sub?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const p = usePalette();
  const c = toneColors(p, iconTone);
  const body = (
    <>
      {icon ? (
        <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={icon} size={22} color={c.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" style={{ fontSize: 16 }}>{title}</T>
        {sub ? <T v="small" muted>{sub}</T> : null}
      </View>
      {right}
      {chevron ? <Feather name="chevron-right" size={22} color={p.muted} /> : null}
    </>
  );
  const style: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [style, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

export function Money({ cents, format, big, color, style }: { cents: number; format: (c: number) => string; big?: boolean; color?: string; style?: StyleProp<TextStyle> }) {
  return (
    <T v={big ? 'moneyBig' : 'money'} color={color} style={style}>
      {format(cents)}
    </T>
  );
}

/** Label on the left, value on the right; used for totals and line items. */
export function LineRow({ label, sub, value, strong }: { label: string; sub?: string; value: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 4 }} gap={12}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v={strong ? 'label' : 'body'}>{label}</T>
        {sub ? <T v="small" muted>{sub}</T> : null}
      </View>
      <T v="money" style={strong ? { fontSize: 19 } : { fontFamily: font.medium }}>{value}</T>
    </Row>
  );
}

// ---------- Inputs ----------

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: p.ground, borderRadius: radius.sm, padding: 4 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              minHeight: tap.min - 4,
              borderRadius: radius.xs,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? p.inverse : 'transparent',
            }}>
            <Text style={{ fontFamily: font.semi, fontSize: 15, color: on ? p.onInverse : p.ink }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SwitchRow({ label, help, value, onChange }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  return (
    <Row style={{ minHeight: tap.min, justifyContent: 'space-between', alignItems: 'center' }} gap={12}>
      <View style={{ flex: 1, gap: 2, justifyContent: 'center' }}>
        {/* no fixed line height, so the text's middle lines up with the switch's middle */}
        <T v="label" style={{ fontSize: 16 }}>{label}</T>
        {help ? <T v="small" muted>{help}</T> : null}
      </View>
      <Switch
        style={{ alignSelf: 'center' }}
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: p.accent, false: p.placeholder }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={p.placeholder}
        // react-native-web colors the "on" knob with its own prop
        {...({ activeThumbColor: '#FFFFFF' } as object)}
      />
    </Row>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      {label ? <T v="label">{label}</T> : null}
      <TextInput
        placeholderTextColor={p.muted}
        accessibilityLabel={label ?? props.placeholder}
        style={[
          {
            minHeight: tap.main,
            borderRadius: radius.sm,
            backgroundColor: p.card,
            borderWidth: 1.5,
            borderColor: p.line,
            paddingHorizontal: 16,
            fontSize: 17,
            color: p.ink,
          },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

export function Checkbox({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: tap.min, paddingVertical: 4 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          borderWidth: 2,
          borderColor: p.ink,
          backgroundColor: value ? p.inverse : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {value ? <Feather name="check" size={18} color={p.onInverse} /> : null}
      </View>
      <T v="body" style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}

/** Grey stand-in for a photo, with its before/during/after tag. */
export function PhotoTile({ tag, height = 96, flex = true }: { tag?: string; height?: number; flex?: boolean }) {
  const p = usePalette();
  return (
    <View
      accessible
      accessibilityLabel={tag ? `Photo: ${tag}` : 'Photo'}
      style={[{ height, borderRadius: radius.xs, backgroundColor: p.placeholder, justifyContent: 'flex-end', padding: 6 }, flex && { flex: 1 }]}>
      <Feather name="image" size={20} color={p.muted} style={{ position: 'absolute', top: height / 2 - 10, alignSelf: 'center' }} />
      {tag ? <Pill label={tag} tone="inverse" /> : null}
    </View>
  );
}

export function Notice({ text, tone = 'inverse', icon = 'check' }: { text: string; tone?: Tone; icon?: IconName }) {
  const p = usePalette();
  const c = toneColors(p, tone);
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.bg, borderRadius: radius.sm, padding: 14 }}>
      <Feather name={icon} size={20} color={c.fg} />
      <T v="label" color={c.fg} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
});
