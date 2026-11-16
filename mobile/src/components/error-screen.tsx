import type { ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useLang } from '@/i18n';
import { usePalette } from '@/theme/use-palette';

/** Also works before fonts or business data load. Never render exception details here. */
export function ErrorScreen({ retry }: ErrorBoundaryProps) {
  const { t } = useLang();
  const p = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: p.ground, padding: 32, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      <Text accessibilityRole="header" style={{ color: p.ink, fontSize: 24, fontWeight: '700', textAlign: 'center' }}>{t('errors.screenTitle')}</Text>
      <Text accessibilityRole="alert" style={{ color: p.ink, fontSize: 17, lineHeight: 25, textAlign: 'center', maxWidth: 480 }}>{t('errors.screenBody')}</Text>
      <Pressable accessibilityRole="button" onPress={() => void retry()} style={{ backgroundColor: p.accent, padding: 18, borderRadius: 12, minHeight: 48 }}>
        <Text style={{ color: p.onAccent, fontWeight: '700', fontSize: 17 }}>{t('auth.retry')}</Text>
      </Pressable>
    </View>
  );
}
