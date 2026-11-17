import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Hair, ListRow, Notice, PageHeader, Screen, Segmented, SwitchRow, T } from '@/components/ui';
import { aiReady } from '@/data/ai';
import { useAuth } from '@/data/auth';
import { useStore } from '@/data/store';
import { saveTeamSettings, type TeamSettings } from '@/data/team-access';
import { teamText } from '@/features/team/text';
import { refreshTeam, useTeam } from '@/features/team/use-team';
import { can } from '@/lib/permissions';
import { useLang } from '@/i18n';
import { userError } from '@/lib/user-errors';
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
  const [error, setError] = useState<string | null>(null);
  const unpriced = state.priceList.filter((i) => i.unitCents === null).length;
  const team = useTeam();
  const c = teamText(lang);
  const owner = can(auth.role, 'businessSettings');
  const [teamError, setTeamError] = useState<string | null>(null);
  const setTeam = (patch: Partial<TeamSettings>) => {
    if (!team.businessId) return;
    setTeamError(null);
    saveTeamSettings(team.businessId, patch).then(refreshTeam, (e: unknown) => setTeamError(userError(t, e)));
  };

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

      {team.businessId && owner && team.data ? (
        <Card style={{ gap: 12 }}>
          <T v="eyebrow">{c.teamSection}</T>
          <SwitchRow label={c.hasTeam} help={c.hasTeamHelp} value={team.data.settings.hasTeam} onChange={(hasTeam) => setTeam({ hasTeam })} />
          {team.data.settings.hasTeam ? <>
            <SwitchRow label={c.crewPrices} help={c.crewPricesHelp} value={team.data.settings.crewSeesPrices} onChange={(crewSeesPrices) => setTeam({ crewSeesPrices })} />
            <SwitchRow label={c.managerCosts} help={c.managerCostsHelp} value={team.data.settings.managersSeeCosts} onChange={(managersSeeCosts) => setTeam({ managersSeeCosts })} />
          </> : null}
          {teamError ? <Notice text={teamError} tone="danger" icon="alert-circle" /> : null}
        </Card>
      ) : null}

      <Card style={{ gap: 4 }}>
        {can(auth.role, 'seeCosts', { managersSeeCosts: team.data?.settings.managersSeeCosts }) ? <>
          <ListRow icon="users" title={t('improvements.operations')} sub={t('improvements.operationsHelp')} onPress={() => router.push('/operations')} />
          <Hair />
        </> : null}
        <ListRow icon="layers" title={t('improvements.packages')} sub={t('improvements.packagesHelp')} onPress={() => router.push('/settings/packages')} />
        <Hair />
        {owner ? <>
          <ListRow
            icon="tool"
            title={t('settings.trades')}
            sub={state.profile.trades.map((id) => t(`trades.${id}`)).join(', ')}
            onPress={() => router.push('/settings/trades')}
          />
          <Hair />
        </> : null}
        <ListRow
          icon="tag"
          iconTone={unpriced > 0 ? 'flag' : 'soft'}
          title={t('settings.priceList')}
          sub={unpriced > 0 ? t('settings.needPrices', { count: unpriced }) : t('settings.itemCount', { count: state.priceList.length })}
          onPress={() => router.push('/settings/prices')}
        />
        {owner ? <>
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
        </> : null}
      </Card>

      {!owner ? <Notice text={c.ownerOnly} tone="soft" icon="lock" /> : null}

      {aiReady(state.mode) && owner ? (
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
          <>
            {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
            <Button label={t('auth.signOut')} icon="log-out" variant="outline" onPress={() => {
              setError(null);
              void auth.signOut().then(() => router.replace('/sign-in')).catch((e: unknown) => setError(userError(t, e)));
            }} />
          </>
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
