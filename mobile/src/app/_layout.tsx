import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium';
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo/800ExtraBold';
import { useFonts } from '@expo-google-fonts/archivo/useFonts';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps, Redirect, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorScreen } from '@/components/error-screen';
import { AuthProvider, useAuth } from '@/data/auth';
import { StoreProvider } from '@/data/store';
import { LanguageProvider } from '@/i18n';
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
    <SafeAreaProvider>
      <ThemeModeProvider>
        <LanguageProvider>
          <StoreProvider>
            <AuthProvider>
              <Screens />
            </AuthProvider>
          </StoreProvider>
        </LanguageProvider>
      </ThemeModeProvider>
    </SafeAreaProvider>
  );
}

/** Light or dark (the owner's choice in Settings) for the navigation and the screens. */
function Screens(): ReactNode {
  const auth = useAuth();
  const pathname = usePathname();
  const scheme = useScheme();
  const p = scheme === 'dark' ? dark : light;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: p.ground, card: p.card, text: p.ink, border: p.line, primary: p.accent } };

  const helperAllowed = pathname === '/team-work' || pathname === '/sign-in' || ['/pay/', '/quote/', '/collect/', '/join/'].some((prefix) => pathname.startsWith(prefix));
  if (auth.ready && auth.role === 'helper' && !helperAllowed) return <Redirect href="/team-work" />;
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.ground } }}>
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
