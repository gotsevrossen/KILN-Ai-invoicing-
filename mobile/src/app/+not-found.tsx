import { router } from 'expo-router';

import { Button, Screen, T } from '@/components/ui';
import { useLang } from '@/i18n';

export default function NotFound() {
  const { t } = useLang();
  return (
    <Screen>
      <T v="body">{t('common.notFound')}</T>
      <Button label={t('common.goHome')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
