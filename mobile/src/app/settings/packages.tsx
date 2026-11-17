import { router } from 'expo-router';

import { ServicePackages } from '@/components/service-packages';
import { PageHeader, Screen } from '@/components/ui';
import { useLang } from '@/i18n';

export default function PackagesSettings() {
  const { t } = useLang();
  return <Screen header={<PageHeader title={t('packages.title')} back={() => router.back()} />}><ServicePackages /></Screen>;
}
