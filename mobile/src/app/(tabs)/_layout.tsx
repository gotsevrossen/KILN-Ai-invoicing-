import Feather from '@expo/vector-icons/Feather';
import { Redirect, Tabs, usePathname } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/data/auth';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { font } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

function Loading({ text }: { text: string }) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: p.ground }}>
      <ActivityIndicator color={p.accent} size="large" />
      <Text style={{ fontFamily: font.semi, fontSize: 16, color: p.ink, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

/** The raised orange Capture button in the middle of the tab bar. */
function CaptureButton({ onPress, label }: { onPress?: (e: GestureResponderEvent) => void; label: string }) {
  const p = usePalette();
  const selected = usePathname() === '/capture';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{ flex: 1, alignItems: 'center' }}>
      {({ pressed }) => (
        <>
          <View
            style={{
              width: 66,
              height: 66,
              marginTop: -26,
              borderRadius: 33,
              backgroundColor: selected ? p.inverse : p.accent,
              borderWidth: 4,
              borderColor: p.ground,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.95 : 1 }],
            }}>
            <Feather name="plus" size={32} color={selected ? p.accent : p.onAccent} />
          </View>
          <Text style={{ fontFamily: font.semi, fontSize: 12, marginTop: 2, color: selected ? p.ink : p.muted }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export default function TabLayout() {
  const p = usePalette();
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const { state } = useStore();
  const auth = useAuth();
  if (auth.configured) {
    if (!auth.ready) return <Loading text={t('auth.loading')} />;
    if (!auth.session) return <Redirect href="/sign-in" />;
    if (auth.loadError) return <Loading text={t('auth.loadFailed', { reason: auth.loadError })} />;
  }
  // first run: set up the business before anything else
  if (!state.profile.onboarded) return <Redirect href="/setup" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.ink,
        tabBarInactiveTintColor: p.muted,
        tabBarLabelStyle: { fontFamily: font.semi, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: p.tabBar,
          borderTopColor: p.line,
          height: 68 + insets.bottom,
          paddingTop: 8,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: ({ color }) => <Feather name="home" size={26} color={String(color)} /> }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: t('tabs.capture'),
          tabBarButton: (props) => <CaptureButton onPress={props.onPress} label={t('tabs.capture')} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{ title: t('tabs.jobs'), tabBarIcon: ({ color }) => <Feather name="briefcase" size={26} color={String(color)} /> }}
      />
    </Tabs>
  );
}
