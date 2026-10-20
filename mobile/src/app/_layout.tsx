import {
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/archivo';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/data/auth';
import { StoreProvider } from '@/data/store';
import { LanguageProvider } from '@/i18n';
import { dark, light } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const [loaded, error] = useFonts({ Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  const p = scheme === 'dark' ? dark : light;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: p.ground, card: p.card, text: p.ink, border: p.line, primary: p.accent } };

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <StoreProvider>
          <AuthProvider>
          <ThemeProvider value={theme}>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.ground } }}>
              <Stack.Screen name="(tabs)" />
              {/* signing screens: no swipe-back, or a left-to-right signature stroke leaves the screen */}
              <Stack.Screen name="change-order/[id]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
              <Stack.Screen name="customer/estimate/[id]" options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
              <Stack.Screen name="setup" options={{ gestureEnabled: false }} />
              <Stack.Screen name="sign-in" options={{ gestureEnabled: false }} />
            </Stack>
          </ThemeProvider>
          </AuthProvider>
        </StoreProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
