import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium';
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo/800ExtraBold';
import { useFonts } from '@expo-google-fonts/archivo/useFonts';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps, Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, Notice, Screen, T } from '@/components/ui';
import { userError } from '@/lib/user-errors';
import { AppLock } from '@/components/app-lock';
import { ErrorScreen } from '@/components/error-screen';
import { AuthProvider, useAuth } from '@/data/auth';
import { LiveUpdates } from '@/data/live-updates';
import { StoreProvider } from '@/data/store';
import { SubscriptionProvider, useSubscription } from '@/data/subscription';
import { neverSubscribed } from '@/lib/subscription';
import { LanguageProvider, useLang } from '@/i18n';
import { ThemeModeProvider, useScheme } from '@/theme/theme-mode';
import { dark, light } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = { screenErrorBoundary: ErrorScreen };

export function ErrorBoundary(props: ErrorBoundaryProps) {
  // The root can fail before its language provider mounts.
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  return <LanguageProvider><ErrorScreen {...props} /></LanguageProvider>;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    // gestures (the tab bar's slider) need this around the whole app
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <ThemeModeProvider>
        <LanguageProvider>
          <StoreProvider>
            <AuthProvider>
              <LiveUpdates />
              <AppLock>
                <SubscriptionProvider>
                  <Screens />
                </SubscriptionProvider>
              </AppLock>
            </AuthProvider>
          </StoreProvider>
        </LanguageProvider>
      </ThemeModeProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AccessGate({ route, children }: { route: string; children: ReactNode }) {
  const auth = useAuth();
  const { sub } = useSubscription();
  const { t } = useLang();
  const open = ['sign-in', 'reset-password', 'stripe-done', 'waiting', 'join/index', '+not-found'].includes(route)
    || ['pay/', 'quote/', 'collect/', 'change/', 'join/'].some((prefix) => route.startsWith(prefix));
  if (open) return children;
  if (auth.configured) {
    if (!auth.ready) return <Screen><T>{t('auth.loading')}</T></Screen>;
    if (auth.loadError) return <Screen>
      <Notice text={t('auth.loadFailed', { reason: userError(t, auth.loadError) })} tone="danger" />
      <Button label={t('auth.retry')} onPress={auth.retryLoad} />
    </Screen>;
    if (!auth.session) return <Redirect href="/sign-in" />;
    if (auth.pending) return <Redirect href="/waiting" />;
  }
  // a new business that hasn't started its free trial yet: the owner subscribes first (switched off until launch)
  if (auth.role === 'owner' && neverSubscribed(sub) && !['subscribe', 'setup'].includes(route) && !route.startsWith('settings')) {
    return <Redirect href="/subscribe" />;
  }
  const crew = route === 'crew' || route.startsWith('crew/');
  if (auth.role === 'crew' && !crew) return <Redirect href="/crew" />;
  if (auth.role !== 'crew' && crew) return <Redirect href="/" />;
  return children;
}

/** Light or dark (the owner's choice in Settings) for the navigation and the screens. */
function Screens(): ReactNode {
  const scheme = useScheme();
  const p = scheme === 'dark' ? dark : light;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: p.ground, card: p.card, text: p.ink, border: p.line, primary: p.accent } };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenLayout={({ route, children }) => <AccessGate route={route.name}>{children}</AccessGate>}
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.ground } }}>
        <Stack.Screen name="(tabs)" />
        {/* signing screens: no swipe-back, or a left-to-right signature stroke leaves the screen */}
        <Stack.Screen name="change-order/[id]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="customer/estimate/[id]" options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
        <Stack.Screen name="quote/[token]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="setup" options={{ gestureEnabled: false }} />
        <Stack.Screen name="sign-in" options={{ gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}
