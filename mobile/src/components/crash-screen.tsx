import Feather from '@expo/vector-icons/Feather';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text, View, useColorScheme } from 'react-native';

import { deviceLang, translate } from '@/i18n';
import { dark, font, light, radius, tap } from '@/theme/tokens';

/**
 * Shown instead of a blank or red screen when a page breaks. It sits outside the app's own
 * providers (they may be what broke), so it reads nothing from them: the phone's language and
 * light or dark setting only.
 */
export function CrashScreen({ retry }: ErrorBoundaryProps) {
  const p = useColorScheme() === 'dark' ? dark : light;
  const lang = deviceLang();
  const goHome = () => {
    // leave the broken page first, so trying again doesn't land on it
    try {
      router.replace('/');
    } catch {
      // no navigation yet: trying again is all there is
    }
    void retry();
  };
  const button = (label: string, onPress: () => void, filled: boolean) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: tap.big,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        backgroundColor: filled ? p.accent : 'transparent',
        borderWidth: filled ? 0 : 1.5,
        borderColor: p.ink,
        opacity: pressed ? 0.85 : 1,
      })}>
      <Text style={{ fontFamily: font.bold, fontSize: 19, color: filled ? p.onAccent : p.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14, backgroundColor: p.ground }}>
      <View style={{ backgroundColor: p.card, borderRadius: radius.md, padding: 22, gap: 10 }}>
        <Feather name="alert-triangle" size={32} color={p.ink} />
        <Text accessibilityRole="header" style={{ fontFamily: font.black, fontSize: 28, lineHeight: 31, letterSpacing: -0.5, textTransform: 'uppercase', color: p.ink }}>
          {translate(lang, 'crash.title')}
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 23, color: p.muted }}>{translate(lang, 'crash.body')}</Text>
      </View>
      {button(translate(lang, 'crash.retry'), () => void retry(), true)}
      {button(translate(lang, 'common.goHome'), goHome, false)}
    </View>
  );
}
