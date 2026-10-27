import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { LogoMark } from '@/components/logo';
import { Screen, T } from '@/components/ui';
import { useLang } from '@/i18n';

/** Where Stripe's setup page sends the owner back to (in their phone's browser). */
export default function StripeDone() {
  const { t } = useLang();
  const { again } = useLocalSearchParams<{ again?: string }>();
  return (
    <Screen>
      <View style={{ maxWidth: 480, width: '100%', alignSelf: 'center', alignItems: 'center', gap: 16, paddingTop: 48 }}>
        <LogoMark size={56} />
        <T v="title" style={{ fontSize: 26, lineHeight: 30, textAlign: 'center' }}>{t('stripeDone.title')}</T>
        <T v="body" style={{ textAlign: 'center' }}>{again ? t('stripeDone.again') : t('stripeDone.done')}</T>
      </View>
    </Screen>
  );
}
