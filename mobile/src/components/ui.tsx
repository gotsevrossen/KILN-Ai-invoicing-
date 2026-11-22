import Feather from '@expo/vector-icons/Feather';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
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
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { pullRefresh } from '@/data/live-events';
import { useLang } from '@/i18n';
import { font, radius, space, tap, type Palette } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { FloatingFooter } from './floating-footer';
import { useSheetOpen } from './sheet-state';
import { swipeTab } from './tab-swipe';

export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const p = usePalette();
  return <Feather name={name} size={size} color={color ?? p.ink} />;
}

// ---------- Text ----------

// Android adds room above and below text for the font's tallest marks (Archivo has a lot), which
// leaves words sitting off-center in buttons and rows. Off, the space around text is even.
const noFontPadding: TextStyle = { includeFontPadding: false, textAlignVertical: 'center' };

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
    <Text style={[noFontPadding, variants[v], { color: color ?? (muted ? p.muted : p.ink) }, style]} {...rest}>
      {children}
    </Text>
  );
}

// ---------- Layout ----------

export function Screen({
  children,
  footer,
  tabs,
  floatingBar = tabs,
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
  /** Reserve space for a floating control without enabling tab swipes. */
  floatingBar?: boolean;
  scroll?: boolean;
  /** Turn off while the user draws (signature pad) so the page doesn't move under the finger. */
  scrollEnabled?: boolean;
  /** Set when something above the screen (like a banner) already covers the status bar. */
  noTopInset?: boolean;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  // room for the floating menu (64), the gap below it, the phone's home area, and the fade above
  // the bar (40, components/tab-bar.tsx), so the last card can scroll fully clear of it
  // a floating footer reports its height, so the last item can scroll clear of it
  const [footerHeight, setFooterHeight] = useState(0);
  const content = { padding: space.lg, gap: 14, paddingBottom: floatingBar ? 64 + Math.max(insets.bottom, 12) + 40 + space.lg
    : footer ? footerHeight + space.md : space.xxl };
  const sheetOpen = useSheetOpen();
  const top: ('top' | 'bottom')[] = noTopInset ? [] : ['top'];
  const [pulling, setPulling] = useState(false);
  const onPull = () => {
    setPulling(true);
    const started = Date.now();
    void Promise.resolve().then(pullRefresh).catch(() => {}).finally(() => {
      setTimeout(() => setPulling(false), Math.max(0, 450 - (Date.now() - started)));
    });
  };
  // Tab pages: a clear sideways swipe moves to the next page (left) or the previous one (right).
  // It starts only after 25 points sideways and gives way to vertical scrolling, so scrolling and
  // taps work as before. Off on the web, where a mouse drag selects text.
  const swipe = usePanGesture({
    runOnJS: true,
    enabled: !!tabs && !sheetOpen && Platform.OS !== 'web',
    activeOffsetX: [-25, 25],
    failOffsetY: [-15, 15],
    onDeactivate: (e) => {
      if (e.canceled) return;
      const far = Math.abs(e.translationX) > 80;
      const quick = Math.abs(e.translationX) > 40 && Math.abs(e.velocityX) > 500;
      if (far || quick) swipeTab(e.translationX < 0 ? 1 : -1);
    },
  });
  return (
    <GestureDetector gesture={swipe}>
    <SafeAreaView edges={footer || floatingBar ? top : [...top, 'bottom']} style={{ flex: 1, backgroundColor: p.ground }}>
      {header ? <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 4, gap: 12, backgroundColor: p.ground }}>{header}</View> : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={content}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
          refreshControl={<RefreshControl enabled={scrollEnabled} refreshing={pulling} onRefresh={scrollEnabled ? onPull : undefined}
            tintColor={p.accent} colors={[p.accent]} progressBackgroundColor={p.card} />}
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
      {footer ? <FloatingFooter onHeight={setFooterHeight}>{footer}</FloatingFooter> : null}
    </SafeAreaView>
    </GestureDetector>
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
  beside,
  inline,
}: {
  title: string;
  sub?: string;
  back?: () => void;
  right?: ReactNode;
  /** Shown on the title's line, right after it (e.g. the job the KILN chat is about). */
  beside?: ReactNode;
  /** The title on the back button's line instead of below it (the KILN chat). */
  inline?: boolean;
}) {
  const { t } = useLang();
  const titleText = (
    <T v="title" accessibilityRole="header" style={{ flexShrink: beside ? 0 : 1 }}>
      {title}
    </T>
  );
  const heading = beside ? <Row gap={12} style={{ alignItems: 'center', flexShrink: 1 }}>{titleText}{beside}</Row> : titleText;
  return (
    <View style={{ gap: 12, marginBottom: 4 }}>
      {back && inline ? (
        <Row gap={8}>
          <IconButton icon="chevron-left" label={t('common.back')} onPress={back} />
          <View style={{ flex: 1, minWidth: 0 }}>{heading}</View>
          {right ? <Row>{right}</Row> : null}
        </Row>
      ) : back ? (
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

/**
 * A card holding tappable rows (ListRow) separated by hairlines. Its padding is matched to the
 * rows, so the space above the first row and below the last equals the space at the sides;
 * a plain Card's padding plus each row's own padding left extra room top and bottom.
 */
export function ListCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  // a row is 64 tall with a 46 icon: 9 above the icon + 7 here = the 16 at the sides
  return <Card style={[{ paddingVertical: 7, paddingHorizontal: 16, gap: 0 }, style]}>{children}</Card>;
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
        <Text numberOfLines={2} style={[noFontPadding, { fontFamily: font.semi, fontSize: 14, lineHeight: 17, textAlign: 'center', color: c.fg }]}>
          {label}
        </Text>
      ) : (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={[noFontPadding, { fontFamily: font.bold, fontSize: big ? 19 : 17, lineHeight: big ? 24 : 22, color: c.fg, flexShrink: 1 }]}>
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
  glyph,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  tone?: 'plain' | 'dark' | 'accent';
  /** Draws this instead of the Feather icon (e.g. KILN's flame), given the button's text color. */
  glyph?: (color: string) => ReactNode;
}) {
  const p = usePalette();
  const colors = {
    plain: { bg: p.card, fg: p.ink },
    dark: { bg: p.inverse, fg: p.onInverse },
    accent: { bg: p.accent, fg: p.onAccent },
  };
  const { bg, fg } = colors[tone];
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
      {glyph ? glyph(fg) : <Feather name={icon} size={22} color={fg} />}
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
      <Text style={[noFontPadding, { fontFamily: font.semi, fontSize: 16, color: selected ? p.onInverse : p.ink }]}>{label}</Text>
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
  const style: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 8 };
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
            <Text style={[noFontPadding, { fontFamily: font.semi, fontSize: 15, color: on ? p.onInverse : p.ink }]}>{o.label}</Text>
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
          props.multiline && { paddingVertical: 14, textAlignVertical: 'top' },
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
      style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: tap.min, paddingVertical: 6 }}>
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
