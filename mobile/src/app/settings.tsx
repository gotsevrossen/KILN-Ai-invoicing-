import { router } from 'expo-router';

import { Card, Hair, LineRow, Notice, PageHeader, Screen, Segmented, SwitchRow, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';

export default function Settings() {
  const { t, lang, setLang } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();

  return (
    <Screen>
      <PageHeader title={t('settings.title')} back={() => router.back()} />

      <Card style={{ gap: 12 }}>
        <T v="eyebrow">{t('settings.language')}</T>
        <Segmented
          label={t('settings.language')}
          value={lang}
          onChange={setLang}
          options={[
            { key: 'en', label: 'English' },
            { key: 'es', label: 'Español' },
          ]}
        />
        <T v="small" muted>{t('settings.languageHelp')}</T>
      </Card>

      <Card style={{ gap: 4 }}>
        <T v="eyebrow">{t('settings.business')}</T>
        <T v="h3">{sample.business.name}</T>
        <T v="small" muted>{sample.business.phone}</T>
      </Card>

      <Card style={{ gap: 6 }}>
        <T v="eyebrow">{t('settings.priceList')}</T>
        {sample.priceList.map((item) => (
          <LineRow
            key={item.id}
            label={item.name}
            sub={item.unit === 'flat' ? undefined : t(`estimate.units.${item.unit}`)}
            value={f.money(item.unitCents)}
          />
        ))}
      </Card>

      <Card style={{ gap: 8 }}>
        <T v="eyebrow">{t('settings.payments')}</T>
        <SwitchRow label={t('settings.cardFee')} help={t('settings.cardFeeHelp')} value={state.cardFee} onChange={actions.setCardFee} />
      </Card>

      <Hair />
      <Notice text={t('settings.about')} icon="info" tone="soft" />
    </Screen>
  );
}
