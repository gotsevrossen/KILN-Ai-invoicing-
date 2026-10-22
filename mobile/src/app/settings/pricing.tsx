import { router } from 'expo-router';

import { PercentRow } from '@/components/settings-rows';
import { Card, Hair, PageHeader, Screen, SwitchRow } from '@/components/ui';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';

export default function PricingSettings() {
  const { t } = useLang();
  const { state, actions } = useStore();
  const s = state.settings;

  return (
    <Screen header={<PageHeader title={t('settings.pricing')} back={() => router.back()} />}>
      <Card style={{ gap: 14 }}>
        <PercentRow label={t('settings.markup')} help={t('settings.markupHelp')} bps={s.markupBps} onChange={(markupBps) => actions.updateSettings({ markupBps })} />
        <Hair />
        <PercentRow label={t('settings.taxRate')} bps={s.tax.rateBps} onChange={(rateBps) => actions.updateSettings({ tax: { ...s.tax, rateBps } })} />
        <SwitchRow label={t('settings.taxLabor')} value={s.tax.labor} onChange={(labor) => actions.updateSettings({ tax: { ...s.tax, labor } })} />
        <SwitchRow label={t('settings.taxMaterials')} help={t('settings.taxMaterialsHelp')} value={s.tax.materials} onChange={(materials) => actions.updateSettings({ tax: { ...s.tax, materials } })} />
      </Card>
    </Screen>
  );
}
