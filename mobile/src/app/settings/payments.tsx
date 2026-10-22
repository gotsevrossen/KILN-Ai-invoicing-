import { router } from 'expo-router';

import { DueDaysPicker, PercentRow } from '@/components/settings-rows';
import { Card, Hair, PageHeader, Screen, SwitchRow } from '@/components/ui';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';

export default function PaymentSettings() {
  const { t } = useLang();
  const { state, actions } = useStore();
  const s = state.settings;

  return (
    <Screen header={<PageHeader title={t('settings.payments')} back={() => router.back()} />}>
      <Card style={{ gap: 14 }}>
        <DueDaysPicker days={s.dueDays} onChange={(dueDays) => actions.updateSettings({ dueDays })} />
        <Hair />
        <PercentRow label={t('settings.deposit')} help={t('settings.depositHelp')} bps={s.depositBps} onChange={(depositBps) => actions.updateSettings({ depositBps })} />
        <Hair />
        <SwitchRow label={t('settings.cardFee')} help={t('settings.cardFeeHelp')} value={state.cardFee} onChange={actions.setCardFee} />
      </Card>
    </Screen>
  );
}
