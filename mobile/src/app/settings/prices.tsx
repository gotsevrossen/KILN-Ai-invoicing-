import { router } from 'expo-router';

import { PriceListEditor } from '@/components/price-list-editor';
import { Card, ListRow, PageHeader, Screen } from '@/components/ui';
import { aiReady } from '@/data/ai';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';

export default function PriceSettings() {
  const { t } = useLang();
  const { state, actions } = useStore();

  return (
    <Screen header={<PageHeader title={t('settings.priceList')} sub={t('settings.priceListHelp')} back={() => router.back()} />}>
      {aiReady(state.mode) ? (
        <Card style={{ paddingVertical: 6 }}>
          <ListRow icon="camera" iconTone="accent" title={t('ai.importButton')} sub={t('ai.importSub')} onPress={() => router.push('/settings/import-prices')} />
        </Card>
      ) : null}
      <Card style={{ gap: 12 }}>
        <PriceListEditor items={state.priceList} onChange={actions.setPrice} />
      </Card>
    </Screen>
  );
}
