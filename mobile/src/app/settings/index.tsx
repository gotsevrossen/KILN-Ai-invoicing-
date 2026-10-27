import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Hair, ListRow, Notice, PageHeader, Screen, Segmented, SwitchRow, T } from '@/components/ui';
import { aiReady } from '@/data/ai';
import { useAuth } from '@/data/auth';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { loadVoiceLang, saveVoiceLang, type VoiceLang } from '@/lib/voice';
import { useThemeMode } from '@/theme/theme-mode';

/** Settings home: language right here, everything else one tap away on its own page. */
export default function Settings() {
  const { t, lang, setLang } = useLang();
  const { state, actions } = useStore();
  const auth = useAuth();
  const theme = useThemeMode();
  const s = state.settings;
  const [voiceLang, setVoiceLang] = useState<VoiceLang>(loadVoiceLang);
  const unpriced = state.priceList.filter((i) => i.unitCents === null).length;

  return (
    <Screen
      header={
        <PageHeader title={t('settings.title')} back={() => router.back()} />
      }>

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
        <T v="label" style={{ marginTop: 4 }}>{t('voice.langSetting')}</T>
        <Segmented
          label={t('voice.langSetting')}
          value={voiceLang}
          onChange={(v) => {
            setVoiceLang(v);
            saveVoiceLang(v);
          }}
          options={[
            { key: 'app', label: t('voice.sameAsApp') },
            { key: 'en', label: 'English' },
            { key: 'es', label: 'Español' },
          ]}
        />
        <T v="small" muted>{t('voice.langHelp')}</T>
      </Card>

      <Card style={{ gap: 12 }}>
        <T v="eyebrow">{t('settings.theme')}</T>
        <Segmented
          label={t('settings.theme')}
          value={theme.mode}
          onChange={theme.setMode}
          options={[
            { key: 'light', label: t('settings.themeLight') },
            { key: 'dark', label: t('settings.themeDark') },
            { key: 'system', label: t('settings.themeSystem') },
          ]}
        />
      </Card>

      <Card style={{ gap: 4 }}>
        <ListRow
          icon="tool"
          title={t('settings.trades')}
          sub={state.profile.trades.map((id) => t(`trades.${id}`)).join(', ')}
          onPress={() => router.push('/settings/trades')}
        />
        <Hair />
        <ListRow
          icon="tag"
          iconTone={unpriced > 0 ? 'flag' : 'soft'}
          title={t('settings.priceList')}
          sub={unpriced > 0 ? t('settings.needPrices', { count: unpriced }) : t('settings.itemCount', { count: state.priceList.length })}
          onPress={() => router.push('/settings/prices')}
        />
        <Hair />
        <ListRow
          icon="percent"
          title={t('settings.pricing')}
          sub={t('settings.pricingSub', { markup: s.markupBps / 100, tax: s.tax.rateBps / 100 })}
          onPress={() => router.push('/settings/pricing')}
        />
        <Hair />
        <ListRow
          icon="credit-card"
          title={t('settings.payments')}
          sub={`${t('settings.due')}: ${s.dueDays === 0 ? t('settings.dueOnReceipt') : t('settings.dueDays', { days: s.dueDays })}`}
          onPress={() => router.push('/settings/payments')}
        />
      </Card>

      {aiReady(state.mode) ? (
        <Card style={{ gap: 12 }}>
          <T v="eyebrow">{t('ai.settingsTitle')}</T>
          <SwitchRow label={t('ai.scopeSetting')} help={t('ai.scopeSettingHelp')} value={state.aiScope} onChange={actions.setAiScope} />
          <T v="small" muted>{t('ai.settingsHelp')}</T>
        </Card>
      ) : null}

      <Card style={{ gap: 8 }}>
        <T v="eyebrow">{t('settings.business')}</T>
        <T v="h3">{state.profile.businessName}</T>
        {state.profile.phone ? <T v="small" muted>{state.profile.phone}</T> : null}
        {auth.configured ? (
          <Button label={t('auth.signOut')} icon="log-out" variant="outline" onPress={() => auth.signOut().then(() => router.replace('/sign-in'))} />
        ) : (
          <Button
            label={t('settings.redoSetup')}
            icon="refresh-cw"
            variant="outline"
            onPress={() => {
              actions.redoSetup();
              router.replace('/setup');
            }}
          />
        )}
      </Card>

      {state.mode === 'example' ? <>
        <Hair />
        <Notice text={t('settings.about')} icon="info" tone="soft" />
      </> : null}
    </Screen>
  );
}
