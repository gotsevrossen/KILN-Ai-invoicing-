import { router } from 'expo-router';

import { PriceListEditor } from '@/components/price-list-editor';
import { Card, PageHeader, Screen } from '@/components/ui';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';

export default function PriceSettings() {
  const { t } = useLang();
  const { state, actions } = useStore();

  return (
    <Screen header={<PageHeader title={t('settings.priceList')} sub={t('settings.priceListHelp')} back={() => router.back()} />}>
      <Card style={{ gap: 12 }}>
        <PriceListEditor items={state.priceList} onChange={actions.setPrice} />
      </Card>
    </Screen>
  );
}
